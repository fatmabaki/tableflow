// Business logic for email: templates + enqueueing. Endpoints/services only ENQUEUE; the worker sends.
const config = require('../config');
const { emailRepo } = require('../data/repositories');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$' + (c / 100).toFixed(2);

function enqueue({ to, subject, html, text }, client) {
  return emailRepo.enqueue({ to, subject, html, text, maxAttempts: config.email.maxAttempts }, client);
}

function orderSummary(order, items) {
  const rows = items.map(i => `<li>${i.qty}× ${esc(i.name)}${i.mods ? ` (${esc(i.mods)})` : ''} — ${money(i.line_total_cents)}</li>`).join('');
  const text = items.map(i => `${i.qty}x ${i.name}${i.mods ? ` (${i.mods})` : ''} - ${money(i.line_total_cents)}`).join('\n');
  return { rows, text };
}

/** Customer confirmation (if they gave an email) and a staff notification (if NOTIFY_EMAIL is set). */
async function enqueueOrderPlaced(order, items, client) {
  const { rows, text } = orderSummary(order, items);
  const payment = order.payment_status === 'paid_simulated' ? 'Paid (SIMULATED — no real payment taken)' : 'Pay at the table';
  const jobs = [];
  if (order.customer_email) {
    jobs.push(await enqueue({
      to: order.customer_email, subject: `Your ${config.restaurant.name} order #${order.number}`,
      html: `<h2>Thanks${order.customer_name ? ', ' + esc(order.customer_name) : ''}!</h2><p>Order <b>#${order.number}</b> for table ${order.table_number} was received.</p><ul>${rows}</ul><p><b>Total ${money(order.total_cents)}</b> — ${payment}</p><p style="color:#888">Demo student project.</p>`,
      text: `Order #${order.number}, table ${order.table_number}\n${text}\nTotal ${money(order.total_cents)} - ${payment}`,
    }, client));
  }
  if (config.email.notifyTo) {
    jobs.push(await enqueue({
      to: config.email.notifyTo, subject: `New order #${order.number} — table ${order.table_number}`,
      html: `<p>New order <b>#${order.number}</b>, table ${order.table_number}</p><ul>${rows}</ul><p>Total ${money(order.total_cents)} (${payment})</p>`,
      text: `New order #${order.number}, table ${order.table_number}\n${text}\nTotal ${money(order.total_cents)}`,
    }, client));
  }
  return jobs;
}

async function enqueueOrderReady(order) {
  if (!order.customer_email) return null;
  return enqueue({
    to: order.customer_email, subject: `Order #${order.number} is ready`,
    html: `<p>Your order <b>#${order.number}</b> is ready at table ${order.table_number}. Enjoy!</p>`,
    text: `Your order #${order.number} is ready at table ${order.table_number}.`,
  });
}

async function stats() {
  const out = { pending: 0, sent: 0, failed: 0 };
  for (const r of await emailRepo.counts()) out[r.status] = r.n;
  return out;
}

module.exports = { enqueue, enqueueOrderPlaced, enqueueOrderReady, stats };
