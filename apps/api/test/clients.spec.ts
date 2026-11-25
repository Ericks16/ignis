import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { normalizeName } from '../src/common/helpers';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };

describe('normalizeName (unitaria)', () => {
  it('quita acentos, mayúsculas y espacios repetidos', () => {
    expect(normalizeName('  AUTOLÍDER   Guamaní ')).toBe('autolider guamani');
  });
});

describe('Clientes, contactos e instalaciones (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const agents: Record<string, ReturnType<typeof request.agent>> = {};

  async function agentFor(role: Role) {
    const email = `${role.toLowerCase()}@c.local`;
    await prisma.user.create({ data: { email, name: role, role, passwordHash: await bcrypt.hash(PASS, 4) } });
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
    agents[role] = a;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const r of [Role.ADMIN, Role.OPERATIVO, Role.TECNICO, Role.CONSULTA]) await agentFor(r);
  });
  afterAll(async () => { await app.close(); });

  const admin = () => agents.ADMIN;
  let clientId: string;

  it('sin sesión: 401', async () => {
    await request(app.getHttpServer()).get('/api/clients').expect(401);
  });

  it('permisos: Técnico y Consulta leen pero no escriben; Operativo escribe', async () => {
    for (const r of ['TECNICO', 'CONSULTA']) {
      await agents[r].get('/api/clients').expect(200);
      await agents[r].post('/api/clients').set(H).send({ commercialName: 'No Debe Crear' }).expect(403);
    }
    const res = await agents.OPERATIVO.post('/api/clients').set(H).send({ commercialName: 'Cliente Operativo SA' }).expect(201);
    expect(res.body.id).toBeDefined();
  });

  it('crea cliente con validación, y recorta/normaliza campos', async () => {
    await admin().post('/api/clients').set(H).send({ commercialName: 'A' }).expect(400);
    await admin().post('/api/clients').set(H).send({ commercialName: 'Valido SA', ruc: '123' }).expect(400);
    await admin().post('/api/clients').set(H).send({ commercialName: 'Valido SA', email: 'no-es-correo' }).expect(400);
    const res = await admin().post('/api/clients').set(H)
      .send({ commercialName: '  Autolíder Guamaní  ', ruc: '1790012345001', city: 'Quito', email: 'info@autolider.test', phone: '' })
      .expect(201);
    clientId = res.body.id;
    expect(res.body.commercialName).toBe('Autolíder Guamaní');
    expect(res.body.phone).toBeNull();
    expect(res.body.status).toBe('ACTIVE');
  });

  it('detecta duplicados por nombre equivalente y RUC repetido', async () => {
    const dup = await admin().post('/api/clients').set(H).send({ commercialName: 'AUTOLIDER GUAMANI' }).expect(409);
    expect(dup.body.message).toMatch(/nombre equivalente/);
    await admin().post('/api/clients').set(H).send({ commercialName: 'AUTOLIDER GUAMANI', allowDuplicate: true }).expect(201);
    await admin().post('/api/clients').set(H).send({ commercialName: 'Otro Distinto', ruc: '1790012345001' }).expect(409);
  });

  it('busca, filtra y pagina', async () => {
    for (let i = 1; i <= 25; i++) await admin().post('/api/clients').set(H).send({ commercialName: `Paginado ${String(i).padStart(2, '0')}`, city: 'Ambato' }).expect(201);
    const p1 = await admin().get('/api/clients?search=paginado&pageSize=10&page=1').expect(200);
    expect(p1.body.total).toBe(25);
    expect(p1.body.items).toHaveLength(10);
    const p3 = await admin().get('/api/clients?search=paginado&pageSize=10&page=3').expect(200);
    expect(p3.body.items).toHaveLength(5);
    const byCity = await admin().get('/api/clients?city=quito').expect(200);
    expect(byCity.body.items.map((c: any) => c.id)).toContain(clientId);
    const byRuc = await admin().get('/api/clients?search=1790012345').expect(200);
    expect(byRuc.body.total).toBe(1);
    await admin().get('/api/clients?pageSize=1000').expect(400);
  });

  it('contactos: se crean sin notificaciones por defecto y se pueden desactivar', async () => {
    const c = await admin().post(`/api/clients/${clientId}/contacts`).set(H).send({ name: 'María Pérez', email: 'maria@autolider.test', position: 'Jefa de mantenimiento' }).expect(201);
    expect(c.body.receivesNotifications).toBe(false);
    const up = await admin().patch(`/api/contacts/${c.body.id}`).set(H).send({ receivesNotifications: true }).expect(200);
    expect(up.body.receivesNotifications).toBe(true);
    await admin().patch(`/api/contacts/${c.body.id}`).set(H).send({ active: false }).expect(200);
    const detail = await admin().get(`/api/clients/${clientId}`).expect(200);
    expect(detail.body.contacts[0].active).toBe(false);
    await agents.CONSULTA.post(`/api/clients/${clientId}/contacts`).set(H).send({ name: 'X Y' }).expect(403);
  });

  it('un cliente tiene múltiples instalaciones; valida y filtra', async () => {
    await admin().post('/api/installations').set(H).send({ clientId, name: '' }).expect(400);
    await admin().post('/api/installations').set(H).send({ clientId: '00000000-0000-4000-8000-000000000000', name: 'Matriz' }).expect(404);
    const a = await admin().post('/api/installations').set(H).send({ clientId, name: 'Matriz', type: 'Matriz', city: 'Quito' }).expect(201);
    await admin().post('/api/installations').set(H).send({ clientId, name: 'Sucursal Norte', type: 'Sucursal' }).expect(201);
    await agents.TECNICO.post('/api/installations').set(H).send({ clientId, name: 'No' }).expect(403);
    const list = await agents.TECNICO.get(`/api/installations?clientId=${clientId}`).expect(200);
    expect(list.body.total).toBe(2);
    expect((await admin().get(`/api/clients/${clientId}`)).body._count.installations).toBe(2);
    const s = await admin().get('/api/installations?search=norte').expect(200);
    expect(s.body.items[0].client.commercialName).toBe('Autolíder Guamaní');
    await admin().patch(`/api/installations/${a.body.id}`).set(H).send({ address: 'Av. Principal 123' }).expect(200);
  });

  it('desactivar/reactivar cliente (eliminación lógica) y bloqueo de nuevas instalaciones', async () => {
    await admin().post(`/api/clients/${clientId}/deactivate`).set(H).expect(200);
    expect(await prisma.client.count({ where: { id: clientId } })).toBe(1); // sigue existiendo
    const inactive = await admin().get('/api/clients?status=INACTIVE').expect(200);
    expect(inactive.body.items.map((c: any) => c.id)).toContain(clientId);
    const r = await admin().post('/api/installations').set(H).send({ clientId, name: 'Bodega' }).expect(400);
    expect(r.body.message).toMatch(/inactivo/);
    await agents.CONSULTA.post(`/api/clients/${clientId}/reactivate`).set(H).expect(403);
    await admin().post(`/api/clients/${clientId}/reactivate`).set(H).expect(200);
    await admin().post('/api/installations').set(H).send({ clientId, name: 'Bodega' }).expect(201);
  });

  it('no existe DELETE físico de clientes', async () => {
    await admin().delete(`/api/clients/${clientId}`).set(H).expect(404);
  });

  it('historial registra quién hizo qué', async () => {
    await admin().patch(`/api/clients/${clientId}`).set(H).send({ phone: '022222222' }).expect(200);
    const h = await admin().get(`/api/clients/${clientId}/history`).expect(200);
    const actions = h.body.map((x: any) => x.action);
    expect(actions).toEqual(expect.arrayContaining(['client.created', 'client.updated', 'client.deactivated', 'client.reactivated', 'contact.created', 'installation.created']));
    expect(h.body[0].actor).toBe('ADMIN');
  });

  it('rechaza campos desconocidos y ids inválidos', async () => {
    await admin().post('/api/clients').set(H).send({ commercialName: 'Con Extra', status: 'INACTIVE' }).expect(400);
    await admin().get('/api/clients/abc').expect(400);
    await admin().get('/api/clients/00000000-0000-4000-8000-000000000000').expect(404);
  });
});
