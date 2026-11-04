// Forward-only SQL migration runner. Files in ./migrations run in name order, each in a transaction.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = path.join(__dirname, 'migrations');

async function migrate(log = console.log) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const applied = [];
  for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    await db.withTransaction(async c => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    log(`[migrate] applied ${file}`);
    applied.push(file);
  }
  if (!applied.length) log('[migrate] database is up to date');
  return applied;
}

module.exports = { migrate };
