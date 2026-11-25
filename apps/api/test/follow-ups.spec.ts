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

describe('Seguimientos, estados y actividades (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ag: Record<string, ReturnType<typeof request.agent>> = {};
  const uid: Record<string, string> = {};
  let clientId: string; let otherClientId: string; let installationId: string; let otherInstallationId: string; let systemId: string;
  let typeId: string; let tech1: string;
  const st: Record<string, string> = {};
  let activityTypeId: string;

  const fu = (extra: object = {}) => ag.ADMIN.post('/api/follow-ups').set(H).send({ clientId, title: 'Enviar proforma de mantenimiento', typeId, ...extra });
  const setStatus = (id: string, name: string, comment?: string, as = 'ADMIN') => ag[as].post(`/api/follow-ups/${id}/status`).set(H).send({ statusId: st[name], comment });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const [key, role] of [['ADMIN', Role.ADMIN], ['OPERATIVO', Role.OPERATIVO], ['TECNICO', Role.TECNICO], ['TECNICO2', Role.TECNICO], ['CONSULTA', Role.CONSULTA]] as const) {
      const email = `${key.toLowerCase()}@f.local`;
      const u = await prisma.user.create({ data: { email, name: key, role, passwordHash: await bcrypt.hash(PASS, 4) } });
      uid[key] = u.id;
      const a = request.agent(app.getHttpServer());
      await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
      ag[key] = a;
    }
    clientId = (await ag.ADMIN.post('/api/clients').set(H).send({ commercialName: 'Cliente Seguimiento SA' }).expect(201)).body.id;
    otherClientId = (await ag.ADMIN.post('/api/clients').set(H).send({ commercialName: 'Otro Cliente SA' }).expect(201)).body.id;
    installationId = (await ag.ADMIN.post('/api/installations').set(H).send({ clientId, name: 'Matriz' }).expect(201)).body.id;
    otherInstallationId = (await ag.ADMIN.post('/api/installations').set(H).send({ clientId: otherClientId, name: 'Sucursal Ajena' }).expect(201)).body.id;
    const cat = (await ag.ADMIN.get('/api/catalogs/system-categories')).body[5].id;
    systemId = (await ag.ADMIN.post('/api/systems').set(H).send({ installationId, categoryId: cat }).expect(201)).body.id;
    typeId = (await ag.ADMIN.get('/api/catalogs/follow-up-types')).body.find((t: any) => t.name === 'Cotización').id;
    activityTypeId = (await ag.ADMIN.get('/api/catalogs/activity-types')).body.find((t: any) => t.name === 'Llamada al cliente').id;
    for (const s of (await ag.ADMIN.get('/api/follow-up-statuses')).body) st[s.name] = s.id;
    tech1 = (await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Técnico Uno', userId: uid.TECNICO }).expect(201)).body.id;
    await ag.ADMIN.post('/api/technicians').set(H).send({ name: 'Técnico Dos', userId: uid.TECNICO2 }).expect(201);
  });
  afterAll(async () => { await app.close(); });

  it('catálogos iniciales sembrados: 7 estados (FINALIZADO y CANCELADO terminales), tipos de seguimiento y de actividad', async () => {
    const s = (await ag.CONSULTA.get('/api/follow-up-statuses').expect(200)).body;
    expect(s.map((x: any) => x.name)).toEqual(['PENDIENTE', 'EN PROCESO', 'ESPERANDO CLIENTE', 'ESPERANDO REPUESTOS', 'PROGRAMADO', 'FINALIZADO', 'CANCELADO']);
    expect(s.filter((x: any) => x.isTerminal).map((x: any) => x.name)).toEqual(['FINALIZADO', 'CANCELADO']);
    expect(s.every((x: any) => x.isSystem)).toBe(true);
    const types = (await ag.CONSULTA.get('/api/catalogs/follow-up-types')).body.map((t: any) => t.name);
    expect(types).toEqual(expect.arrayContaining(['Cotización', 'Actividad comercial', 'Observación técnica', 'Requerimiento del cliente']));
    const at = (await ag.CONSULTA.get('/api/catalogs/activity-types')).body.map((t: any) => t.name);
    expect(at).toEqual(expect.arrayContaining(['Llamada al cliente', 'Cotización enviada', 'Seguimiento finalizado']));
    await ag.ADMIN.post('/api/catalogs/follow-up-types').set(H).send({ name: 'Garantía' }).expect(201);
  });

  it('administración controlada de estados: solo Administrador; los de sistema son intocables', async () => {
    await ag.OPERATIVO.post('/api/follow-up-statuses').set(H).send({ name: 'Nuevo' }).expect(403);
    const c = await ag.ADMIN.post('/api/follow-up-statuses').set(H).send({ name: 'En revisión legal' }).expect(201);
    expect(c.body.name).toBe('EN REVISIÓN LEGAL');
    expect(c.body.isTerminal).toBe(false);
    expect(c.body.isSystem).toBe(false);
    await ag.ADMIN.post('/api/follow-up-statuses').set(H).send({ name: 'en revisión legal' }).expect(409);
    await ag.ADMIN.patch(`/api/follow-up-statuses/${st.FINALIZADO}`).set(H).send({ active: false }).expect(400);
    await ag.ADMIN.patch(`/api/follow-up-statuses/${st.PENDIENTE}`).set(H).send({ name: 'OTRO' }).expect(400);
    await ag.ADMIN.patch(`/api/follow-up-statuses/${st.PENDIENTE}`).set(H).send({ isTerminal: true }).expect(400); // campo no permitido
    await ag.ADMIN.patch(`/api/follow-up-statuses/${c.body.id}`).set(H).send({ active: false }).expect(200);
    const active = (await ag.CONSULTA.get('/api/follow-up-statuses')).body.map((x: any) => x.name);
    expect(active).not.toContain('EN REVISIÓN LEGAL');
    st['EN REVISIÓN LEGAL'] = c.body.id;
  });

  it('crea seguimientos: permisos, validación y coherencia de vínculos', async () => {
    await ag.TECNICO.post('/api/follow-ups').set(H).send({ clientId, title: 'No puede', typeId }).expect(403);
    await ag.CONSULTA.post('/api/follow-ups').set(H).send({ clientId, title: 'No puede', typeId }).expect(403);
    await fu({ title: 'A' }).expect(400);
    await fu({ installationId: otherInstallationId }).expect(400); // instalación de otro cliente
    await fu({ systemId, installationId: otherInstallationId }).expect(400);
    await fu({ startDate: TODAY, targetDate: addDays(TODAY, -1) }).expect(400);
    await fu({ targetDate: '2026-02-30' }).expect(400);
    await fu({ responsibleId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await fu({ technicianIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
    const ok = await fu({ installationId, systemId, priority: 'ALTA', targetDate: addDays(TODAY, 20), responsibleId: uid.OPERATIVO, nextAction: 'Llamar a compras' }).expect(201);
    expect(ok.body.status.name).toBe('PENDIENTE');
    expect(ok.body.startDate.slice(0, 10)).toBe(TODAY);
    expect(ok.body.overdue).toBe(false);
    expect(ok.body.system.category.name).toBe('SISTEMA DE DETECCIÓN DE ALARMA');
    const h = (await ag.ADMIN.get(`/api/follow-ups/${ok.body.id}/history`).expect(200)).body;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ toName: 'PENDIENTE', by: 'ADMIN' });
  });

  it('estados: historial con quién/cuándo/anterior/nuevo, finalizar y reabrir', async () => {
    const f = (await fu({ targetDate: addDays(TODAY, 10), technicianIds: [tech1] }).expect(201)).body;
    await setStatus(f.id, 'PENDIENTE').expect(400); // mismo estado
    await ag.CONSULTA.post(`/api/follow-ups/${f.id}/status`).set(H).send({ statusId: st['EN PROCESO'] }).expect(403);
    await ag.TECNICO.post(`/api/follow-ups/${f.id}/status`).set(H).send({ statusId: st['EN PROCESO'] }).expect(403); // el técnico no cambia estados
    await setStatus(f.id, 'EN PROCESO', 'Se inició la gestión').expect(200);
    await setStatus(f.id, 'CANCELADO').expect(400); // exige motivo
    await setStatus(f.id, 'EN REVISIÓN LEGAL').expect(400); // estado inactivo
    const fin = await setStatus(f.id, 'FINALIZADO', 'Cliente aprobó la proforma').expect(200);
    expect(fin.body.status.name).toBe('FINALIZADO');
    expect(fin.body.completedAt).toBeTruthy();
    expect(fin.body.completedBy.name).toBe('ADMIN');
    expect(fin.body.overdue).toBe(false);
    // historial
    const h = (await ag.ADMIN.get(`/api/follow-ups/${f.id}/history`)).body;
    expect(h.map((x: any) => `${x.fromName ?? '-'}>${x.toName}`)).toEqual(['EN PROCESO>FINALIZADO', 'PENDIENTE>EN PROCESO', '->PENDIENTE']);
    expect(h[0]).toMatchObject({ comment: 'Cliente aprobó la proforma', by: 'ADMIN' });
    // actividad automática de finalización
    const acts = (await ag.ADMIN.get(`/api/activities?followUpId=${f.id}`)).body;
    expect(acts.items.map((a: any) => a.type.name)).toContain('Seguimiento finalizado');
    // un cerrado no se edita ni pasa a otro terminal
    await ag.ADMIN.patch(`/api/follow-ups/${f.id}`).set(H).send({ title: 'Cambio' }).expect(400);
    await setStatus(f.id, 'CANCELADO', 'x').expect(400);
    // reapertura: exige motivo y limpia la finalización
    await setStatus(f.id, 'EN PROCESO').expect(400);
    const re = await setStatus(f.id, 'EN PROCESO', 'Falta una visita').expect(200);
    expect(re.body.completedAt).toBeNull();
    expect(re.body.completedBy).toBeNull();
    expect(await prisma.auditLog.count({ where: { entity: 'FollowUp', entityId: f.id, action: 'followup.closed' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: 'FollowUp', entityId: f.id, action: 'followup.reopened' } })).toBe(1);
    // cancelar con motivo
    const c = await setStatus(f.id, 'CANCELADO', 'El cliente ya no lo requiere').expect(200);
    expect(c.body.status.isTerminal).toBe(true);
    expect(c.body.completedBy.name).toBe('ADMIN');
  });

  it('vencidos y filtros por estado/abiertos/cerrados', async () => {
    const past = (await fu({ title: 'Seguimiento vencido', targetDate: addDays(TODAY, -2), startDate: addDays(TODAY, -10) }).expect(201)).body;
    expect(past.overdue).toBe(true);
    const soon = (await fu({ title: 'Seguimiento próximo', targetDate: addDays(TODAY, 3) }).expect(201)).body;
    const od = (await ag.ADMIN.get('/api/follow-ups?state=overdue').expect(200)).body.items.map((x: any) => x.id);
    expect(od).toContain(past.id);
    expect(od).not.toContain(soon.id);
    const up = (await ag.ADMIN.get('/api/follow-ups?state=upcoming').expect(200)).body.items.map((x: any) => x.id);
    expect(up).toContain(soon.id);
    await setStatus(past.id, 'FINALIZADO').expect(200);
    const od2 = (await ag.ADMIN.get('/api/follow-ups?state=overdue').expect(200)).body.items.map((x: any) => x.id);
    expect(od2).not.toContain(past.id); // finalizado ya no está vencido
    const closed = (await ag.ADMIN.get('/api/follow-ups?state=closed').expect(200)).body.items.map((x: any) => x.id);
    expect(closed).toContain(past.id);
    expect(((await ag.ADMIN.get(`/api/follow-ups?search=vencido`)).body.items as any[]).length).toBeGreaterThan(0);
    await ag.ADMIN.get('/api/follow-ups?state=otro').expect(400);
  });

  it('un Técnico solo ve los seguimientos donde es responsable o está asignado', async () => {
    const mine = (await fu({ title: 'Asignado a técnico uno', technicianIds: [tech1] }).expect(201)).body;
    const asResp = (await fu({ title: 'Responsable técnico uno', responsibleId: uid.TECNICO }).expect(201)).body;
    const other = (await fu({ title: 'Ajeno al técnico' }).expect(201)).body;
    const ids = (await ag.TECNICO.get('/api/follow-ups?pageSize=100').expect(200)).body.items.map((x: any) => x.id);
    expect(ids).toEqual(expect.arrayContaining([mine.id, asResp.id]));
    expect(ids).not.toContain(other.id);
    await ag.TECNICO.get(`/api/follow-ups/${other.id}`).expect(404);
    await ag.TECNICO2.get(`/api/follow-ups/${mine.id}`).expect(404);
    await ag.CONSULTA.get(`/api/follow-ups/${other.id}`).expect(200);
  });

  it('actividades: vínculo obligatorio, cliente derivado, fecha no futura, alcance del Técnico', async () => {
    const f = (await fu({ title: 'Con actividades', technicianIds: [tech1] }).expect(201)).body;
    const other = (await fu({ title: 'Sin técnico' }).expect(201)).body;
    await ag.ADMIN.post('/api/activities').set(H).send({ typeId: activityTypeId, description: 'Sin vínculo' }).expect(400);
    await ag.ADMIN.post('/api/activities').set(H).send({ followUpId: f.id, typeId: activityTypeId, description: 'x' }).expect(400); // descripción corta
    await ag.ADMIN.post('/api/activities').set(H).send({ followUpId: f.id, typeId: activityTypeId, description: 'Futura', occurredAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(400);
    await ag.ADMIN.post('/api/activities').set(H).send({ followUpId: f.id, clientId: otherClientId, typeId: activityTypeId, description: 'Cliente distinto' }).expect(400);
    const a = (await ag.OPERATIVO.post('/api/activities').set(H).send({ followUpId: f.id, typeId: activityTypeId, description: 'Se llamó a compras', occurredAt: new Date(Date.now() - 3_600_000).toISOString() }).expect(201)).body;
    expect(a.client.id).toBe(clientId);
    expect(a.user.name).toBe('OPERATIVO');
    // Técnico: solo en lo asignado y con vínculo
    const t = (await ag.TECNICO.post('/api/activities').set(H).send({ followUpId: f.id, typeId: activityTypeId, description: 'Visita del técnico' }).expect(201)).body;
    await ag.TECNICO.post('/api/activities').set(H).send({ followUpId: other.id, typeId: activityTypeId, description: 'No asignado' }).expect(404);
    await ag.TECNICO.post('/api/activities').set(H).send({ clientId, typeId: activityTypeId, description: 'Solo cliente' }).expect(403);
    await ag.CONSULTA.post('/api/activities').set(H).send({ followUpId: f.id, typeId: activityTypeId, description: 'No puede' }).expect(403);
    // edición: el técnico solo la suya
    await ag.TECNICO.patch(`/api/activities/${a.id}`).set(H).send({ description: 'Intento ajeno' }).expect(403);
    await ag.TECNICO.patch(`/api/activities/${t.id}`).set(H).send({ description: 'Visita corregida' }).expect(200);
    await ag.OPERATIVO.patch(`/api/activities/${t.id}`).set(H).send({ description: 'Corregida por operativo' }).expect(200);
    await ag.ADMIN.delete(`/api/activities/${a.id}`).set(H).expect(404); // el historial no se borra
    // listado cronológico (más reciente primero) y filtros
    const list = (await ag.ADMIN.get(`/api/activities?followUpId=${f.id}`).expect(200)).body;
    expect(list.total).toBe(2);
    const dates = list.items.map((x: any) => new Date(x.occurredAt).getTime());
    expect(dates).toEqual([...dates].sort((x, y) => y - x));
    expect((await ag.ADMIN.get(`/api/activities?clientId=${clientId}&search=compras`)).body.total).toBe(1);
    expect((await ag.ADMIN.get(`/api/activities?clientId=${clientId}&from=${TODAY}&to=${TODAY}`)).body.total).toBeGreaterThanOrEqual(2);
    expect((await ag.ADMIN.get(`/api/activities?clientId=${clientId}&to=${addDays(TODAY, -30)}`)).body.total).toBe(0);
    const tecList = (await ag.TECNICO.get('/api/activities?pageSize=100').expect(200)).body.items.map((x: any) => x.followUp?.id);
    expect(tecList).not.toContain(other.id);
  });

  it('actividades ligadas a un mantenimiento derivan cliente e instalación', async () => {
    const mt = (await ag.ADMIN.get('/api/catalogs/maintenance-types')).body[0].id;
    const m = (await ag.ADMIN.post('/api/maintenances').set(H).send({ systemId, typeId: mt, scheduledDate: addDays(TODAY, 5) }).expect(201)).body;
    const a = (await ag.OPERATIVO.post('/api/activities').set(H).send({ maintenanceId: m.id, typeId: activityTypeId, description: 'Cliente confirmó la visita' }).expect(201)).body;
    expect(a.client.id).toBe(clientId);
    const f = (await fu({ systemId, maintenanceId: m.id, title: 'Ligado a mantenimiento' }).expect(201)).body;
    expect(f.maintenance.id).toBe(m.id);
    await ag.ADMIN.post('/api/follow-ups').set(H).send({ clientId: otherClientId, title: 'Mantenimiento ajeno', typeId, maintenanceId: m.id }).expect(400);
  });

  it('calendario combinado: mantenimientos y seguimientos (fecha objetivo) con filtros', async () => {
    const from = addDays(TODAY, -5);
    const to = addDays(TODAY, 30);
    const all = (await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}`).expect(200)).body;
    const kinds = new Set(all.map((e: any) => e.kind));
    expect(kinds).toEqual(new Set(['MAINTENANCE', 'FOLLOWUP']));
    const onlyF = (await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}&kind=followup`)).body;
    expect(onlyF.length).toBeGreaterThan(0);
    expect(onlyF.every((e: any) => e.kind === 'FOLLOWUP')).toBe(true);
    const withStatus = (await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}&status=PROGRAMADO`)).body;
    expect(withStatus.every((e: any) => e.kind === 'MAINTENANCE')).toBe(true);
    expect((await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}&clientId=${otherClientId}`)).body).toHaveLength(0);
    const tec = (await ag.TECNICO.get(`/api/calendar?from=${from}&to=${to}&kind=followup`)).body;
    expect(tec.length).toBeLessThan(onlyF.length);
    await ag.ADMIN.get('/api/calendar?from=2026-01-01&to=2028-12-31').expect(400);
    await ag.ADMIN.get(`/api/calendar?from=${to}&to=${from}&kind=followup`).expect(400);
    await ag.ADMIN.get(`/api/calendar?from=${from}&to=${to}&status=NOPE`).expect(400);
  });

  it('dashboard: seguimientos por estado y clientes que requieren atención (datos reales)', async () => {
    const d = (await ag.ADMIN.get('/api/dashboard/summary').expect(200)).body;
    expect(d.followUps.byStatus.map((s: any) => s.name)).toEqual(['PENDIENTE', 'EN PROCESO', 'ESPERANDO CLIENTE', 'ESPERANDO REPUESTOS', 'PROGRAMADO', 'FINALIZADO', 'CANCELADO']);
    const total = d.followUps.byStatus.reduce((a: number, s: any) => a + s.count, 0);
    expect(total).toBe(await prisma.followUp.count());
    expect(d.followUps.pending).toBeGreaterThan(0);
    expect(d.followUps.finished).toBe(await prisma.followUp.count({ where: { status: { name: 'FINALIZADO' } } }));
    expect(d.followUps.byStatus.find((s: any) => s.name === 'CANCELADO').count).toBeGreaterThanOrEqual(1);
    expect(d.followUps.open).toBe(d.followUps.byStatus.filter((s: any) => !s.isTerminal).reduce((a: number, s: any) => a + s.count, 0));
    expect(d.clients.needingAttention).toBeGreaterThanOrEqual(0);
    const t = (await ag.TECNICO.get('/api/dashboard/summary').expect(200)).body;
    expect(t.clients.needingAttention).toBeNull();
    expect(t.followUps.open).toBeLessThan(d.followUps.open);
  });
});
