// One-command local start: embedded PostgreSQL -> migrate -> seed -> app. Ctrl+C stops everything.
// (Use `npm start` instead if you have your own PostgreSQL configured in .env.)
const { startDevDb } = require('./dev-db');

(async () => {
  const pg = await startDevDb();
  const { migrate } = require('../src/data/migrate');
  const { seed } = require('../src/data/seed');
  await migrate();
  await seed();
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await pg.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  process.env.TF_MANAGED_SHUTDOWN = '1';
  require('../src/server');
})().catch(e => { console.error('[dev] failed to start:', e.message); process.exit(1); });
