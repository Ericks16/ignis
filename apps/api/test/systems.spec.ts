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

describe('Catálogos, sistemas y dispositivos (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ag: Record<string, ReturnType<typeof request.agent>> = {};
  let installationId: string;
  let categoryId: string;
  let typeId: string;
  let systemId: string;
  let adminId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const r of [Role.ADMIN, Role.OPERATIVO, Role.TECNICO, Role.CONSULTA]) {
      const email = `${r.toLowerCase()}@s.local`;
      const u = await prisma.user.create({ data: { email, name: r, role: r, passwordHash: await bcrypt.hash(PASS, 4) } });
      if (r === Role.ADMIN) adminId = u.id;
      const a = request.agent(app.getHttpServer());
      await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
      ag[r] = a;
    }
    const client = await ag.ADMIN.post('/api/clients').set(H).send({ commercialName: 'Cliente Sistemas SA' }).expect(201);
    const inst = await ag.ADMIN.post('/api/installations').set(H).send({ clientId: client.body.id, name: 'Planta Norte' }).expect(201);
    installationId = inst.body.id;
  });
  afterAll(async () => { await app.close(); });

  it('las 7 categorías oficiales vienen sembradas en la base de datos', async () => {
    const res = await ag.CONSULTA.get('/api/catalogs/system-categories').expect(200);
    const names = res.body.map((c: any) => c.name);
    expect(names).toEqual([
      'TIPO DE CENTRAL', 'BOMBA CI', 'GABINETES', 'LÁMPARAS', 'PARARRAYOS', 'SISTEMA DE DETECCIÓN DE ALARMA', 'RED CONTRA INCENDIOS',
    ]);
    categoryId = res.body[5].id;
    const types = await ag.CONSULTA.get('/api/catalogs/equipment-types').expect(200);
    expect(types.body.length).toBeGreaterThanOrEqual(20);
    typeId = types.body.find((t: any) => t.code === 'DH').id;
  });

  it('catálogos: solo el Administrador modifica; nombres únicos; se pueden agregar sin tocar código', async () => {
    await ag.OPERATIVO.post('/api/catalogs/system-categories').set(H).send({ name: 'Nueva' }).expect(403);
    const created = await ag.ADMIN.post('/api/catalogs/system-categories').set(H).send({ name: 'Extintores', sortOrder: 8 }).expect(201);
    await ag.ADMIN.post('/api/catalogs/system-categories').set(H).send({ name: 'EXTINTORES' }).expect(409);
    await ag.ADMIN.post('/api/catalogs/system-categories').set(H).send({ name: 'Con código', code: 'X' }).expect(400);
    await ag.ADMIN.post('/api/catalogs/equipment-types').set(H).send({ name: 'Detector de humo 2', code: 'DH' }).expect(409);
    await ag.ADMIN.post('/api/catalogs/equipment-types').set(H).send({ name: 'Mal código', code: 'minúscula' }).expect(400);
    await ag.ADMIN.post('/api/catalogs/nope').set(H).send({ name: 'Algo' }).expect(404);
    // desactivar: deja de ofrecerse y no se puede usar en sistemas nuevos
    await ag.ADMIN.patch(`/api/catalogs/system-categories/${created.body.id}`).set(H).send({ active: false }).expect(200);
    const active = await ag.TECNICO.get('/api/catalogs/system-categories').expect(200);
    expect(active.body.map((c: any) => c.name)).not.toContain('Extintores');
    const all = await ag.ADMIN.get('/api/catalogs/system-categories?includeInactive=true').expect(200);
    expect(all.body.map((c: any) => c.name)).toContain('Extintores');
    const r = await ag.ADMIN.post('/api/systems').set(H).send({ installationId, categoryId: created.body.id }).expect(400);
    expect(r.body.message).toMatch(/inactiva/);
  });

  it('una instalación puede tener varios sistemas (incluso de la misma categoría)', async () => {
    const body = { installationId, categoryId, brand: 'Bosch', model: 'FPA 1000', serialNumber: 'SN-1', installedAt: '2024-03-15', nextMaintenanceDate: '2026-12-01', relation: 'MTTO', extra: { zonas: 4 } };
    const a = await ag.OPERATIVO.post('/api/systems').set(H).send(body).expect(201);
    systemId = a.body.id;
    await ag.OPERATIVO.post('/api/systems').set(H).send({ installationId, categoryId, brand: 'Simplex', model: '4007' }).expect(201);
    const list = await ag.CONSULTA.get(`/api/systems?installationId=${installationId}`).expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].category.name).toBe('SISTEMA DE DETECCIÓN DE ALARMA');
    const d = await ag.TECNICO.get(`/api/systems/${systemId}`).expect(200);
    expect(d.body.installedAt.slice(0, 10)).toBe('2024-03-15'); // sin desfase de zona horaria
    expect(d.body.nextMaintenanceDate.slice(0, 10)).toBe('2026-12-01');
    expect(d.body.extra).toEqual({ zonas: 4 });
  });

  it('valida fechas, enums, ids y permisos de escritura', async () => {
    const base = { installationId, categoryId };
    await ag.ADMIN.post('/api/systems').set(H).send({ ...base, installedAt: '15/03/2024' }).expect(400);
    const bad = await ag.ADMIN.post('/api/systems').set(H).send({ ...base, installedAt: '2024-02-30' }).expect(400);
    expect(bad.body.message).toMatch(/inválida/);
    await ag.ADMIN.post('/api/systems').set(H).send({ ...base, operationalStatus: 'ROTO' }).expect(400);
    await ag.ADMIN.post('/api/systems').set(H).send({ ...base, responsibleId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await ag.ADMIN.post('/api/systems').set(H).send({ installationId: '00000000-0000-4000-8000-000000000000', categoryId }).expect(404);
    await ag.TECNICO.post('/api/systems').set(H).send(base).expect(403);
    await ag.CONSULTA.patch(`/api/systems/${systemId}`).set(H).send({ brand: 'X' }).expect(403);
    const ok = await ag.ADMIN.patch(`/api/systems/${systemId}`).set(H).send({ responsibleId: adminId, operationalStatus: 'CON_FALLAS', location: '  Sala técnica  ' }).expect(200);
    expect(ok.body.location).toBe('Sala técnica');
  });

  it('dispositivos: cantidades, estado, validación y desactivación', async () => {
    await ag.ADMIN.post(`/api/systems/${systemId}/equipment`).set(H).send({ typeId, quantity: 0 }).expect(400);
    await ag.ADMIN.post(`/api/systems/${systemId}/equipment`).set(H).send({ typeId, quantity: 1.5 }).expect(400);
    const e = await ag.OPERATIVO.post(`/api/systems/${systemId}/equipment`).set(H).send({ typeId, quantity: 59, label: 'Piso 1' }).expect(201);
    await ag.ADMIN.post(`/api/systems/${systemId}/equipment`).set(H).send({ typeId, quantity: 22, label: 'Piso 2', status: 'CON_FALLAS' }).expect(201);
    await ag.TECNICO.post(`/api/systems/${systemId}/equipment`).set(H).send({ typeId, quantity: 1 }).expect(403);
    await ag.ADMIN.patch(`/api/equipment/${e.body.id}`).set(H).send({ quantity: 60 }).expect(200);
    await ag.ADMIN.patch(`/api/equipment/${e.body.id}`).set(H).send({ active: false }).expect(200);
    const d = await ag.CONSULTA.get(`/api/systems/${systemId}`).expect(200);
    expect(d.body.equipment).toHaveLength(2);
    expect(d.body._count.equipment).toBe(1); // solo cuenta los activos
    expect(d.body.equipment.find((x: any) => x.id === e.body.id).quantity).toBe(60);
  });

  it('desactivar un sistema (lógico), filtros y no hay borrado físico', async () => {
    await ag.ADMIN.post(`/api/systems/${systemId}/deactivate`).set(H).expect(200);
    expect(await prisma.installedSystem.count({ where: { id: systemId } })).toBe(1);
    const inactive = await ag.ADMIN.get('/api/systems?status=INACTIVE').expect(200);
    expect(inactive.body.items.map((s: any) => s.id)).toContain(systemId);
    const r = await ag.ADMIN.post(`/api/systems/${systemId}/equipment`).set(H).send({ typeId, quantity: 1 }).expect(400);
    expect(r.body.message).toMatch(/inactivo/);
    await ag.ADMIN.delete(`/api/systems/${systemId}`).set(H).expect(404);
    await ag.ADMIN.post(`/api/systems/${systemId}/reactivate`).set(H).expect(200);
    const search = await ag.ADMIN.get('/api/systems?search=simplex').expect(200);
    expect(search.body.total).toBe(1);
    const byClient = await ag.ADMIN.get(`/api/systems?clientId=${(await prisma.installation.findUnique({ where: { id: installationId } }))!.clientId}`).expect(200);
    expect(byClient.body.total).toBe(2);
  });

  it('sin sesión: 401', async () => {
    await request(app.getHttpServer()).get('/api/systems').expect(401);
    await request(app.getHttpServer()).get('/api/catalogs/system-categories').expect(401);
  });
});
