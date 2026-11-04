const config = require('../config');
const { healthRepo } = require('../data/repositories');

const DB_TIMEOUT_MS = 2000;

/** Returns {httpOk, body}. The database check is bounded so a hung DB yields 503, not a hung probe. */
async function check() {
  const started = Date.now();
  let database;
  try {
    await Promise.race([
      healthRepo.ping(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('database check timed out')), DB_TIMEOUT_MS).unref()),
    ]);
    database = { status: 'up', latencyMs: Date.now() - started };
  } catch (err) {
    database = { status: 'down', error: err.message };
  }
  const healthy = database.status === 'up';
  return {
    httpOk: healthy,
    body: {
      status: healthy ? 'ok' : 'unhealthy',
      app: { name: config.app.name, version: config.app.version, env: config.app.env, uptimeSeconds: Math.round(process.uptime()) },
      database,
      timestamp: new Date().toISOString(),
    },
  };
}

module.exports = { check };
