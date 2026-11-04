// Models layer: entity shapes, constants and DTO mappers. No I/O, no imports from other layers.

const ORDER_STATUSES = ['received', 'preparing', 'ready', 'served'];
const PAYMENT_METHODS = ['pay_at_table', 'simulated_online'];
const EMAIL_STATUSES = ['pending', 'sent', 'failed'];

class AppError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
const ValidationError = (message, details) => new AppError(400, 'validation_error', message, details);
const NotFound = (what) => new AppError(404, 'not_found', `${what} not found`);

const dollars = cents => Math.round(cents) / 100;

/** Menu item entity (row) -> public DTO. Option prices are stored in cents, exposed in dollars. */
function toMenuItemDto(row) {
  return {
    id: row.id, cat: row.category_id, name: row.name, desc: row.description,
    price: dollars(row.price_cents), emoji: row.emoji, hue: row.hue, tags: row.tags || [],
    options: (row.options || []).map(g => ({
      name: g.name, type: g.type, required: !!g.required,
      choices: g.choices.map(c => ({ n: c.n, p: dollars(c.cents) })),
    })),
  };
}

function toOrderDto(order, items) {
  return {
    id: order.id, number: order.number, table: order.table_number, name: order.customer_name || '',
    status: order.status, paymentMethod: order.payment_method, paymentStatus: order.payment_status,
    placedAt: new Date(order.created_at).getTime(),
    sub: dollars(order.subtotal_cents), tax: dollars(order.tax_cents), total: dollars(order.total_cents),
    lines: (items || []).map(i => ({ name: i.name, emoji: i.emoji, qty: i.qty, mods: i.mods, note: i.note, total: dollars(i.line_total_cents) })),
  };
}

module.exports = { ORDER_STATUSES, PAYMENT_METHODS, EMAIL_STATUSES, AppError, ValidationError, NotFound, dollars, toMenuItemDto, toOrderDto };
