// PostgreSQL local embebido para desarrollo (alternativa a docker-compose).
const EmbeddedPostgres = require('embedded-postgres').default;
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

async function main() {
  const dir = resolve(__dirname, '../.pgdata');
  const fresh = !existsSync(dir);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'ignis', password: 'ignis', port: 5433, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('ignis');
  console.log('PostgreSQL de desarrollo listo en postgresql://ignis:ignis@localhost:5433/ignis (Ctrl+C para detener)');
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
