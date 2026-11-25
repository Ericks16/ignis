import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, todayLocal } from '../src/common/dates';
import { toCsv } from '../src/reports/reports.export';
import { PrismaService } from '../src/prisma/prisma.service';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };
const TODAY = todayLocal();
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

const binary = (r: request.Response, cb: (e: Error | null, b: Buffer) => void) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); };

describe('Reportes y exportaciones (unitarias)', () => {
  it('CSV: BOM UTF-8, comillas escapadas y fórmulas neutralizadas', () => {
    const buf = toCsv({
      title: 'T', filters: [], generatedAt: '', generatedBy: '',
      columns: [{ key: 'a', label: 'Cliente', type: 'text' }, { key: 'n', label: 'Total', type: 'number' }],
      rows: [{ a: 'Ñandú, "SA"', n: 3 }, { a: '=HYPERLINK("x")', n: null }, { a: '-cmd', n: 0 }], totals: { a: 'TOTAL', n: 3 },
    });
    const s = buf.toString('utf8');
    expect(s.charCodeAt(0)).toBe(0xfeff);
    expect(s).toContain('Cliente,Total');
    expect(s).toContain('"Ñandú, ""SA""",3');
    expect(s).toContain('"\'=HYPERLINK(""x"")",');
    expect(s).toContain("'-cmd,0");
    expect(s.trimEnd().endsWith('TOTAL,3')).toBe(true);
  });
});

describe('Reportes y exportaciones (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ag: Record<string, ReturnType<typeof request.agent>> = {};
  const uid: Record<string, string> = {};
  const id: Record<string, string> = {};

  const get = (a: string, path: string) => ag[a].get(`/api/reports/${path}`);
  const rows = async (a: string, path: string) => (await get(a, path).expect(200)).body;
  const download = (a: string, key: string, qs: string) => ag[a].get(`/api/reports/${key}/export?${qs}`).buffer(true).parse(binary);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    // Los reportes agregan datos de TODO el sistema: se parte de una base de negocio vacía (las suites se ejecutan una tras otra).
    await prisma.notification.deleteMany(); await prisma.activity.deleteMany(); await prisma.followUp.deleteMany(); await prisma.maintenance.deleteMany();
    await prisma.equipment.deleteMany(); await prisma.installedSystem.deleteMany(); await prisma.installation.deleteMany(); await prisma.clientContact.deleteMany();
    await prisma.client.deleteMany(); await prisma.technician.deleteMany();
    for (const [key, role] of [['ADMIN', Role.ADMIN], ['OPERATIVO', Role.OPERATIVO], ['TECNICO', Role.TECNICO], ['CONSULTA', Role.CONSULTA]] as const) {
      const email = `${key.toLowerCase()}@rp.local`;
      const u = await prisma.user.create({ data: { email, name: `Usuario ${key}`, role, passwordHash: await bcrypt.hash(PASS, 4) } });
      uid[key] = u.id;
      const a = request.agent(app.getHttpServer());
      await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
      ag[key] = a;
    }
    const cats = await prisma.systemCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    id.catAlarma = cats.find((c) => c.name.startsWith('SISTEMA'))!.id;
    id.catBomba = cats.find((c) => c.name === 'BOMBA CI')!.id;
    const mt = await prisma.maintenanceType.findMany();
    id.mtPrev = mt.find((t) => t.name === 'Preventivo')!.id;
    id.mtCorr = mt.find((t) => t.name === 'Correctivo')!.id;
    id.fuType = (await prisma.followUpType.findFirstOrThrow()).id;
    id.actType = (await prisma.activityType.findFirstOrThrow()).id;

    // Clientes: A (Quito, activo) con 2 sistemas; B (Guayaquil, inactivo) con 1
    const mk = async (name: string, city: string, status: 'ACTIVE' | 'INACTIVE', ruc?: string) =>
      prisma.client.create({ data: { commercialName: name, normalizedName: name.toLowerCase(), city, status, ruc } });
    const A = await mk('Cliente Reporte A', 'Quito', 'ACTIVE', '1790011111001');
    const B = await mk('Cliente "Reporte" B, SA', 'Guayaquil', 'INACTIVE');
    const X = await mk('=Cliente Fórmula', 'Quito', 'ACTIVE');
    id.A = A.id; id.B = B.id; id.X = X.id;
    const iA = await prisma.installation.create({ data: { clientId: A.id, name: 'Matriz A' } });
    const iB = await prisma.installation.create({ data: { clientId: B.id, name: 'Planta B' } });
    const iX = await prisma.installation.create({ data: { clientId: X.id, name: 'Sede X' } });
    const sysA1 = await prisma.installedSystem.create({ data: { installationId: iA.id, categoryId: id.catAlarma, brand: 'Bosch', model: 'FPA 1000', responsibleId: uid.OPERATIVO } });
    const sysA2 = await prisma.installedSystem.create({ data: { installationId: iA.id, categoryId: id.catBomba } });
    const sysB = await prisma.installedSystem.create({ data: { installationId: iB.id, categoryId: id.catAlarma, status: 'INACTIVE' } });
    const sysX = await prisma.installedSystem.create({ data: { installationId: iX.id, categoryId: id.catBomba } });
    const eqType = await prisma.equipmentType.findFirstOrThrow();
    await prisma.equipment.create({ data: { systemId: sysA1.id, typeId: eqType.id, quantity: 59 } });
    await prisma.equipment.create({ data: { systemId: sysA1.id, typeId: eqType.id, quantity: 1, active: false } }); // no cuenta

    // Técnicos: T1 vinculado al usuario TECNICO; T2 sin usuario
    const t1 = await prisma.technician.create({ data: { name: 'Técnico Uno', initials: 'TU', userId: uid.TECNICO } });
    const t2 = await prisma.technician.create({ data: { name: 'Técnico Dos', initials: 'TD' } });
    id.t1 = t1.id; id.t2 = t2.id;
    const m = (systemId: string, status: string, scheduled: string, extra: object = {}, techs: string[] = []) =>
      prisma.maintenance.create({ data: { systemId, typeId: id.mtPrev, scheduledDate: D(scheduled), status: status as never, technicians: { create: techs.map((technicianId) => ({ technicianId })) }, ...extra } });
    // A: realizado hace 20 días (T1), vencido hace 10 días (T1), próximo en 10 días (T2), lejano en 90 días (T1+T2), cancelado
    await m(sysA1.id, 'REALIZADO', addDays(TODAY, -20), { executedDate: D(addDays(TODAY, -20)), result: 'Satisfactorio', nextMaintenanceDate: D(addDays(TODAY, 160)) }, [t1.id]);
    await m(sysA1.id, 'PROGRAMADO', addDays(TODAY, -10), {}, [t1.id]);
    await m(sysA2.id, 'PENDIENTE', addDays(TODAY, 10), { typeId: id.mtCorr }, [t2.id]);
    await m(sysA2.id, 'PROGRAMADO', addDays(TODAY, 90), {}, [t1.id, t2.id]);
    await m(sysA1.id, 'CANCELADO', addDays(TODAY, 5), {}, [t1.id]);
    // X: realizado hace 40 días (T2) y vencido hace 3 (T2): el Técnico T1 NO lo ve
    await m(sysX.id, 'REALIZADO', addDays(TODAY, -40), { executedDate: D(addDays(TODAY, -40)) }, [t2.id]);
    await m(sysX.id, 'EN_PROCESO', addDays(TODAY, -3), {}, [t2.id]);

    // Seguimientos
    const pend = (await prisma.followUpStatus.findFirstOrThrow({ where: { name: 'PENDIENTE' } })).id;
    const fin = (await prisma.followUpStatus.findFirstOrThrow({ where: { name: 'FINALIZADO' } })).id;
    const fu = (clientId: string, title: string, statusId: string, extra: object = {}) =>
      prisma.followUp.create({ data: { clientId, title, typeId: id.fuType, statusId, startDate: D(addDays(TODAY, -30)), ...extra } });
    await fu(A.id, 'Seguimiento vencido A', pend, { targetDate: D(addDays(TODAY, -5)), priority: 'ALTA', responsibleId: uid.TECNICO });
    await fu(A.id, 'Seguimiento en plazo A', pend, { targetDate: D(addDays(TODAY, 40)), priority: 'BAJA', responsibleId: uid.OPERATIVO });
    await fu(X.id, 'Seguimiento de X (ajeno al técnico)', pend, { targetDate: D(addDays(TODAY, -2)), priority: 'MEDIA' });
    await fu(A.id, 'Seguimiento finalizado A', fin, { completedAt: new Date(`${addDays(TODAY, -3)}T15:00:00Z`), completedById: uid.ADMIN });
    await fu(A.id, 'Seguimiento finalizado viejo', fin, { completedAt: new Date(`${addDays(TODAY, -100)}T15:00:00Z`), completedById: uid.ADMIN });

    // Actividades: una de TECNICO, una de OPERATIVO
    await prisma.activity.create({ data: { clientId: A.id, userId: uid.TECNICO, typeId: id.actType, description: 'Visita del técnico', occurredAt: new Date(`${addDays(TODAY, -2)}T16:00:00Z`) } });
    await prisma.activity.create({ data: { clientId: X.id, userId: uid.OPERATIVO, typeId: id.actType, description: 'Llamada a X', occurredAt: new Date(`${addDays(TODAY, -1)}T16:00:00Z`) } });
  });
  afterAll(async () => { await app.close(); });

  it('catálogo de reportes por rol: 13 para el personal, subconjunto para el Técnico', async () => {
    const admin = (await ag.ADMIN.get('/api/reports').expect(200)).body;
    expect(admin).toHaveLength(13);
    expect(admin.map((r: any) => r.key)).toEqual(expect.arrayContaining(['clients', 'systems', 'systems-by-category', 'maintenance-done', 'maintenance-pending', 'maintenance-overdue', 'maintenance-upcoming', 'maintenance-by-technician', 'maintenance-by-client', 'followups-pending', 'followups-done', 'followups-overdue', 'activities-by-technician']));
    expect(admin.every((r: any) => r.title && r.description && Array.isArray(r.filters))).toBe(true);
    expect(JSON.stringify(admin)).not.toMatch(/"roles"|"run"/);
    expect((await ag.CONSULTA.get('/api/reports').expect(200)).body).toHaveLength(13);
    const tec = (await ag.TECNICO.get('/api/reports').expect(200)).body.map((r: any) => r.key);
    expect(tec).not.toEqual(expect.arrayContaining(['clients']));
    for (const k of ['clients', 'systems', 'systems-by-category', 'maintenance-by-client']) expect(tec).not.toContain(k);
    expect(tec).toEqual(expect.arrayContaining(['maintenance-pending', 'followups-pending', 'activities-by-technician']));
    await request(app.getHttpServer()).get('/api/reports').expect(401);
  });

  it('permisos: el Técnico no abre reportes de personal; reporte inexistente 404', async () => {
    await get('TECNICO', 'clients').expect(403);
    await get('TECNICO', 'systems-by-category').expect(403);
    await ag.TECNICO.get('/api/reports/clients/export?format=csv').expect(403);
    await get('ADMIN', 'no-existe').expect(404);
    await get('CONSULTA', 'clients').expect(200);
  });

  it('clientes: conteos correctos y filtros por estado, ciudad y búsqueda', async () => {
    const all = await rows('ADMIN', 'clients?pageSize=200');
    const a = all.rows.find((r: any) => r.name === 'Cliente Reporte A');
    expect(a).toMatchObject({ ruc: '1790011111001', city: 'Quito', status: 'Activo', installations: 1, systems: 2, overdue: 1, openFollowUps: 2 });
    expect(all.columns.map((c: any) => c.label)).toEqual(expect.arrayContaining(['Cliente', 'RUC', 'Instalaciones', 'Mantenimientos vencidos']));
    expect((await rows('ADMIN', 'clients?status=INACTIVE')).rows.map((r: any) => r.name)).toEqual(['Cliente "Reporte" B, SA']);
    const quito = (await rows('ADMIN', 'clients?city=quito')).rows.map((r: any) => r.name);
    expect(quito).toEqual(expect.arrayContaining(['Cliente Reporte A', '=Cliente Fórmula']));
    expect((await rows('ADMIN', 'clients?search=1790011111')).total).toBe(1);
    await get('ADMIN', 'clients?status=OTRO').expect(400);
  });

  it('sistemas y sistemas por categoría', async () => {
    const s = await rows('OPERATIVO', 'systems?clientId=' + id.A);
    expect(s.total).toBe(2);
    expect(s.rows.find((r: any) => r.brand === 'Bosch')).toMatchObject({ category: expect.stringMatching(/^SISTEMA/), devices: 59, responsible: 'Usuario OPERATIVO', status: 'Activo' });
    expect((await rows('ADMIN', 'systems?status=INACTIVE')).total).toBe(1);
    const cat = await rows('ADMIN', 'systems-by-category');
    const alarma = cat.rows.find((r: any) => String(r.category).startsWith('SISTEMA'));
    expect(alarma).toMatchObject({ active: 1, inactive: 1, total: 2, clients: 2 });
    expect(cat.rows.length).toBeGreaterThanOrEqual(7); // todas las categorías, incluso con cero
    expect(cat.totals).toMatchObject({ category: 'TOTAL', total: 4, active: 3, inactive: 1 });
    expect((await rows('ADMIN', 'systems-by-category?clientId=' + id.A)).totals).toMatchObject({ total: 2 });
  });

  it('mantenimientos realizados: rango por fecha de ejecución y filtros', async () => {
    const all = await rows('ADMIN', 'maintenance-done?pageSize=200');
    expect(all.total).toBe(2);
    expect(all.rows[0].executed >= all.rows[1].executed).toBe(true); // más reciente primero
    const mine = all.rows.find((r: any) => r.client === 'Cliente Reporte A');
    expect(mine).toMatchObject({ result: 'Satisfactorio', technicians: 'Técnico Uno', next: addDays(TODAY, 160) });
    expect((await rows('ADMIN', `maintenance-done?from=${addDays(TODAY, -30)}`)).total).toBe(1);
    expect((await rows('ADMIN', `maintenance-done?to=${addDays(TODAY, -30)}`)).total).toBe(1);
    expect((await rows('ADMIN', `maintenance-done?clientId=${id.A}`)).total).toBe(1);
    expect((await rows('ADMIN', `maintenance-done?technicianId=${id.t2}`)).rows.map((r: any) => r.client)).toEqual(['=Cliente Fórmula']);
    expect((await rows('ADMIN', `maintenance-done?typeId=${id.mtCorr}`)).total).toBe(0);
    await get('ADMIN', `maintenance-done?from=${TODAY}&to=${addDays(TODAY, -1)}`).expect(400);
    await get('ADMIN', 'maintenance-done?from=31/12/2026').expect(400);
  });

  it('pendientes, vencidos y próximos con su situación', async () => {
    const pend = await rows('ADMIN', 'maintenance-pending?pageSize=200');
    expect(pend.total).toBe(4); // abiertos: A (vencido, pendiente, lejano) + X (en proceso)
    const sit = Object.fromEntries(pend.rows.map((r: any) => [r.scheduled, r.situation]));
    expect(sit[addDays(TODAY, -10)]).toBe('Vencido');
    expect(sit[addDays(TODAY, 10)]).toBe('Próximo');
    expect(sit[addDays(TODAY, 90)]).toBe('Programado');
    expect((await rows('ADMIN', 'maintenance-pending?status=PENDIENTE')).total).toBe(1);
    expect((await rows('ADMIN', `maintenance-pending?categoryId=${id.catBomba}&clientId=${id.A}`)).total).toBe(2);
    const od = await rows('ADMIN', 'maintenance-overdue');
    expect(od.rows.map((r: any) => r.daysLate).sort((a: number, b: number) => a - b)).toEqual([3, 10]);
    expect(od.rows.every((r: any) => r.status !== 'Realizado')).toBe(true);
    const up = await rows('ADMIN', 'maintenance-upcoming');
    expect(up.rows.map((r: any) => r.daysLeft)).toEqual([10]); // 30 días por defecto
    expect((await rows('ADMIN', 'maintenance-upcoming?days=100')).total).toBe(2);
    expect((await rows('ADMIN', 'maintenance-upcoming?days=100&technicianId=' + id.t1)).total).toBe(1);
    await get('ADMIN', 'maintenance-upcoming?days=0').expect(400);
    await get('ADMIN', 'maintenance-upcoming?days=999').expect(400);
  });

  it('mantenimientos por técnico y por cliente (totales coherentes)', async () => {
    const bt = await rows('ADMIN', 'maintenance-by-technician');
    const t1 = bt.rows.find((r: any) => r.technician === 'Técnico Uno');
    const t2 = bt.rows.find((r: any) => r.technician === 'Técnico Dos');
    expect(t1).toMatchObject({ assigned: 4, done: 1, pending: 2, inProcess: 0, overdue: 1, cancelled: 1 });
    expect(t2).toMatchObject({ assigned: 4, done: 1, inProcess: 1, pending: 2, overdue: 1 });
    expect(bt.totals).toMatchObject({ technician: 'TOTAL' });
    expect(bt.totals.assigned).toBe(t1.assigned + t2.assigned + (bt.rows.filter((r: any) => !['Técnico Uno', 'Técnico Dos'].includes(r.technician)).reduce((a: number, r: any) => a + r.assigned, 0)));
    expect((await rows('ADMIN', `maintenance-by-technician?technicianId=${id.t1}`)).rows).toHaveLength(1);
    const bc = await rows('OPERATIVO', 'maintenance-by-client');
    const a = bc.rows.find((r: any) => r.client === 'Cliente Reporte A');
    expect(a).toMatchObject({ total: 5, done: 1, pending: 3, overdue: 1, cancelled: 1, lastDone: addDays(TODAY, -20), nextScheduled: addDays(TODAY, 10) });
    await get('TECNICO', 'maintenance-by-client').expect(403);
  });

  it('seguimientos pendientes, finalizados y vencidos', async () => {
    const p = await rows('ADMIN', 'followups-pending?pageSize=200');
    expect(p.total).toBe(3);
    expect(Object.fromEntries(p.rows.map((r: any) => [r.title, r.situation]))).toMatchObject({ 'Seguimiento vencido A': 'Vencido', 'Seguimiento en plazo A': 'En plazo' });
    expect((await rows('ADMIN', 'followups-pending?priority=ALTA')).total).toBe(1);
    expect((await rows('ADMIN', `followups-pending?responsibleId=${uid.OPERATIVO}`)).rows.map((r: any) => r.title)).toEqual(['Seguimiento en plazo A']);
    expect((await rows('ADMIN', 'followups-pending?search=ajeno')).total).toBe(1);
    const od = await rows('ADMIN', 'followups-overdue');
    expect(od.rows.map((r: any) => r.daysLate).sort((a: number, b: number) => a - b)).toEqual([2, 5]);
    const done = await rows('ADMIN', 'followups-done?pageSize=200');
    expect(done.total).toBe(2);
    expect(done.rows[0]).toMatchObject({ title: 'Seguimiento finalizado A', completedBy: 'Usuario ADMIN' });
    expect((await rows('ADMIN', `followups-done?from=${addDays(TODAY, -10)}`)).total).toBe(1);
    expect((await rows('ADMIN', `followups-done?to=${addDays(TODAY, -50)}`)).rows.map((r: any) => r.title)).toEqual(['Seguimiento finalizado viejo']);
  });

  it('actividades por técnico: se filtra por el usuario vinculado al técnico', async () => {
    const all = await rows('ADMIN', 'activities-by-technician');
    expect(all.total).toBe(2);
    expect(all.rows[0].when >= all.rows[1].when).toBe(true);
    expect((await rows('ADMIN', `activities-by-technician?technicianId=${id.t1}`)).rows.map((r: any) => r.user)).toEqual(['Usuario TECNICO']);
    expect((await rows('ADMIN', `activities-by-technician?clientId=${id.X}`)).total).toBe(1);
    expect((await rows('ADMIN', `activities-by-technician?from=${addDays(TODAY, -1)}`)).total).toBe(1);
  });

  it('paginación del resultado', async () => {
    const p1 = await rows('ADMIN', 'clients?page=1&pageSize=2');
    const p2 = await rows('ADMIN', 'clients?page=2&pageSize=2');
    expect(p1.rows).toHaveLength(2);
    expect(p1.total).toBeGreaterThanOrEqual(3);
    expect(p2.rows[0].name).not.toBe(p1.rows[0].name);
    await get('ADMIN', 'clients?pageSize=500').expect(400);
  });

  it('alcance del Técnico: en pantalla y al exportar solo ve lo asignado a él', async () => {
    const pend = await rows('TECNICO', 'maintenance-pending?pageSize=200');
    expect(pend.rows.every((r: any) => r.client === 'Cliente Reporte A')).toBe(true);
    expect(pend.total).toBe(2); // solo lo asignado al técnico vinculado (T1)
    expect((await rows('TECNICO', 'maintenance-overdue')).total).toBe(1);
    const bt = await rows('TECNICO', 'maintenance-by-technician');
    expect(bt.rows.map((r: any) => r.technician)).toEqual(['Técnico Uno']); // no ve a los demás técnicos
    expect((await rows('TECNICO', 'followups-pending')).rows.map((r: any) => r.title)).toEqual(['Seguimiento vencido A']);
    expect((await rows('TECNICO', 'activities-by-technician')).rows.map((r: any) => r.description)).toEqual(['Visita del técnico']);
    // exportación con el mismo alcance
    const csv = (await download('TECNICO', 'maintenance-pending', 'format=csv').expect(200)).body as Buffer;
    expect(csv.toString('utf8')).not.toContain('Fórmula');
    expect(csv.toString('utf8')).toContain('Cliente Reporte A');
  });

  it('exportar a Excel: encabezados, filas, fechas reales, totales y hoja de filtros', async () => {
    const res = await download('ADMIN', 'maintenance-by-client', `format=xlsx&clientId=${id.A}`).expect(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(new RegExp(`maintenance-by-client-${TODAY}\\.xlsx`));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(1).value).toBe('Cliente');
    expect(ws.getRow(2).getCell(1).value).toBe('Cliente Reporte A');
    expect(ws.getRow(2).getCell(2).value).toBe(5);
    expect(ws.getRow(2).getCell(7).value).toBeInstanceOf(Date); // «Último realizado» como fecha real
    expect(ws.getRow(3).getCell(1).value).toBe('TOTAL');
    const info = wb.getWorksheet('Filtros')!;
    const text: string[] = [];
    info.eachRow((r) => text.push(`${r.getCell(1).value}=${r.getCell(2).value}`));
    expect(text).toEqual(expect.arrayContaining(['Reporte=Mantenimientos por cliente', 'Cliente=Cliente Reporte A', 'Generado por=Usuario ADMIN']));
    // respeta los filtros: con otro cliente no aparece A
    const other = await download('ADMIN', 'maintenance-by-client', `format=xlsx&clientId=${id.B}`).expect(200);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(other.body as unknown as ExcelJS.Buffer);
    expect(wb2.worksheets[0].rowCount).toBe(2); // solo encabezado + total
  });

  it('exportar a CSV: BOM, comillas, y neutraliza fórmulas de los datos', async () => {
    const res = await download('OPERATIVO', 'clients', 'format=csv').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const s = (res.body as Buffer).toString('utf8');
    expect(s.charCodeAt(0)).toBe(0xfeff);
    expect(s).toContain('"Cliente ""Reporte"" B, SA"');
    expect(s).toContain("'=Cliente Fórmula"); // no empieza con "=": Excel no la ejecuta
    expect(s).not.toMatch(/(^|\r\n)=Cliente/);
    expect(s).toContain('Ñ'.length ? 'Cliente' : '');
  });

  it('exportar a PDF: documento válido, varias páginas con muchas filas y filtros en el encabezado', async () => {
    await prisma.client.createMany({ data: Array.from({ length: 140 }, (_, i) => ({ commercialName: `Cliente masivo ${String(i).padStart(3, '0')}`, normalizedName: `cliente masivo ${i}`, city: 'Ambato' })) });
    const res = await download('ADMIN', 'clients', 'format=pdf&city=Ambato').expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
    expect(pages).toBeGreaterThan(2);
    const small = await download('ADMIN', 'clients', `format=pdf&search=1790011111`).expect(200);
    expect((((small.body as Buffer).toString('latin1').match(/\/Type \/Page\b(?!s)/g)) ?? []).length).toBe(1);
  });

  it('exportación: formato obligatorio y válido, auditoría y reportes sin datos', async () => {
    await ag.ADMIN.get('/api/reports/clients/export').expect(400);
    await ag.ADMIN.get('/api/reports/clients/export?format=docx').expect(400);
    await ag.ADMIN.get('/api/reports/no-existe/export?format=csv').expect(404);
    await request(app.getHttpServer()).get('/api/reports/clients/export?format=csv').expect(401);
    const empty = await download('ADMIN', 'maintenance-done', `format=csv&from=2001-01-01&to=2001-01-02`).expect(200);
    expect((empty.body as Buffer).toString('utf8').trim().split(/\r?\n/)).toHaveLength(1); // solo encabezado
    const pdf = await download('ADMIN', 'maintenance-done', `format=pdf&from=2001-01-01&to=2001-01-02`).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await prisma.auditLog.count({ where: { action: 'report.exported', entityId: 'maintenance-done' } })).toBeGreaterThanOrEqual(2);
  });

  it('dashboard: clientes que requieren atención (con detalle), sistemas por categoría y filtro de año', async () => {
    const d = (await ag.ADMIN.get('/api/dashboard/summary').expect(200)).body;
    expect(d.clients.needingAttention).toBeGreaterThanOrEqual(2);
    const top = d.clients.attention.find((c: any) => c.name === 'Cliente Reporte A');
    expect(top).toMatchObject({ overdueMaintenances: 1, overdueFollowUps: 1 });
    expect(d.clients.attention.length).toBeLessThanOrEqual(8);
    expect(d.systemsByCategory.reduce((a: number, c: any) => a + c.count, 0)).toBe(await prisma.installedSystem.count({ where: { status: 'ACTIVE' } }));
    const y = (await ag.ADMIN.get(`/api/dashboard/summary?year=${Number(TODAY.slice(0, 4)) - 1}`).expect(200)).body.maintenance;
    expect(y.year).toBe(Number(TODAY.slice(0, 4)) - 1);
    await ag.ADMIN.get('/api/dashboard/summary?year=abc').expect(400);
    await ag.ADMIN.get('/api/dashboard/summary?year=1850').expect(400);
    const t = (await ag.TECNICO.get('/api/dashboard/summary').expect(200)).body;
    expect(t.clients.attention).toBeNull();
  });
});
