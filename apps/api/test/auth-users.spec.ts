import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };

describe('Auth y usuarios (integración con PostgreSQL real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function mkUser(email: string, role: Role, extra: Partial<{ active: boolean }> = {}) {
    return prisma.user.create({ data: { email, name: email.split('@')[0], role, passwordHash: await bcrypt.hash(PASS, 4), ...extra } });
  }
  async function login(email: string, password = PASS) {
    const agent = request.agent(server());
    const res = await agent.post('/api/auth/login').set(H).send({ email, password });
    return { agent, res };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await mkUser('admin@t.local', Role.ADMIN);
    await mkUser('tec@t.local', Role.TECNICO);
    await mkUser('off@t.local', Role.CONSULTA, { active: false });
  });
  afterAll(async () => { await app.close(); });

  it('health: liveness y readiness con BD real', async () => {
    await request(server()).get('/health').expect(200, { status: 'ok' });
    const ready = await request(server()).get('/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('rutas protegidas devuelven 401 sin sesión', async () => {
    await request(server()).get('/api/auth/me').expect(401);
    await request(server()).get('/api/users').expect(401);
    await request(server()).get('/api/dashboard/summary').expect(401);
  });

  it('login correcto: cookie HttpOnly y sin passwordHash', async () => {
    const { res } = await login('admin@t.local');
    expect(res.status).toBe(200);
    expect(res.body.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/ignis_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('login incorrecto, usuario inexistente e inactivo: 401 genérico', async () => {
    expect((await login('admin@t.local', 'mala')).res.status).toBe(401);
    expect((await login('nadie@t.local')).res.status).toBe(401);
    expect((await login('off@t.local')).res.status).toBe(401);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    await mkUser('lock@t.local', Role.CONSULTA);
    for (let i = 0; i < 5; i++) await login('lock@t.local', 'mala');
    const { res } = await login('lock@t.local'); // aun con la clave correcta
    expect(res.status).toBe(401); // misma respuesta genérica: no se revela el bloqueo
  });

  it('CSRF: mutaciones sin cabecera X-Requested-With son rechazadas', async () => {
    await request(server()).post('/api/auth/login').send({ email: 'admin@t.local', password: PASS }).expect(403);
  });

  it('logout invalida la sesión en el servidor', async () => {
    const { agent } = await login('admin@t.local');
    await agent.get('/api/auth/me').expect(200);
    const token = (await prisma.session.findFirst({ orderBy: { createdAt: 'desc' } }))!;
    await agent.post('/api/auth/logout').set(H).expect(204);
    await agent.get('/api/auth/me').expect(401);
    expect(await prisma.session.findUnique({ where: { id: token.id } })).toBeNull();
  });

  it('RBAC en backend: técnico no puede gestionar usuarios; admin sí', async () => {
    const tec = (await login('tec@t.local')).agent;
    await tec.get('/api/users').expect(403);
    await tec.post('/api/users').set(H).send({ email: 'x@t.local', name: 'X Y', role: 'CONSULTA', password: PASS }).expect(403);
    await tec.get('/api/dashboard/summary').expect(200);
    const admin = (await login('admin@t.local')).agent;
    const list = await admin.get('/api/users').expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash/);
  });

  it('admin crea usuario, valida entradas y detecta duplicados', async () => {
    const admin = (await login('admin@t.local')).agent;
    await admin.post('/api/users').set(H).send({ email: 'malo', name: 'A', role: 'ADMIN', password: '123' }).expect(400);
    const ok = await admin.post('/api/users').set(H).send({ email: 'Nuevo@T.local', name: 'Nuevo Usuario', role: 'OPERATIVO', password: PASS }).expect(201);
    expect(ok.body.email).toBe('nuevo@t.local');
    expect(ok.body.mustChangePassword).toBe(true);
    await admin.post('/api/users').set(H).send({ email: 'nuevo@t.local', name: 'Nuevo Usuario', role: 'OPERATIVO', password: PASS }).expect(409);
    expect(await prisma.auditLog.count({ where: { action: 'user.created' } })).toBeGreaterThan(0);
  });

  it('no permite quitar el último administrador ni auto-desactivarse', async () => {
    const admin = (await login('admin@t.local')).agent;
    const me = (await admin.get('/api/auth/me')).body;
    await admin.patch(`/api/users/${me.id}`).set(H).send({ active: false }).expect(400);
    await admin.patch(`/api/users/${me.id}`).set(H).send({ role: 'CONSULTA' }).expect(400);
  });

  it('desactivar un usuario cierra sus sesiones', async () => {
    const admin = (await login('admin@t.local')).agent;
    const victim = await mkUser('victim@t.local', Role.TECNICO);
    const v = (await login('victim@t.local')).agent;
    await v.get('/api/auth/me').expect(200);
    await admin.patch(`/api/users/${victim.id}`).set(H).send({ active: false }).expect(200);
    await v.get('/api/auth/me').expect(401);
  });

  it('cambio de contraseña: valida la actual, aplica política y cierra otras sesiones', async () => {
    await mkUser('pw@t.local', Role.CONSULTA);
    const a = (await login('pw@t.local')).agent;
    const b = (await login('pw@t.local')).agent;
    await a.post('/api/auth/change-password').set(H).send({ currentPassword: 'incorrecta', newPassword: 'NuevaClave-123' }).expect(400);
    await a.post('/api/auth/change-password').set(H).send({ currentPassword: PASS, newPassword: 'corta' }).expect(400);
    await a.post('/api/auth/change-password').set(H).send({ currentPassword: PASS, newPassword: 'NuevaClave-123' }).expect(204);
    await a.get('/api/auth/me').expect(200);
    await b.get('/api/auth/me').expect(401);
    expect((await login('pw@t.local', 'NuevaClave-123')).res.status).toBe(200);
  });

  it('errores internos no filtran detalles; validación rechaza campos extra', async () => {
    const admin = (await login('admin@t.local')).agent;
    await admin.post('/api/users').set(H).send({ email: 'z@t.local', name: 'Zeta Z', role: 'CONSULTA', password: PASS, isAdmin: true }).expect(400);
    await admin.get('/api/users/no-es-uuid').expect(400);
  });
});
