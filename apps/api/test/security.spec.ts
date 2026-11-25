import 'reflect-metadata';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import pino from 'pino';
import { Writable } from 'node:stream';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { resetEnvCache } from '../src/config/env';
import { MAX_UNCOMPRESSED_BYTES, assertZipSafe } from '../src/imports/excel.reader';
import { REDACT_PATHS } from '../src/common/logging';
import { PrismaService } from '../src/prisma/prisma.service';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };
const UUID = '00000000-0000-4000-8000-000000000001';
const ORIGIN = 'http://localhost:5173';

/** Levanta una app con variables de entorno específicas (y las restaura al cerrar). */
async function makeApp(env: Record<string, string> = {}) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  resetEnvCache();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return {
    app, prisma: app.get(PrismaService),
    async close() { await app.close(); for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } resetEnvCache(); },
  };
}
const mkUser = async (prisma: PrismaService, email: string, role: Role, name = email) => prisma.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(PASS, 4) } });

// ---------------------------------------------------------------------------------------------------------------
// Matriz de permisos: A=Administrador, O=Operativo, T=Técnico, C=Consulta. Cada ruta del backend debe aparecer aquí.
// ---------------------------------------------------------------------------------------------------------------
const ALL = 'AOTC'; const STAFF = 'AOC'; const W = 'AO'; const FS = 'AOT'; const A = 'A';
const MATRIX: [string, string, string][] = [
  ['GET', 'users', A], ['GET', 'users/:id', A], ['POST', 'users', A], ['PATCH', 'users/:id', A], ['POST', 'users/:id/reset-password', A], ['GET', 'user-options', ALL],
  ['GET', 'clients', ALL], ['GET', 'clients/:id', ALL], ['GET', 'clients/:id/history', ALL], ['POST', 'clients', W], ['PATCH', 'clients/:id', W], ['POST', 'clients/:id/deactivate', W], ['POST', 'clients/:id/reactivate', W],
  ['POST', 'clients/:id/contacts', W], ['PATCH', 'contacts/:id', W],
  ['GET', 'installations', ALL], ['GET', 'installations/:id', ALL], ['POST', 'installations', W], ['PATCH', 'installations/:id', W], ['POST', 'installations/:id/deactivate', W], ['POST', 'installations/:id/reactivate', W],
  ['GET', 'systems', ALL], ['GET', 'systems/:id', ALL], ['POST', 'systems', W], ['PATCH', 'systems/:id', W], ['POST', 'systems/:id/deactivate', W], ['POST', 'systems/:id/reactivate', W], ['POST', 'systems/:id/equipment', W], ['PATCH', 'equipment/:id', W],
  ['GET', 'catalogs/:kind', ALL], ['POST', 'catalogs/:kind', A], ['PATCH', 'catalogs/:kind/:id', A],
  ['GET', 'technicians/options', ALL], ['GET', 'technicians', ALL], ['GET', 'technicians/:id', ALL], ['POST', 'technicians', W], ['PATCH', 'technicians/:id', W], ['POST', 'technicians/:id/deactivate', W], ['POST', 'technicians/:id/reactivate', W],
  ['GET', 'maintenances', ALL], ['GET', 'maintenances/:id', ALL], ['GET', 'maintenances/:id/history', ALL], ['POST', 'maintenances', W], ['PATCH', 'maintenances/:id', FS], ['POST', 'maintenances/:id/start', FS],
  ['POST', 'maintenances/:id/complete', FS], ['POST', 'maintenances/:id/status', W], ['POST', 'maintenances/:id/cancel', W], ['POST', 'maintenances/:id/reschedule', W],
  ['GET', 'follow-ups', ALL], ['GET', 'follow-ups/:id', ALL], ['GET', 'follow-ups/:id/history', ALL], ['POST', 'follow-ups', W], ['PATCH', 'follow-ups/:id', W], ['POST', 'follow-ups/:id/status', W],
  ['GET', 'follow-up-statuses', ALL], ['POST', 'follow-up-statuses', A], ['PATCH', 'follow-up-statuses/:id', A],
  ['GET', 'activities', ALL], ['POST', 'activities', FS], ['PATCH', 'activities/:id', FS],
  ['GET', 'calendar', ALL],
  ['GET', 'notifications', STAFF], ['GET', 'notifications/runs', STAFF], ['POST', 'notifications/run', A], ['POST', 'notifications/:id/retry', W],
  ['GET', 'settings/reminders', W], ['GET', 'settings/reminders/status', W], ['PUT', 'settings/reminders', A],
  ['GET', 'imports', A], ['POST', 'imports', A], ['GET', 'imports/template.xlsx', A], ['GET', 'imports/:id', A], ['GET', 'imports/:id/sheet', A], ['GET', 'imports/:id/preview', A], ['POST', 'imports/:id/preview', A],
  ['POST', 'imports/:id/confirm', A], ['POST', 'imports/:id/cancel', A], ['GET', 'imports/:id/report.xlsx', A],
  // El reporte de prueba es «clients» (solo personal interno); los reportes abiertos al técnico se cubren en reports.spec.ts.
  ['GET', 'reports', ALL], ['GET', 'reports/:key', STAFF], ['GET', 'reports/:key/export', STAFF],
  ['GET', 'dashboard/summary', ALL],
];
/** Rutas que no usan la sesión de usuario (cada una tiene su propia protección). */
const PUBLIC_ROUTES = ['POST auth/login', 'POST internal/cron/reminders'];
/** Autenticadas para cualquier rol (no dependen del rol). */
const ANY_AUTH = ['GET auth/me', 'POST auth/logout', 'POST auth/change-password'];

const ROLE_BY_LETTER: Record<string, Role> = { A: Role.ADMIN, O: Role.OPERATIVO, T: Role.TECNICO, C: Role.CONSULTA };
const fill = (p: string) => '/api/' + p.replace(/:(\w+)/g, (_, n) => (n === 'kind' ? 'system-categories' : n === 'key' ? 'clients' : UUID)) + (p.endsWith('/export') ? '?format=csv' : '');

function discoverRoutes(app: INestApplication): string[] {
  const methods: Record<number, string> = { [RequestMethod.GET]: 'GET', [RequestMethod.POST]: 'POST', [RequestMethod.PUT]: 'PUT', [RequestMethod.PATCH]: 'PATCH', [RequestMethod.DELETE]: 'DELETE' };
  const out = new Set<string>();
  for (const mod of app.get(ModulesContainer).values()) {
    for (const ctrl of mod.controllers.values()) {
      const type = ctrl.metatype as { prototype: Record<string, unknown> } | null;
      if (!type) continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, type) ?? '';
      for (const name of Object.getOwnPropertyNames(type.prototype)) {
        const h = type.prototype[name];
        if (typeof h !== 'function') continue;
        const m = Reflect.getMetadata(METHOD_METADATA, h);
        if (m === undefined) continue;
        const sub = Reflect.getMetadata(PATH_METADATA, h) ?? '';
        const path = [prefix, sub].filter((s) => s && s !== '/').join('/').replace(/^\//, '');
        if (path.startsWith('health')) continue; // fuera del prefijo /api y públicas
        out.add(`${methods[m]} ${path}`);
      }
    }
  }
  return [...out].sort();
}

describe('Seguridad: permisos por rol en TODAS las rutas', () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  const ag: Record<string, ReturnType<typeof request.agent>> = {};

  beforeAll(async () => {
    ctx = await makeApp();
    for (const [letter, role] of Object.entries(ROLE_BY_LETTER)) {
      await mkUser(ctx.prisma, `${role.toLowerCase()}@sec.local`, role);
      const a = request.agent(ctx.app.getHttpServer());
      await a.post('/api/auth/login').set(H).send({ email: `${role.toLowerCase()}@sec.local`, password: PASS }).expect(200);
      ag[letter] = a;
    }
  });
  afterAll(async () => { await ctx.close(); });

  it('cobertura: cada ruta del backend está en la matriz de permisos (una ruta nueva sin clasificar rompe la prueba)', () => {
    const real = discoverRoutes(ctx.app);
    const known = new Set([...MATRIX.map(([m, p]) => `${m} ${p}`), ...PUBLIC_ROUTES, ...ANY_AUTH]);
    const missing = real.filter((r) => !known.has(r));
    const stale = [...known].filter((r) => !real.includes(r));
    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  it('sin sesión, TODAS las rutas protegidas devuelven 401', async () => {
    const http = request(ctx.app.getHttpServer());
    const call = (m: string, p: string) => ({ GET: http.get, POST: http.post, PUT: http.put, PATCH: http.patch, DELETE: http.delete } as Record<string, typeof http.get>)[m].call(http, fill(p)).set(H);
    const routes = [...MATRIX.map(([m, p]) => [m, p]), ...ANY_AUTH.map((r) => r.split(' '))];
    const bad: string[] = [];
    for (const [m, p] of routes) { const res = await call(m, p).send(m === 'GET' ? undefined : {}); if (res.status !== 401) bad.push(`${m} ${p} → ${res.status}`); }
    expect(bad).toEqual([]);
  });

  it('cada rol recibe 403 en lo que no le corresponde (y nunca 401/403 en lo permitido)', async () => {
    const bad: string[] = [];
    for (const [method, path, allowed] of MATRIX) {
      for (const letter of Object.keys(ROLE_BY_LETTER)) {
        const a = ag[letter];
        const url = fill(path);
        const req = method === 'GET' ? a.get(url) : method === 'POST' ? a.post(url).set(H).send({}) : method === 'PUT' ? a.put(url).set(H).send({}) : a.patch(url).set(H).send({});
        const res = await req;
        const should = allowed.includes(letter);
        if (should && (res.status === 401 || res.status === 403)) bad.push(`${ROLE_BY_LETTER[letter]} debería poder ${method} /${path} pero recibió ${res.status}`);
        if (!should && res.status !== 403) bad.push(`${ROLE_BY_LETTER[letter]} NO debería poder ${method} /${path} y recibió ${res.status}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('las rutas públicas no exigen sesión pero tienen su propia protección', async () => {
    const http = request(ctx.app.getHttpServer());
    await http.post('/api/auth/login').set(H).send({ email: 'nadie@x.test', password: 'x' }).expect(401);
    await http.post('/api/internal/cron/reminders').expect(401); // sin secreto
    await http.get('/health').expect(200);
  });

  it('escalada de privilegios: un usuario sin rol de administrador no puede darse ni dar permisos', async () => {
    const me = (await ag.O.get('/api/auth/me')).body;
    await ag.O.patch(`/api/users/${me.id}`).set(H).send({ role: 'ADMIN' }).expect(403);
    await ag.T.patch(`/api/users/${me.id}`).set(H).send({ role: 'ADMIN' }).expect(403);
    await ag.O.post('/api/users').set(H).send({ email: 'x@y.test', name: 'X Y', role: 'ADMIN', password: PASS }).expect(403);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: me.id } })).role).toBe('OPERATIVO');
  });
});

describe('Seguridad: sesiones, autenticación y cookies', () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  beforeAll(async () => { ctx = await makeApp(); await mkUser(ctx.prisma, 'u1@auth.local', Role.OPERATIVO, 'Uno'); await mkUser(ctx.prisma, 'u2@auth.local', Role.CONSULTA, 'Dos'); });
  afterAll(async () => { await ctx.close(); });
  const login = (email: string, password = PASS) => request(ctx.app.getHttpServer()).post('/api/auth/login').set(H).send({ email, password });

  it('cookie de sesión: HttpOnly, SameSite=Lax, ruta /; el token en la BD está hasheado (no coincide con la cookie)', async () => {
    const res = await login('u1@auth.local').expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^ignis_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    const token = /ignis_session=([^;]+)/.exec(cookie)![1];
    const stored = await ctx.prisma.session.findMany({ select: { tokenHash: true } });
    expect(stored.some((s) => s.tokenHash === token)).toBe(false);
    expect(stored.every((s) => /^[0-9a-f]{64}$/.test(s.tokenHash))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|bcrypt|\$2[aby]\$/);
  });

  it('cada inicio de sesión genera un token distinto (no hay fijación de sesión)', async () => {
    const a = ((await login('u1@auth.local')).headers['set-cookie'] as unknown as string[])[0];
    const b = ((await login('u1@auth.local')).headers['set-cookie'] as unknown as string[])[0];
    expect(a.split(';')[0]).not.toBe(b.split(';')[0]);
  });

  it('un token inventado, vacío o manipulado no abre sesión', async () => {
    const http = request(ctx.app.getHttpServer());
    for (const c of ['ignis_session=abc', 'ignis_session=', `ignis_session=${'a'.repeat(43)}`, 'ignis_session=../../etc/passwd', "ignis_session=' OR '1'='1"]) await http.get('/api/auth/me').set('Cookie', c).expect(401);
  });

  it('una sesión vencida deja de valer', async () => {
    const agent = request.agent(ctx.app.getHttpServer());
    await agent.post('/api/auth/login').set(H).send({ email: 'u2@auth.local', password: PASS }).expect(200);
    await agent.get('/api/auth/me').expect(200);
    await ctx.prisma.session.updateMany({ where: { user: { email: 'u2@auth.local' } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get('/api/auth/me').expect(401);
  });

  it('el mensaje de error de inicio de sesión no revela si el correo existe, si está inactivo o bloqueado', async () => {
    await mkUser(ctx.prisma, 'off@auth.local', Role.CONSULTA, 'Inactivo');
    await ctx.prisma.user.update({ where: { email: 'off@auth.local' }, data: { active: false } });
    await mkUser(ctx.prisma, 'lock@auth.local', Role.CONSULTA, 'Bloqueable');
    const samples = [
      await login('noexiste@auth.local'), await login('u1@auth.local', 'incorrecta'), await login('off@auth.local'),
    ];
    for (let i = 0; i < 5; i++) await login('lock@auth.local', 'mala');
    samples.push(await login('lock@auth.local')); // clave correcta pero cuenta bloqueada
    expect(new Set(samples.map((r) => r.status))).toEqual(new Set([401]));
    expect(new Set(samples.map((r) => r.body.message)).size).toBe(1);
  });

  it('entradas con tipos inesperados no llegan a la lógica (inyección de operadores / arreglos)', async () => {
    const http = request(ctx.app.getHttpServer());
    await http.post('/api/auth/login').set(H).send({ email: 'u1@auth.local' }).expect(400);
    await http.post('/api/auth/login').set(H).send({ email: { $ne: null }, password: { $ne: null } }).expect(400);
    await http.post('/api/auth/login').set(H).send({ email: ['a@b.co'], password: [PASS] }).expect(400);
    await http.post('/api/auth/login').set(H).send({ email: 'u1@auth.local', password: 'x'.repeat(5000) }).expect(400);
  });

  it('cuerpos JSON enormes se rechazan (413)', async () => {
    const res = await request(ctx.app.getHttpServer()).post('/api/auth/login').set(H).send({ email: 'a@b.co', password: 'x'.repeat(2 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe('Seguridad: cabeceras, CORS y CSRF', () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  const agent = () => request.agent(ctx.app.getHttpServer());
  beforeAll(async () => { ctx = await makeApp(); await mkUser(ctx.prisma, 'c@cors.local', Role.ADMIN); });
  afterAll(async () => { await ctx.close(); });

  it('cabeceras de seguridad (Helmet) y sin huella del framework', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-frame-options']).toBeTruthy();
  });

  it('CORS: solo se permite el origen configurado, con credenciales', async () => {
    const ok = await request(ctx.app.getHttpServer()).get('/health').set('Origin', ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(ctx.app.getHttpServer()).get('/health').set('Origin', 'http://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(ctx.app.getHttpServer()).options('/api/clients').set('Origin', 'http://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CSRF: sin la cabecera personalizada o desde otro origen, las mutaciones se rechazan aunque haya cookie válida', async () => {
    const a = agent();
    await a.post('/api/auth/login').set(H).send({ email: 'c@cors.local', password: PASS }).expect(200);
    const body = { commercialName: 'Cliente CSRF SA' };
    await a.post('/api/clients').send(body).expect(403); // formulario cross-site: no puede poner X-Requested-With
    await a.post('/api/clients').set({ ...H, Origin: 'http://evil.example' }).send(body).expect(403);
    await a.post('/api/clients').set({ ...H, Origin: ORIGIN }).send(body).expect(201);
    expect(await ctx.prisma.client.count({ where: { commercialName: 'Cliente CSRF SA' } })).toBe(1);
  });

  it('las lecturas (GET) no cambian datos', async () => {
    const a = agent();
    await a.post('/api/auth/login').set(H).send({ email: 'c@cors.local', password: PASS }).expect(200);
    const before = await ctx.prisma.client.count();
    for (const p of ['/api/clients', '/api/dashboard/summary', '/api/reports/clients', '/api/notifications']) await a.get(p).expect(200);
    expect(await ctx.prisma.client.count()).toBe(before);
  });
});

describe('Seguridad: límite de peticiones (rate limiting)', () => {
  it('el inicio de sesión se limita por IP (aun con credenciales correctas)', async () => {
    const ctx = await makeApp({ RATE_LIMIT_LOGIN: '3', RATE_LIMIT_GLOBAL: '1000' });
    try {
      await mkUser(ctx.prisma, 'rl@rate.local', Role.CONSULTA);
      const http = request(ctx.app.getHttpServer());
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await http.post('/api/auth/login').set(H).send({ email: 'rl@rate.local', password: i < 2 ? 'mala-clave' : PASS })).status);
      expect(statuses.slice(0, 3)).toEqual([401, 401, 200]);
      expect(statuses.slice(3)).toEqual([429, 429]);
    } finally { await ctx.close(); }
  });

  it('el límite general protege el resto de la API', async () => {
    const ctx = await makeApp({ RATE_LIMIT_GLOBAL: '5', RATE_LIMIT_LOGIN: '1000' });
    try {
      await mkUser(ctx.prisma, 'rg@rate.local', Role.ADMIN);
      const agent = request.agent(ctx.app.getHttpServer());
      await agent.post('/api/auth/login').set(H).send({ email: 'rg@rate.local', password: PASS }).expect(200);
      const codes: number[] = [];
      for (let i = 0; i < 8; i++) codes.push((await agent.get('/api/clients')).status);
      expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(5);
      expect(codes.at(-1)).toBe(429);
      expect((await request(ctx.app.getHttpServer()).get('/health')).status).toBe(200); // la salud nunca se limita
    } finally { await ctx.close(); }
  });
});

describe('Seguridad: modo producción', () => {
  it('cookie con prefijo __Host-, Secure, HttpOnly, Path=/ y sin Domain', async () => {
    const ctx = await makeApp({ NODE_ENV: 'production', RATE_LIMIT_LOGIN: '1000' });
    try {
      await mkUser(ctx.prisma, 'p@prod.local', Role.ADMIN);
      const res = await request(ctx.app.getHttpServer()).post('/api/auth/login').set(H).send({ email: 'p@prod.local', password: PASS }).expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^__Host-ignis_session=/);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\//i);
      expect(cookie).not.toMatch(/Domain=/i);
      // al cerrar sesión se borra con los mismos atributos
      const token = /__Host-ignis_session=([^;]+)/.exec(cookie)![1];
      const out = await request(ctx.app.getHttpServer()).post('/api/auth/logout').set(H).set('Cookie', `__Host-ignis_session=${token}`).expect(204);
      expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^__Host-ignis_session=;/);
      // una cookie con el nombre de desarrollo ya no vale en producción
      await request(ctx.app.getHttpServer()).get('/api/auth/me').set('Cookie', `ignis_session=${token}`).expect(401);
    } finally { await ctx.close(); }
  });
});

describe('Seguridad: manejo de errores y datos hostiles', () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  let admin: ReturnType<typeof request.agent>;
  beforeAll(async () => {
    ctx = await makeApp();
    await mkUser(ctx.prisma, 'a@err.local', Role.ADMIN);
    admin = request.agent(ctx.app.getHttpServer());
    await admin.post('/api/auth/login').set(H).send({ email: 'a@err.local', password: PASS }).expect(200);
  });
  afterAll(async () => { await ctx.close(); });

  it('un error interno no filtra detalles (SQL, rutas, stack): respuesta genérica 500', async () => {
    const spy = jest.spyOn(ctx.prisma, '$transaction').mockRejectedValueOnce(new Error('relation "Client" does not exist at /srv/app/secret/path.ts SELECT * FROM "User"'));
    const res = await admin.get('/api/clients').expect(500);
    spy.mockRestore();
    expect(res.body).toEqual({ statusCode: 500, message: 'Error interno del servidor' });
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|relation|secret|\.ts|stack/i);
  });

  it('rutas inexistentes y métodos no soportados devuelven 404 sin detalles', async () => {
    const res = await admin.get('/api/no/existe').expect(404);
    expect(JSON.stringify(res.body)).not.toMatch(/express|stack|node_modules|\.ts:/i);
  });

  it('inyección SQL en búsquedas y filtros: tratada como texto, sin errores ni efectos', async () => {
    const before = await ctx.prisma.client.count();
    for (const evil of ["' OR 1=1 --", '"; DROP TABLE "Client"; --', "%' UNION SELECT * FROM \"User\" --", '\\\\']) {
      const res = await admin.get(`/api/clients?search=${encodeURIComponent(evil)}`).expect(200);
      expect(res.body.total).toBe(0);
      await admin.get(`/api/reports/clients?search=${encodeURIComponent(evil)}`).expect(200);
      await admin.get(`/api/follow-ups?search=${encodeURIComponent(evil)}`).expect(200);
      await admin.get(`/api/maintenances?search=${encodeURIComponent(evil)}`).expect(200);
    }
    expect(await ctx.prisma.client.count()).toBe(before);
    expect((await ctx.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM "User"`)[0].n).toBeGreaterThan(0); // la tabla sigue ahí
    await admin.get('/api/clients?status=ACTIVE%27%20OR%201%3D1').expect(400);
    await admin.get(`/api/clients/${encodeURIComponent("' OR '1'='1")}`).expect(400);
  });

  it('XSS almacenado: el texto se guarda y devuelve como dato JSON (el navegador lo escapa al mostrarlo)', async () => {
    const payload = '<img src=x onerror=alert(1)><script>alert("xss")</script>';
    const created = await admin.post('/api/clients').set(H).send({ commercialName: payload, notes: payload }).expect(201);
    expect(created.headers['content-type']).toMatch(/application\/json/);
    expect(created.headers['x-content-type-options']).toBe('nosniff');
    expect(created.body.commercialName).toBe(payload);
    const csv = await admin.get('/api/reports/clients/export?format=csv').buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/); // no text/html
  });

  it('asignación masiva: campos no permitidos se rechazan (id, estado, claves internas, hash)', async () => {
    await admin.post('/api/clients').set(H).send({ commercialName: 'Mass SA', id: UUID, normalizedName: 'x', importBatchId: UUID, createdAt: '2000-01-01' }).expect(400);
    await admin.post('/api/users').set(H).send({ email: 'm@m.test', name: 'M M', role: 'CONSULTA', password: PASS, passwordHash: 'x', failedLogins: 0 }).expect(400);
    await admin.post('/api/auth/change-password').set(H).send({ currentPassword: PASS, newPassword: 'Nueva-Clave-123', role: 'ADMIN' }).expect(400);
  });

  it('claves peligrosas en la configuración de importación (__proto__, constructor) no contaminan ni rompen el servidor', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('CARTERA');
    ws.addRow(['Cliente', 'CENTRAL']); ws.addRow(['Proto SA', 'DSC 1832']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const up = (await admin.post('/api/imports').set(H).attach('file', buf, 'p.xlsx').expect(201)).body;
    const sheet = (await admin.get(`/api/imports/${up.id}/sheet?name=CARTERA`).expect(200)).body;
    const cfg = {
      sheet: 'CARTERA', headerRow: 1, columns: { client: 1, central: 2 }, equipment: [],
      options: { defaultCategoryId: sheet.defaults.defaultCategoryId, defaultMaintenanceTypeId: sheet.defaults.defaultMaintenanceTypeId, followUpTypeId: sheet.defaults.followUpTypeId },
    };
    const raw = JSON.stringify(cfg).replace(/}$/, `,"centralMap":{"__proto__":{"categoryId":"${UUID}"},"constructor":{"categoryId":"${UUID}"}},"overrides":{"__proto__":{"skip":true}}}`);
    const res = await admin.post(`/api/imports/${up.id}/preview`).set(H).set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBeLessThan(500);
    expect(({} as Record<string, unknown>).categoryId).toBeUndefined();
    expect(({} as Record<string, unknown>).skip).toBeUndefined();
    await admin.post(`/api/imports/${up.id}/cancel`).set(H).expect(200);
  });

  it('archivos .xlsx maliciosos: «bomba zip» (tamaño descomprimido declarado) y exceso de entradas se rechazan antes de abrirlos', async () => {
    const zip = (entries: number, uncompressed: number) => {
      const cd: Buffer[] = [];
      for (let i = 0; i < entries; i++) {
        const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt32LE(uncompressed, 24); cd.push(h);
      }
      const dir = Buffer.concat(cd);
      const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries, 8); eocd.writeUInt16LE(entries, 10); eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(4, 16);
      return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), dir, eocd]);
    };
    const bomb = await admin.post('/api/imports').set(H).attach('file', zip(2, MAX_UNCOMPRESSED_BYTES), 'bomba.xlsx').expect(400);
    expect(bomb.body.message).toMatch(/demasiado grande al descomprimirse/);
    const many = await admin.post('/api/imports').set(H).attach('file', zip(2500, 10), 'muchas.xlsx').expect(400);
    expect(many.body.message).toMatch(/demasiados elementos/);
    expect(() => assertZipSafe(zip(1, 100))).not.toThrow();
    expect(() => assertZipSafe(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow();
    expect(await ctx.prisma.importBatch.count({ where: { fileName: { in: ['bomba.xlsx', 'muchas.xlsx'] } } })).toBe(0);
  });
});

describe('Seguridad: secretos fuera de los logs', () => {
  it('cookies, credenciales y el secreto del cron se redactan en los registros', () => {
    const lines: string[] = [];
    const stream = new Writable({ write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); } });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTADO]' } }, stream);
    log.info({
      req: {
        headers: { cookie: 'ignis_session=TOKEN-SECRETO', authorization: 'Bearer TOKEN-BEARER', 'x-cron-secret': 'CRON-SECRETO', 'x-api-key': 'API-KEY', host: 'localhost' },
        body: { password: 'CLAVE-USUARIO', currentPassword: 'CLAVE-ACTUAL', newPassword: 'CLAVE-NUEVA', email: 'a@b.co' },
      },
      res: { headers: { 'set-cookie': ['ignis_session=TOKEN-NUEVO; HttpOnly'] } },
    }, 'petición');
    const out = lines.join('');
    for (const secret of ['TOKEN-SECRETO', 'TOKEN-BEARER', 'CRON-SECRETO', 'API-KEY', 'CLAVE-USUARIO', 'CLAVE-ACTUAL', 'CLAVE-NUEVA', 'TOKEN-NUEVO']) expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTADO]');
    expect(out).toContain('localhost'); // lo demás sigue visible para depurar
  });
});
