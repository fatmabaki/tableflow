// Central environment configuration. No secrets live in code; see .env.example.
const fs = require('fs');
const path = require('path');

// Tiny .env loader (dev convenience). Real environment variables always win.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const e = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(+v) ? +v : d);

module.exports = {
  app: { name: 'tableflow', version: require('../package.json').version, env: e.NODE_ENV || 'development' },
  port: num(e.PORT, 5173),
  db: {
    // Either a single DATABASE_URL (hosted platforms) or discrete PG* settings.
    connectionString: e.DATABASE_URL || undefined,
    host: e.PGHOST || 'localhost',
    port: num(e.PGPORT, 5432),
    user: e.PGUSER || 'tableflow',
    password: e.PGPASSWORD || '',
    database: e.PGDATABASE || 'tableflow',
    ssl: e.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  restaurant: { name: 'Olive & Ember', taxRate: 0.08 },
  staffApiKey: e.STAFF_API_KEY || '',
  corsOrigin: e.CORS_ORIGIN || '*',
  email: {
    resendApiKey: e.RESEND_API_KEY || '',
    from: e.EMAIL_FROM || 'TableFlow <onboarding@resend.dev>',
    notifyTo: e.NOTIFY_EMAIL || '',
    maxAttempts: num(e.EMAIL_MAX_ATTEMPTS, 4), // 1 first try + 3 retries
    retryBaseMs: num(e.EMAIL_RETRY_BASE_MS, 30000),
    pollMs: num(e.EMAIL_POLL_MS, 3000),
    workerEnabled: e.EMAIL_WORKER !== 'false',
  },
  // Demo only: moves orders through received->preparing->ready->served by age so tracking works without kitchen staff.
  demoAutoAdvance: e.DEMO_AUTO_ADVANCE !== 'false',
};
