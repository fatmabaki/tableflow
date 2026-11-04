// CLI: node scripts/db.js migrate | seed | setup (migrate + seed)
const { migrate } = require('../src/data/migrate');
const { seed } = require('../src/data/seed');
const db = require('../src/data/db');

(async () => {
  const cmd = process.argv[2];
  if (!['migrate', 'seed', 'setup'].includes(cmd)) { console.error('Usage: node scripts/db.js migrate|seed|setup'); process.exit(2); }
  if (cmd !== 'seed') await migrate();
  if (cmd !== 'migrate') await seed();
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.close());
