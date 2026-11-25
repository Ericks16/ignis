const EmbeddedPostgres = require('embedded-postgres').default;
const { execFileSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

// Levanta un PostgreSQL temporal y aplica las migraciones reales antes de las pruebas.
function freePort() {
  return new Promise((res, rej) => {
    const s = require('node:net').createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

module.exports = async function globalSetup() {
  const port = await freePort(); // evita choques con ejecuciones anteriores
  const dir = mkdtempSync(join(tmpdir(), 'ignis-test-pg-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'test', password: 'test', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ignis_test');
  const url = `postgresql://test:test@localhost:${port}/ignis_test`;
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_MODE = 'test';
  process.env.CRON_SECRET = 'test-cron-secret-0123456789abcdef';
  process.env.APP_URL = 'http://app.ignis.test';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.RATE_LIMIT_GLOBAL = '100000'; // las pruebas de límites usan valores propios
  process.env.RATE_LIMIT_LOGIN = '100000';
  execFileSync(process.execPath, [resolve(__dirname, '../../../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  globalThis.__PG__ = pg;
};
