// API layer: request validation. Turns untrusted JSON into clean DTOs or throws a 400 ValidationError.
const { ValidationError, PAYMENT_METHODS, ORDER_STATUSES } = require('../models');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function uuidParam(v) {
  if (!UUID.test(v || '')) throw ValidationError('Invalid id');
  return v;
}

function createOrderDto(body) {
  if (!isObj(body)) throw ValidationError('JSON body required');
  const table = Number(body.table);
  if (!Number.isInteger(table) || table < 1 || table > 9999) throw ValidationError('table must be a positive integer');
  const paymentMethod = body.paymentMethod ?? 'pay_at_table';
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw ValidationError(`paymentMethod must be one of ${PAYMENT_METHODS.join(', ')}`);
  const email = str(body.email, 120);
  if (email && !EMAIL.test(email)) throw ValidationError('email is not valid');
  // Real card details are never accepted. Reject loudly if a client tries to send any.
  for (const k of ['card', 'cardNumber', 'cvc', 'cvv', 'expiry']) if (k in body) throw ValidationError('Card details are not accepted (payments are simulated)');
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 40) throw ValidationError('lines must contain 1-40 items');
  const lines = body.lines.map((l, i) => {
    if (!isObj(l)) throw ValidationError(`lines[${i}] invalid`);
    const qty = Number(l.qty);
    if (typeof l.itemId !== 'string' || !l.itemId || l.itemId.length > 40) throw ValidationError(`lines[${i}].itemId invalid`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw ValidationError(`lines[${i}].qty must be 1-20`);
    const sel = {};
    if (l.sel !== undefined && !isObj(l.sel)) throw ValidationError(`lines[${i}].sel invalid`);
    for (const [k, v] of Object.entries(l.sel || {})) {
      if (!/^\d{1,2}$/.test(k) || !Array.isArray(v) || v.length > 10 || !v.every(n => Number.isInteger(n) && n >= 0 && n < 50)) throw ValidationError(`lines[${i}].sel invalid`);
      sel[+k] = v;
    }
    return { itemId: l.itemId, qty, sel, note: str(l.note, 140) };
  });
  return { table, name: str(body.name, 30), email: email || null, paymentMethod, lines };
}

function statusDto(body) {
  if (!isObj(body) || !ORDER_STATUSES.includes(body.status)) throw ValidationError(`status must be one of ${ORDER_STATUSES.join(', ')}`);
  return body.status;
}

module.exports = { uuidParam, createOrderDto, statusDto };
