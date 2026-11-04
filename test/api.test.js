// Integration tests against a real PostgreSQL (see README/PROGRESS: `npm run dev:db`, then `npm test`).
// Uses a separate database (<PGDATABASE>_test) that is created, migrated and seeded automatically.
process.env.PGDATABASE = (process.env.PGDATABASE || 'tableflow') + '_test';
process.env.STAFF_API_KEY = 'test-staff-key';
process.env.NOTIFY_EMAIL = 'kitchen@example.com';
process.env.EMAIL_RETRY_BASE_MS = '1';
process.env.EMAIL_WORKER = 'false';
process.env.DEMO_AUTO_ADVANCE = 'false';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');
const config = require('../src/config');

let server, base, db, worker, createApp;

async function ensureDatabase() {
  const admin = new Client({ ...config.db, database: 'postgres' });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.db.database]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${config.db.database}"`);
  await admin.end();
}

const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const staff = { 'x-staff-key': 'test-staff-key' };
const burger = { itemId: 'm4', qty: 2, sel: { 0: [1], 1: [0] }, note: 'no onions' }; // Medium + Bacon => 19.00 + 2.50

before(async () => {
  await ensureDatabase();
  db = require('../src/data/db');
  await require('../src/data/migrate').migrate(() => {});
  await require('../src/data/seed').seed(() => {});
  await db.query('TRUNCATE orders, email_jobs CASCADE');
  worker = require('../src/services/emailWorker');
  createApp = require('../src/api/app').createApp;
  server = http.createServer(createApp()).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { server.close(); await db.close(); });

test('GET /health is 200 with app + database status', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.database.status, 'up');
  assert.equal(r.body.app.name, 'tableflow');
});

test('GET /health is 503 when the database is unreachable', async () => {
  const child = spawn(process.execPath, ['-e', `
    process.env.PGPORT='1'; process.env.PGHOST='127.0.0.1';
    const http=require('http'); const s=http.createServer(require('./src/api/app').createApp()).listen(0,()=>{
      fetch('http://127.0.0.1:'+s.address().port+'/health').then(async r=>{console.log(JSON.stringify({s:r.status,b:await r.json()}));process.exit(0)});
    });`], { cwd: path.join(__dirname, '..') });
  let out = ''; child.stdout.on('data', d => out += d);
  await new Promise(r => child.on('exit', r));
  const { s, b } = JSON.parse(out.trim().split('\n').pop());
  assert.equal(s, 503);
  assert.equal(b.status, 'unhealthy');
  assert.equal(b.database.status, 'down');
});

test('GET /api/menu returns seeded categories, items and tables', async () => {
  const r = await call('GET', '/api/menu');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 15);
  assert.equal(r.body.tables.length, 12);
  const m4 = r.body.items.find(i => i.id === 'm4');
  assert.equal(m4.price, 19);
  assert.equal(m4.options[1].choices[0].p, 2.5);
});

test('POST /api/orders prices server-side, stores order, enqueues emails atomically', async () => {
  const r = await call('POST', '/api/orders', { table: 7, name: 'Sam', email: 'sam@example.com', paymentMethod: 'simulated_online', lines: [burger, { itemId: 's1', qty: 1 }] });
  assert.equal(r.status, 201);
  assert.equal(r.body.sub, 52.5);
  assert.equal(r.body.tax, 4.2);
  assert.equal(r.body.total, 56.7);
  assert.equal(r.body.paymentStatus, 'paid_simulated');
  assert.equal(r.body.status, 'received');
  assert.equal(r.body.lines[0].mods, 'Medium, Bacon');
  const got = await call('GET', '/api/orders/' + r.body.id);
  assert.equal(got.body.number, r.body.number);
  const jobs = await db.query(`SELECT to_email, status FROM email_jobs ORDER BY created_at`);
  assert.deepEqual(jobs.rows.map(j => j.to_email).sort(), ['kitchen@example.com', 'sam@example.com']);
  assert.ok(jobs.rows.every(j => j.status === 'pending'));
  const pay = await db.query('SELECT provider, status FROM payments WHERE order_id = $1', [r.body.id]);
  assert.deepEqual(pay.rows[0], { provider: 'simulated', status: 'paid_simulated' });
});

test('order validation: client prices ignored, bad input rejected, card details refused', async () => {
  const bad = [
    { table: 7, lines: [] },
    { table: 99, lines: [{ itemId: 's1', qty: 1 }] },
    { table: 7, lines: [{ itemId: 'nope', qty: 1 }] },
    { table: 7, lines: [{ itemId: 'm4', qty: 1 }] }, // required options missing
    { table: 7, lines: [{ itemId: 's1', qty: 0 }] },
    { table: 7, email: 'not-an-email', lines: [{ itemId: 's1', qty: 1 }] },
    { table: 7, lines: [{ itemId: 's1', qty: 1 }], cardNumber: '4242424242424242' },
  ];
  for (const b of bad) assert.equal((await call('POST', '/api/orders', b)).status, 400, JSON.stringify(b));
  const r = await call('POST', '/api/orders', { table: 7, lines: [{ itemId: 's1', qty: 1, price: 0.01 }] });
  assert.equal(r.body.total, 10.26); // 9.50 + 8%
  assert.equal(r.body.paymentStatus, 'unpaid');
  assert.equal((await call('GET', '/api/orders/not-a-uuid')).status, 400);
  assert.equal((await call('GET', '/api/orders/00000000-0000-4000-8000-000000000000')).status, 404);
});

test('staff endpoints require the key and can advance status (ready enqueues email)', async () => {
  assert.equal((await call('GET', '/api/staff/orders')).status, 401);
  assert.equal((await call('GET', '/api/staff/orders', null, { 'x-staff-key': 'wrong' })).status, 401);
  const o = await call('POST', '/api/orders', { table: 3, email: 'a@b.co', lines: [{ itemId: 'k2', qty: 1 }] });
  const before = (await db.query(`SELECT count(*)::int n FROM email_jobs`)).rows[0].n;
  const r = await call('PATCH', `/api/staff/orders/${o.body.id}/status`, { status: 'ready' }, staff);
  assert.equal(r.body.status, 'ready');
  assert.equal((await db.query(`SELECT count(*)::int n FROM email_jobs`)).rows[0].n, before + 1);
  assert.equal((await call('PATCH', `/api/staff/orders/${o.body.id}/status`, { status: 'bogus' }, staff)).status, 400);
  assert.ok((await call('GET', '/api/staff/orders', null, staff)).body.length > 0);
});

test('email worker: marks sent, records provider id', async () => {
  await db.query('TRUNCATE email_jobs');
  const { enqueue } = require('../src/services/emailService');
  const job = await enqueue({ to: 'x@y.co', subject: 's', html: '<p>h</p>' });
  const res = await worker.processBatch(async () => ({ id: 'resend_123' }));
  assert.deepEqual(res, { sent: 1, retried: 0, failed: 0 });
  const row = (await db.query('SELECT * FROM email_jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(row.status, 'sent');
  assert.equal(row.provider_id, 'resend_123');
  assert.equal(row.attempts, 1);
});

test('email worker: retries 3 times after the first failure, then succeeds', async () => {
  await db.query('TRUNCATE email_jobs');
  const { enqueue } = require('../src/services/emailService');
  const job = await enqueue({ to: 'x@y.co', subject: 's', html: 'h' });
  let calls = 0;
  const flaky = async () => { if (++calls < 4) throw new Error('Resend 500: boom'); return { id: 'ok' }; };
  for (let i = 0; i < 4; i++) { await worker.processBatch(flaky); await new Promise(r => setTimeout(r, 20)); }
  const row = (await db.query('SELECT * FROM email_jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(calls, 4);
  assert.equal(row.status, 'sent');
  assert.equal(row.attempts, 4);
});

test('email worker: permanently failing job ends "failed" after 4 attempts with the error saved', async () => {
  await db.query('TRUNCATE email_jobs');
  const { enqueue } = require('../src/services/emailService');
  const job = await enqueue({ to: 'x@y.co', subject: 's', html: 'h' });
  let calls = 0;
  for (let i = 0; i < 6; i++) { await worker.processBatch(async () => { calls++; throw new Error('Resend 422: invalid'); }); await new Promise(r => setTimeout(r, 20)); }
  const row = (await db.query('SELECT * FROM email_jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(calls, 4);
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 4);
  assert.match(row.last_error, /422/);
});

test('Resend adapter sends the documented request (bearer key, from, to, subject) and surfaces API errors', async () => {
  const { sendViaResend } = require('../src/services/mailer');
  config.email.resendApiKey = 're_test_placeholder';
  config.email.from = 'TableFlow <orders@example.com>';
  let seen;
  const ok = async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ id: 'abc123' }) }; };
  assert.deepEqual(await sendViaResend({ to: 'a@b.co', subject: 'Hi', html: '<p>x</p>', text: 'x' }, ok), { id: 'abc123' });
  assert.equal(seen.url, 'https://api.resend.com/emails');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer re_test_placeholder');
  assert.deepEqual([seen.body.from, seen.body.to, seen.body.subject], ['TableFlow <orders@example.com>', ['a@b.co'], 'Hi']);
  const bad = async () => ({ ok: false, status: 403, json: async () => ({ message: 'domain not verified' }) });
  await assert.rejects(sendViaResend({ to: 'a@b.co', subject: 's', html: 'h' }, bad), /Resend 403: domain not verified/);
  config.email.resendApiKey = '';
});

test('placing an order never sends email from the request path (only enqueues)', async () => {
  await db.query('TRUNCATE email_jobs');
  config.email.resendApiKey = 're_test_placeholder';
  const realFetch = global.fetch; let resendCalls = 0;
  global.fetch = async (u, i) => { if (String(u).includes('resend.com')) { resendCalls++; } return realFetch(u, i); };
  try {
    const r = await call('POST', '/api/orders', { table: 2, email: 'z@y.co', lines: [{ itemId: 'k2', qty: 1 }] });
    assert.equal(r.status, 201);
    assert.equal(resendCalls, 0);
    assert.equal((await db.query(`SELECT count(*)::int n FROM email_jobs WHERE status='pending'`)).rows[0].n, 2);
  } finally { global.fetch = realFetch; config.email.resendApiKey = ''; }
});

test('CORS headers allow the UI to call the API from another origin', async () => {
  const res = await fetch(base + '/api/menu', { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('missing RESEND_API_KEY is recorded as a failure, never a fake success', async () => {
  await db.query('TRUNCATE email_jobs');
  const { enqueue } = require('../src/services/emailService');
  const job = await enqueue({ to: 'x@y.co', subject: 's', html: 'h' });
  await worker.processBatch(); // real mailer, no key configured in tests
  const row = (await db.query('SELECT status, last_error FROM email_jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(row.status, 'pending');
  assert.match(row.last_error, /RESEND_API_KEY/);
});
