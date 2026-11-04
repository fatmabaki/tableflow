// Data layer: repositories. All SQL in the project lives in src/data. Each function accepts an optional
// transaction client as its last argument so services can compose them atomically.
const db = require('./db');

const run = (client, text, params) => (client || db).query(text, params);

const healthRepo = {
  async ping() { await db.query('SELECT 1'); },
};

const menuRepo = {
  async listCategories() {
    return (await db.query('SELECT id, name FROM categories ORDER BY sort_order, name')).rows;
  },
  async listAvailableItems() {
    return (await db.query('SELECT * FROM menu_items WHERE available ORDER BY sort_order, name')).rows;
  },
  async findAvailableByIds(ids, client) {
    return (await run(client, 'SELECT * FROM menu_items WHERE available AND id = ANY($1)', [ids])).rows;
  },
};

const tableRepo = {
  async list() { return (await db.query('SELECT number FROM restaurant_tables ORDER BY number')).rows; },
  async findByNumber(number, client) {
    return (await run(client, 'SELECT id, number FROM restaurant_tables WHERE number = $1', [number])).rows[0] || null;
  },
};

const ORDER_SELECT = `SELECT o.*, t.number AS table_number FROM orders o JOIN restaurant_tables t ON t.id = o.table_id`;

const orderRepo = {
  async insert(o, client) {
    const { rows } = await run(client,
      `INSERT INTO orders (table_id, customer_name, customer_email, payment_method, payment_status, subtotal_cents, tax_cents, total_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [o.tableId, o.customerName, o.customerEmail, o.paymentMethod, o.paymentStatus, o.subtotalCents, o.taxCents, o.totalCents]);
    return rows[0].id;
  },
  async insertItems(orderId, lines, client) {
    for (const l of lines) {
      await run(client,
        `INSERT INTO order_items (order_id, menu_item_id, name, emoji, qty, unit_price_cents, mods, note, line_total_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orderId, l.menuItemId, l.name, l.emoji, l.qty, l.unitPriceCents, l.mods, l.note, l.lineTotalCents]);
    }
  },
  async findById(id, client) {
    return (await run(client, `${ORDER_SELECT} WHERE o.id = $1`, [id])).rows[0] || null;
  },
  async findItems(orderId, client) {
    return (await run(client, 'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId])).rows;
  },
  async listOpen() {
    return (await db.query(`${ORDER_SELECT} WHERE o.status <> 'served' OR o.updated_at > now() - interval '1 hour' ORDER BY o.created_at DESC LIMIT 100`)).rows;
  },
  async updateStatus(id, status) {
    return (await db.query(`UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`, [id, status])).rows[0] || null;
  },
  /** Demo-only simulation: derive status from order age. Returns orders that changed. */
  async autoAdvanceByAge() {
    return (await db.query(`
      UPDATE orders SET status = s.target, updated_at = now()
      FROM (SELECT id, CASE WHEN age > 35 THEN 'served' WHEN age > 20 THEN 'ready' WHEN age > 6 THEN 'preparing' ELSE 'received' END AS target
            FROM (SELECT id, EXTRACT(EPOCH FROM now() - created_at) AS age FROM orders WHERE status <> 'served') x) s
      WHERE orders.id = s.id AND orders.status <> s.target AND
        array_position(ARRAY['received','preparing','ready','served'], s.target) > array_position(ARRAY['received','preparing','ready','served'], orders.status)
      RETURNING orders.id, orders.status`)).rows;
  },
};

const paymentRepo = {
  async insertSimulated(orderId, amountCents, client) {
    await run(client, `INSERT INTO payments (order_id, provider, status, amount_cents) VALUES ($1,'simulated','paid_simulated',$2)`, [orderId, amountCents]);
  },
};

const emailRepo = {
  async enqueue({ to, subject, html, text, maxAttempts }, client) {
    return (await run(client,
      `INSERT INTO email_jobs (to_email, subject, html, text_body, max_attempts) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [to, subject, html, text || '', maxAttempts])).rows[0];
  },
  /** Atomically leases due jobs: bumps attempts and pushes next_attempt_at out so a crashed worker's job reappears. */
  async claimDue(limit, leaseSeconds) {
    return (await db.query(
      `UPDATE email_jobs SET attempts = attempts + 1, next_attempt_at = now() + ($2 || ' seconds')::interval
       WHERE id IN (SELECT id FROM email_jobs WHERE status = 'pending' AND next_attempt_at <= now()
                    ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING *`, [limit, String(leaseSeconds)])).rows;
  },
  async markSent(id, providerId) {
    await db.query(`UPDATE email_jobs SET status = 'sent', sent_at = now(), provider_id = $2, last_error = NULL WHERE id = $1`, [id, providerId || null]);
  },
  async markRetry(id, error, delaySeconds) {
    await db.query(`UPDATE email_jobs SET last_error = $2, next_attempt_at = now() + ($3 || ' seconds')::interval WHERE id = $1`, [id, error, String(delaySeconds)]);
  },
  async markFailed(id, error) {
    await db.query(`UPDATE email_jobs SET status = 'failed', last_error = $2 WHERE id = $1`, [id, error]);
  },
  async findById(id) { return (await db.query('SELECT * FROM email_jobs WHERE id = $1', [id])).rows[0] || null; },
  async counts() {
    return (await db.query(`SELECT status, count(*)::int AS n FROM email_jobs GROUP BY status`)).rows;
  },
};

module.exports = { healthRepo, menuRepo, tableRepo, orderRepo, paymentRepo, emailRepo, withTransaction: db.withTransaction };
