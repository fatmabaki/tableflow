// Data layer: the only module that talks to PostgreSQL.
const { Pool } = require('pg');
const config = require('../config');

let pool;
function getPool() {
  if (!pool) {
    const { connectionString, ssl, ...discrete } = config.db;
    pool = new Pool(connectionString ? { connectionString, ssl } : { ...discrete, ssl });
    pool.on('error', err => console.error('[db] idle client error:', err.message));
  }
  return pool;
}

const query = (text, params) => getPool().query(text, params);

/** Runs fn(client) inside a transaction; commits on success, rolls back on throw. */
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function close() { if (pool) { await pool.end(); pool = null; } }

module.exports = { query, withTransaction, close, getPool };
