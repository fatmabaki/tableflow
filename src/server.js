// Composition root: starts HTTP, the email worker and the demo status ticker.
const config = require('./config');
const { createApp } = require('./api/app');
const emailWorker = require('./services/emailWorker');
const orderService = require('./services/orderService');
const db = require('./data/db');
const { migrate } = require('./data/migrate');

async function main() {
  if (process.env.RUN_MIGRATIONS_ON_START === 'true') await migrate();

  const server = createApp().listen(config.port, () => { // no host: dual-stack (IPv4 + IPv6), so http://localhost works however it resolves
    console.log(`TableFlow listening on :${config.port}  (health: /health)`);
    console.log(`  Demo:  http://localhost:${config.port}/?table=7   QR sheet: /qr.html   Kitchen: /kitchen.html`);
  });

  if (config.email.workerEnabled) emailWorker.start();
  const ticker = setInterval(() => orderService.advanceDemoOrders().catch(e => console.error('[demo-ticker]', e.message)), 2000);
  ticker.unref();

  const shutdown = async sig => {
    console.log(`${sig} received, shutting down`);
    emailWorker.stop(); clearInterval(ticker);
    server.close(async () => { await db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  if (!process.env.TF_MANAGED_SHUTDOWN) { // scripts/dev.js sets this and stops its embedded PostgreSQL itself
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

main().catch(err => { console.error('Fatal startup error:', err); process.exit(1); });
