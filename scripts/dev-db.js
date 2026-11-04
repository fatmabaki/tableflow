// Dev/test convenience: runs a real PostgreSQL (via the embedded-postgres devDependency) on localhost:5432
// when you don't have PostgreSQL installed. Not used in production. Ctrl+C to stop; data persists in .pgdata/.
const path = require('path');
const fs = require('fs');
require('../src/config'); // loads .env so PG* values match the app
const EmbeddedPostgres = require('embedded-postgres').default;

async function startDevDb() {
  const dir = path.join(__dirname, '..', '.pgdata');
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: process.env.PGUSER || 'tableflow', password: process.env.PGPASSWORD || 'tableflow_dev',
    port: Number(process.env.PGPORT) || 5432, persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], // Windows would otherwise default to WIN1252 and reject emoji
    onLog: () => {}, onError: () => {},
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(process.env.PGDATABASE || 'tableflow');
  console.log('[dev-db] PostgreSQL ready on port', process.env.PGPORT || 5432);
  return pg;
}

module.exports = { startDevDb };

if (require.main === module) {
  startDevDb().then(pg => {
    const stop = async () => { await pg.stop(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch(e => { console.error(e); process.exit(1); });
}
