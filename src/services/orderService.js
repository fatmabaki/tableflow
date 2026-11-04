const config = require('../config');
const { menuRepo, tableRepo, orderRepo, withTransaction } = require('../data/repositories');
const { AppError, ValidationError, NotFound, ORDER_STATUSES, toOrderDto } = require('../models');
const paymentService = require('./paymentService');
const emailService = require('./emailService');

/** Server-side pricing + option validation for one cart line. Never trusts client prices. */
function priceLine(line, item) {
  const opts = item.options || [];
  let unit = item.price_cents;
  const mods = [];
  opts.forEach((group, gi) => {
    const picked = [...new Set(line.sel[gi] || [])];
    if (group.required && picked.length === 0) throw ValidationError(`"${item.name}": please choose ${group.name}`);
    if (group.type === 'single' && picked.length > 1) throw ValidationError(`"${item.name}": only one ${group.name} allowed`);
    for (const ci of picked) {
      const choice = group.choices[ci];
      if (!choice) throw ValidationError(`"${item.name}": invalid choice for ${group.name}`);
      unit += choice.cents; mods.push(choice.n);
    }
  });
  Object.keys(line.sel).forEach(k => { if (!opts[+k]) throw ValidationError(`"${item.name}": unknown option group`); });
  return { menuItemId: item.id, name: item.name, emoji: item.emoji, qty: line.qty, unitPriceCents: unit, mods: mods.join(', '), note: line.note, lineTotalCents: unit * line.qty };
}

async function placeOrder(dto) {
  const table = await tableRepo.findByNumber(dto.table);
  if (!table) throw ValidationError(`Unknown table ${dto.table}`);
  const ids = [...new Set(dto.lines.map(l => l.itemId))];
  const items = await menuRepo.findAvailableByIds(ids);
  const byId = new Map(items.map(i => [i.id, i]));
  const lines = dto.lines.map(l => {
    const item = byId.get(l.itemId);
    if (!item) throw ValidationError(`Menu item "${l.itemId}" is not available`);
    return priceLine(l, item);
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const tax = Math.round(subtotal * config.restaurant.taxRate);
  const total = subtotal + tax;
  const paymentStatus = paymentService.statusFor(dto.paymentMethod);

  const orderId = await withTransaction(async client => {
    const id = await orderRepo.insert({
      tableId: table.id, customerName: dto.name, customerEmail: dto.email || null, paymentMethod: dto.paymentMethod,
      paymentStatus, subtotalCents: subtotal, taxCents: tax, totalCents: total,
    }, client);
    await orderRepo.insertItems(id, lines, client);
    if (paymentStatus === 'paid_simulated') await paymentService.recordSimulatedPayment(id, total, client);
    // Outbox: the email job commits atomically with the order; the worker sends it later.
    const row = await orderRepo.findById(id, client);
    await emailService.enqueueOrderPlaced(row, await orderRepo.findItems(id, client), client);
    return id;
  });
  return getOrder(orderId);
}

async function getOrder(id) {
  const row = await orderRepo.findById(id);
  if (!row) throw NotFound('Order');
  return toOrderDto(row, await orderRepo.findItems(id));
}

async function listForStaff() {
  const rows = await orderRepo.listOpen();
  return Promise.all(rows.map(async r => toOrderDto(r, await orderRepo.findItems(r.id))));
}

async function setStatus(id, status) {
  if (!ORDER_STATUSES.includes(status)) throw ValidationError(`status must be one of ${ORDER_STATUSES.join(', ')}`);
  if (!(await orderRepo.updateStatus(id, status))) throw NotFound('Order');
  if (status === 'ready') await emailService.enqueueOrderReady(await orderRepo.findById(id));
  return getOrder(id);
}

/** Demo-only status simulation (DEMO_AUTO_ADVANCE). Called by the background ticker. */
async function advanceDemoOrders() {
  if (!config.demoAutoAdvance) return 0;
  const changed = await orderRepo.autoAdvanceByAge();
  for (const c of changed) if (c.status === 'ready') await emailService.enqueueOrderReady(await orderRepo.findById(c.id));
  return changed.length;
}

module.exports = { placeOrder, getOrder, listForStaff, setStatus, advanceDemoOrders, AppError };
