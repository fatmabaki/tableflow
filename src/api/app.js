// API layer: Express app. Routes, validation, auth and HTTP responses only; business logic is in services.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { AppError } = require('../models');
const v = require('./validators');
const healthService = require('../services/healthService');
const menuService = require('../services/menuService');
const orderService = require('../services/orderService');
const emailService = require('../services/emailService');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/** Staff endpoints need the X-Staff-Key header to match STAFF_API_KEY (constant-time compare). */
function requireStaff(req, res, next) {
  if (!config.staffApiKey) return next(new AppError(503, 'staff_disabled', 'Staff API is disabled: set STAFF_API_KEY'));
  const given = Buffer.from(String(req.get('x-staff-key') || ''));
  const want = Buffer.from(config.staffApiKey);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return next(new AppError(401, 'unauthorized', 'Invalid staff key'));
  next();
}

/** Tiny in-memory limiter for order creation (per IP, per minute). */
function rateLimit(max) {
  const hits = new Map();
  setInterval(() => hits.clear(), 60000).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return next(new AppError(429, 'rate_limited', 'Too many requests, slow down'));
    next();
  };
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '50kb' }));

  // CORS so the UI still works when opened from another origin (e.g. a different dev server port). No cookies are used.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      res.set({ 'Access-Control-Allow-Origin': config.corsOrigin, 'Access-Control-Allow-Headers': 'Content-Type, X-Staff-Key', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  app.get('/health', wrap(async (req, res) => {
    const { httpOk, body } = await healthService.check();
    res.status(httpOk ? 200 : 503).set('Cache-Control', 'no-store').json(body);
  }));

  const api = express.Router();
  api.get('/menu', wrap(async (req, res) => res.json(await menuService.getMenu())));
  api.post('/orders', rateLimit(30), wrap(async (req, res) => {
    const order = await orderService.placeOrder(v.createOrderDto(req.body));
    res.status(201).location(`/api/orders/${order.id}`).json(order);
  }));
  api.get('/orders/:id', wrap(async (req, res) => res.json(await orderService.getOrder(v.uuidParam(req.params.id)))));

  api.get('/staff/orders', requireStaff, wrap(async (req, res) => res.json(await orderService.listForStaff())));
  api.patch('/staff/orders/:id/status', requireStaff, wrap(async (req, res) =>
    res.json(await orderService.setStatus(v.uuidParam(req.params.id), v.statusDto(req.body)))));
  api.get('/staff/email-queue', requireStaff, wrap(async (req, res) => res.json(await emailService.stats())));

  api.use((req, res, next) => next(new AppError(404, 'not_found', 'Unknown API route')));
  app.use('/api', api);

  app.use(express.static(path.join(__dirname, '..', '..', 'public'), { setHeaders: res => res.set('Cache-Control', 'no-cache') }));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') err = new AppError(400, 'bad_json', 'Malformed JSON');
    if (err.type === 'entity.too.large') err = new AppError(413, 'too_large', 'Request too large');
    if (!(err instanceof AppError)) {
      console.error('[error]', err);
      err = new AppError(500, 'internal_error', 'Something went wrong');
    }
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  });
  return app;
}

module.exports = { createApp };
