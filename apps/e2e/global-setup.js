// Levanta un entorno aislado y desechable: PostgreSQL embebido + API + Vite. No toca la base de desarrollo.
const EmbeddedPostgres = require('embedded-postgres').default;
const { execFileSync, spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const net = require('node:net');

const ROOT = resolve(__dirname, '../..');
const API_PORT = 3100;
const WEB_PORT = 5174;
const PASS = 'E2e-Clave-Segura-1';

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

async function waitFor(url, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No respondió a tiempo: ${url}`);
}

module.exports = async function globalSetup() {
  const pgPort = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'ignis-e2e-pg-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'e2e', password: 'e2e', port: pgPort, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ignis_e2e');
  const databaseUrl = `postgresql://e2e:e2e@localhost:${pgPort}/ignis_e2e`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    EMAIL_MODE: 'test', // nunca envía correos reales
    CRON_SECRET: 'e2e-cron-secret-0123456789abcdef',
    APP_URL: `http://localhost:${WEB_PORT}`,
    CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
    RATE_LIMIT_GLOBAL: '100000',
    RATE_LIMIT_LOGIN: '100000',
  };
  const api = resolve(ROOT, 'apps/api');
  execFileSync(process.execPath, [resolve(ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: api, env, stdio: 'inherit' });

  // Usuarios de prueba (solo existen en esta base temporal).
  const { PrismaClient } = require(resolve(ROOT, 'node_modules/@prisma/client'));
  const bcrypt = require(resolve(ROOT, 'node_modules/bcryptjs'));
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const hash = bcrypt.hashSync(PASS, 4);
  const users = [
    ['admin@e2e.test', 'Admin E2E', 'ADMIN', false], ['operativo@e2e.test', 'Operativo E2E', 'OPERATIVO', false],
    ['tecnico@e2e.test', 'Tecnico E2E', 'TECNICO', false], ['consulta@e2e.test', 'Consulta E2E', 'CONSULTA', false],
    ['nuevo@e2e.test', 'Usuario Nuevo', 'ADMIN', true],
  ];
  for (const [email, name, role, mustChangePassword] of users) await prisma.user.create({ data: { email, name, role, passwordHash: hash, mustChangePassword } });
  await prisma.$disconnect();

  const children = [];
  const start = (cmd, args, opts) => { const c = spawn(cmd, args, { stdio: 'ignore', windowsHide: true, ...opts }); children.push(c); return c; };
  start(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/main.ts'], { cwd: api, env });
  start(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(WEB_PORT), '--strictPort'], {
    cwd: resolve(ROOT, 'apps/web'), env: { ...process.env, API_PROXY_TARGET: `http://localhost:${API_PORT}` },
  });
  await waitFor(`http://localhost:${API_PORT}/health`);
  await waitFor(`http://localhost:${WEB_PORT}/`);

  return async () => {
    for (const c of children) { try { process.platform === 'win32' ? execFileSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' }) : c.kill(); } catch { /* ya terminó */ } }
    await pg.stop();
  };
};
