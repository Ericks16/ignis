import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, todayLocal } from '../src/common/dates';
import { PrismaService } from '../src/prisma/prisma.service';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };
const TODAY = todayLocal();

describe('Técnicos, mantenimientos y calendario (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ag: Record<string, ReturnType<typeof request.agent>> = {};
  let systemId: string;
  let clientId: string;
  let categoryId: string;
  let preventivo: string;
  let tech1: string; // vinculado al usuario TECNICO
  let tech2: string; // vinculado a TECNICO2
  let m1: string;

  async function login(email: string) {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
    return a;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const ids: Record<string, string> = {};
    for (const [key, role] of [['ADMIN', Role.ADMIN], ['OPERATIVO', Role.OPERATIVO], ['TECNICO', Role.TECNICO], ['TECNICO2', Role.TECNICO], ['CONSULTA', Role.CONSULTA]] as const) {
      const email = `${key.toLowerCase()}@m.local`;
      const u = await prisma.user.create({ data: { email, name: key, role, passwordHash: await bcrypt.hash(PASS, 4) } });
      ids[key] = u.id;
      ag[key] = await login(email);
    }
    const c = await ag.ADMIN.post('/api/clients').set(H).send({ commercialName: 'Cliente Mantenimiento SA' }).expect(201);
    clientId = c.body.id;
    const i = await ag.ADMIN.post('/api/installations').set(H).send({ clientId, name: 'Sucursal Centro' }).expect(201);
    categoryId = (await ag.ADMIN.get('/api/catalogs/system-categories')).body[5].id;
    const s = await ag.ADMIN.post('/api/systems').set(H).send({ installationId: i.body.id, categoryId, brand: 'Bosch', nextMaintenanceDate: addDays(TODAY, -30) }).expect(201);
    systemId = s.body.id;
    tech1 = (await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Técnico Uno', initials: 'tu', userId: ids.TECNICO }).expect(201)).body.id;
    tech2 = (await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Técnico Dos', userId: ids.TECNICO2 }).expect(201)).body.id;
    preventivo = (await ag.ADMIN.get('/api/catalogs/maintenance-types')).body.find((t: any) => t.name === 'Preventivo').id;
  });
  afterAll(async () => { await app.close(); });

  const newM = (extra: object = {}) => ag.ADMIN.post('/api/maintenances').set(H).send({ systemId, typeId: preventivo, scheduledDate: addDays(TODAY, 5), ...extra });

  it('técnicos: CRUD con permisos, iniciales en mayúscula y vínculo único con usuario', async () => {
    const t = await ag.ADMIN.get(`/api/technicians/${tech1}`).expect(200);
    expect(t.body.initials).toBe('TU');
    await ag.TECNICO.post('/api/technicians').set(H).send({ name: 'No Puede' }).expect(403);
    await ag.CONSULTA.get('/api/technicians').expect(200);
    const dup = await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Repetido', userId: t.body.userId }).expect(409);
    expect(dup.body.message).toMatch(/vinculado/);
    await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Mal', initials: '123' }).expect(400);
    await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Mal', hireDate: '2026-13-45' }).expect(400);
    const opts = await ag.OPERATIVO.get('/api/technicians/options').expect(200);
    expect(opts.body.map((x: any) => x.name)).toEqual(expect.arrayContaining(['Técnico Uno', 'Técnico Dos']));
  });

  it('tipos de mantenimiento: 5 iniciales en la BD y configurables', async () => {
    const r = await ag.CONSULTA.get('/api/catalogs/maintenance-types').expect(200);
    expect(r.body.map((t: any) => t.name)).toEqual(expect.arrayContaining(['Preventivo', 'Correctivo', 'Inspección', 'Instalación', 'Revisión técnica']));
    await ag.ADMIN.post('/api/catalogs/maintenance-types').set(H).send({ name: 'Capacitación' }).expect(201);
    await ag.ADMIN.post('/api/catalogs/maintenance-types').set(H).send({ name: 'Otra', code: 'X' }).expect(400);
  });

  it('programa mantenimientos: valida y asigna técnicos; sin permiso no puede', async () => {
    await newM({ scheduledDate: '2026-02-30' }).expect(400);
    await newM({ technicianIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
    await ag.TECNICO.post('/api/maintenances').set(H).send({ systemId, typeId: preventivo, scheduledDate: addDays(TODAY, 3) }).expect(403);
    await ag.CONSULTA.post('/api/maintenances').set(H).send({ systemId, typeId: preventivo, scheduledDate: addDays(TODAY, 3) }).expect(403);
    const r = await newM({ technicianIds: [tech1, tech2], description: 'Mantenimiento semestral' }).expect(201);
    m1 = r.body.id;
    expect(r.body.status).toBe('PROGRAMADO');
    expect(r.body.technicians).toHaveLength(2);
    expect(r.body.overdue).toBe(false);
    await ag.OPERATIVO.post('/api/maintenances').set(H).send({ systemId, typeId: preventivo, scheduledDate: addDays(TODAY, 40) }).expect(201);
  });

  it('vencidos y próximos se calculan con la fecha de Guayaquil', async () => {
    const past = await newM({ scheduledDate: addDays(TODAY, -3) }).expect(201);
    expect(past.body.overdue).toBe(true);
    const todayM = await newM({ scheduledDate: TODAY }).expect(201);
    expect(todayM.body.overdue).toBe(false);
    const overdue = await ag.ADMIN.get('/api/maintenances?due=overdue').expect(200);
    expect(overdue.body.items.map((x: any) => x.id)).toContain(past.body.id);
    expect(overdue.body.items.map((x: any) => x.id)).not.toContain(todayM.body.id);
    const upcoming = await ag.ADMIN.get('/api/maintenances?due=upcoming').expect(200);
    const ids = upcoming.body.items.map((x: any) => x.id);
    expect(ids).toEqual(expect.arrayContaining([m1, todayM.body.id]));
    expect(ids).not.toContain(past.body.id);
  });

  it('un Técnico solo ve y opera lo que tiene asignado', async () => {
    const solo = await newM({ technicianIds: [tech2] }).expect(201);
    const l1 = await ag.TECNICO.get('/api/maintenances?pageSize=100').expect(200);
    const ids = l1.body.items.map((x: any) => x.id);
    expect(ids).toContain(m1);
    expect(ids).not.toContain(solo.body.id);
    await ag.TECNICO.get(`/api/maintenances/${solo.body.id}`).expect(404);
    await ag.TECNICO.post(`/api/maintenances/${solo.body.id}/start`).set(H).expect(404);
    await ag.TECNICO2.get(`/api/maintenances/${solo.body.id}`).expect(200);
    await ag.TECNICO.post(`/api/maintenances/${m1}/cancel`).set(H).send({ reason: 'x' }).expect(403);
    await ag.TECNICO.post(`/api/maintenances/${m1}/reschedule`).set(H).send({ newDate: addDays(TODAY, 9), reason: 'x' }).expect(403);
    await ag.TECNICO.patch(`/api/maintenances/${m1}`).set(H).send({ scheduledDate: addDays(TODAY, 9) }).expect(403);
    const ok = await ag.TECNICO.patch(`/api/maintenances/${m1}`).set(H).send({ observations: 'Se revisó el panel' }).expect(200);
    expect(ok.body.observations).toBe('Se revisó el panel');
  });

  it('ejecución: inicia, valida fechas y al completar actualiza el sistema (próxima fecha la define el usuario)', async () => {
    await ag.CONSULTA.post(`/api/maintenances/${m1}/start`).set(H).expect(403);
    const st = await ag.TECNICO.post(`/api/maintenances/${m1}/start`).set(H).expect(200);
    expect(st.body.status).toBe('EN_PROCESO');
    await ag.TECNICO.post(`/api/maintenances/${m1}/start`).set(H).expect(400); // ya está en proceso
    await ag.TECNICO.post(`/api/maintenances/${m1}/complete`).set(H).send({ executedDate: addDays(TODAY, 1) }).expect(400); // futura
    await ag.TECNICO.post(`/api/maintenances/${m1}/complete`).set(H).send({ executedDate: TODAY, nextMaintenanceDate: TODAY }).expect(400);
    const next = addDays(TODAY, 180);
    const done = await ag.TECNICO.post(`/api/maintenances/${m1}/complete`).set(H)
      .send({ executedDate: TODAY, nextMaintenanceDate: next, recommendations: 'Cambiar baterías', materials: '2 baterías 12V', result: 'Satisfactorio' }).expect(200);
    expect(done.body.status).toBe('REALIZADO');
    expect(done.body.recommendations).toBe('Cambiar baterías');
    const sys = (await ag.ADMIN.get(`/api/systems/${systemId}`)).body;
    expect(sys.lastMaintenanceDate.slice(0, 10)).toBe(TODAY);
    expect(sys.nextMaintenanceDate.slice(0, 10)).toBe(next);
    // estado terminal
    await ag.ADMIN.post(`/api/maintenances/${m1}/cancel`).set(H).send({ reason: 'x' }).expect(400);
    await ag.ADMIN.post(`/api/maintenances/${m1}/reschedule`).set(H).send({ newDate: addDays(TODAY, 9), reason: 'x' }).expect(400);
    await ag.ADMIN.patch(`/api/maintenances/${m1}`).set(H).send({ scheduledDate: addDays(TODAY, 9) }).expect(400);
  });

  it('completar sin fecha siguiente no inventa periodicidad: limpia una fecha vieja cumplida', async () => {
    await prisma.installedSystem.update({ where: { id: systemId }, data: { nextMaintenanceDate: new Date(`${addDays(TODAY, -10)}T00:00:00Z`) } });
    const m = await newM({ scheduledDate: TODAY }).expect(201);
    await ag.OPERATIVO.post(`/api/maintenances/${m.body.id}/complete`).set(H).send({ executedDate: TODAY }).expect(200);
    const sys = (await ag.ADMIN.get(`/api/systems/${systemId}`)).body;
    expect(sys.nextMaintenanceDate).toBeNull();
  });

  it('reprogramar: el original queda REPROGRAMADO y se crea uno nuevo enlazado con los mismos técnicos', async () => {
    const m = await newM({ technicianIds: [tech1], description: 'Original' }).expect(201);
    await ag.ADMIN.post(`/api/maintenances/${m.body.id}/reschedule`).set(H).send({ newDate: addDays(TODAY, -1), reason: 'x' }).expect(400);
    await ag.ADMIN.post(`/api/maintenances/${m.body.id}/reschedule`).set(H).send({ newDate: m.body.scheduledDate.slice(0, 10), reason: 'x' }).expect(400);
    const nd = addDays(TODAY, 20);
    const r = await ag.OPERATIVO.post(`/api/maintenances/${m.body.id}/reschedule`).set(H).send({ newDate: nd, reason: 'Cliente pidió otra fecha' }).expect(200);
    expect(r.body.status).toBe('PROGRAMADO');
    expect(r.body.scheduledDate.slice(0, 10)).toBe(nd);
    expect(r.body.technicians.map((t: any) => t.id)).toEqual([tech1]);
    expect(r.body.rescheduledFrom.id).toBe(m.body.id);
    const old = (await ag.ADMIN.get(`/api/maintenances/${m.body.id}`)).body;
    expect(old.status).toBe('REPROGRAMADO');
    expect(old.observations).toMatch(/Cliente pidió otra fecha/);
    expect(old.rescheduledTo.id).toBe(r.body.id);
    expect(old.overdue).toBe(false);
  });

  it('cancelar exige motivo y queda registrado en el historial', async () => {
    const m = await newM().expect(201);
    await ag.ADMIN.post(`/api/maintenances/${m.body.id}/cancel`).set(H).send({}).expect(400);
    const c = await ag.ADMIN.post(`/api/maintenances/${m.body.id}/cancel`).set(H).send({ reason: 'Cliente cerró la sucursal' }).expect(200);
    expect(c.body.status).toBe('CANCELADO');
    const h = await ag.ADMIN.get(`/api/maintenances/${m.body.id}/history`).expect(200);
    expect(h.body.map((x: any) => x.action)).toEqual(expect.arrayContaining(['maintenance.created', 'maintenance.cancelled']));
    expect(h.body[0].actor).toBe('ADMIN');
  });

  it('calendario: rango, filtros, alcance del Técnico y límite de 366 días', async () => {
    const from = addDays(TODAY, -10);
    const to = addDays(TODAY, 60);
    const all = await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}`).expect(200);
    expect(all.body.length).toBeGreaterThan(3);
    expect(all.body.find((e: any) => e.client === 'Cliente Mantenimiento SA')).toEqual(expect.objectContaining({ kind: 'MAINTENANCE', client: 'Cliente Mantenimiento SA', category: 'SISTEMA DE DETECCIÓN DE ALARMA' }));
    const byTech = await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}&technicianId=${tech2}`).expect(200);
    expect(byTech.body.length).toBeGreaterThan(0);
    expect(byTech.body.length).toBeLessThan(all.body.length);
    const canc = await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}&status=CANCELADO`).expect(200);
    expect(canc.body.every((e: any) => e.status === 'CANCELADO')).toBe(true);
    const tec = await ag.TECNICO.get(`/api/calendar?from=${from}&to=${to}`).expect(200);
    expect(tec.body.length).toBeLessThan(all.body.length);
    await ag.ADMIN.get(`/api/calendar?from=2026-01-01&to=2028-12-31`).expect(400);
    await ag.ADMIN.get(`/api/calendar?from=${to}&to=${from}`).expect(400);
    await ag.ADMIN.get('/api/calendar').expect(400);
  });

  it('dashboard: programados, próximos, vencidos y resumen mensual con datos reales', async () => {
    const d = (await ag.ADMIN.get('/api/dashboard/summary').expect(200)).body.maintenance;
    expect(d.overdue).toBeGreaterThanOrEqual(1);
    expect(d.upcoming).toBeGreaterThanOrEqual(2);
    expect(d.scheduled).toBeGreaterThanOrEqual(d.upcoming + d.overdue);
    expect(d.monthly).toHaveLength(12);
    const month = Number(TODAY.slice(5, 7)) - 1;
    expect(d.monthly[month].done).toBeGreaterThanOrEqual(2);
    expect(d.nextVisits.length).toBeLessThanOrEqual(5);
    const t = (await ag.TECNICO.get('/api/dashboard/summary').expect(200)).body.maintenance;
    expect(t.scheduled).toBeLessThan(d.scheduled); // el Técnico solo cuenta lo suyo
  });

  it('desactivar un técnico lo excluye de nuevas asignaciones', async () => {
    const t = await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Temporal Inactivo' }).expect(201);
    await ag.ADMIN.post(`/api/technicians/${t.body.id}/deactivate`).set(H).expect(200);
    await newM({ technicianIds: [t.body.id] }).expect(400);
    await ag.ADMIN.delete(`/api/technicians/${t.body.id}`).set(H).expect(404);
  });
});
