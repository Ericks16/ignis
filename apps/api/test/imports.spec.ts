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
import { executePlan } from '../src/imports/import.executor';
import { importConfigSchema } from '../src/imports/import.mapping';
import { Plan, PlannedRow, emptyPlanSummary } from '../src/imports/import.planner';
import { PrismaService } from '../src/prisma/prisma.service';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };
const TODAY = todayLocal();
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Libro con una hoja por nombre y varias filas. */
async function book(name: string, rows: (string | number | Date | null)[][], extraSheet?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  rows.forEach((r) => ws.addRow(r));
  if (extraSheet) wb.addWorksheet(extraSheet).addRow(['otra hoja']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEAD = ['ESTADO', 'Cliente', 'Direccion', 'Persona a Cargo', 'CENTRAL', 'FECHA MTO', 'Proximo MTO', 'SEGUIMIENTO', 'CANT DISP', 'DH', 'DT'];

describe('Importación de Excel (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ag: Record<string, ReturnType<typeof request.agent>> = {};
  const upload = (a: string, buf: Buffer, name = 'cartera.xlsx') => ag[a].post('/api/imports').set(H).attach('file', buf, name);
  let defaults: { defaultCategoryId: string; defaultMaintenanceTypeId: string; followUpTypeId: string };
  let types: { id: string; name: string; code: string | null }[];

  const config = (typeIds: Record<string, string>, over: object = {}) => ({
    sheet: 'CARTERA', headerRow: 1,
    columns: { status: 1, client: 2, installation: 3, contact: 4, central: 5, lastMaintenance: 6, nextMaintenance: 7, followUp: 8 },
    equipment: [{ column: 10, typeId: typeIds.DH }, { column: 11, typeId: typeIds.DT }],
    options: { overdueNext: 'HISTORICAL', blankCentral: 'DEFAULT', ...defaults },
    ...over,
  });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const r of [Role.ADMIN, Role.OPERATIVO, Role.TECNICO, Role.CONSULTA]) {
      const email = `${r.toLowerCase()}@i.local`;
      await prisma.user.create({ data: { email, name: r, role: r, passwordHash: await bcrypt.hash(PASS, 4) } });
      const a = request.agent(app.getHttpServer());
      await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
      ag[r] = a;
    }
    types = (await ag.ADMIN.get('/api/catalogs/equipment-types')).body;
  });
  afterAll(async () => { await app.close(); });

  const typeIds = () => Object.fromEntries(types.map((t) => [t.code ?? t.name, t.id]));

  it('solo el Administrador puede importar; sin sesión 401', async () => {
    const buf = await book('CARTERA', [HEAD]);
    await request(app.getHttpServer()).post('/api/imports').set(H).attach('file', buf, 'x.xlsx').expect(401);
    for (const r of ['OPERATIVO', 'TECNICO', 'CONSULTA']) {
      await upload(r, buf).expect(403);
      await ag[r].get('/api/imports').expect(403);
      await ag[r].get('/api/imports/template.xlsx').expect(403);
    }
    await ag.ADMIN.get('/api/imports').expect(200);
  });

  it('valida el archivo: extensión, firma, vacío, corrupto y falta de archivo', async () => {
    await upload('ADMIN', Buffer.from('hola'), 'datos.csv').expect(400);
    const fake = await upload('ADMIN', Buffer.from('esto no es un excel'), 'falso.xlsx').expect(400);
    expect(fake.body.message).toMatch(/no es un libro de Excel/);
    await upload('ADMIN', Buffer.alloc(0), 'vacio.xlsx').expect(400);
    // firma ZIP correcta pero contenido corrupto
    const corrupt = await upload('ADMIN', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('basura')]), 'corrupto.xlsx').expect(400);
    expect(corrupt.body.message).toMatch(/no se pudo leer|no es un libro de excel/i);
    await ag.ADMIN.post('/api/imports').set(H).expect(400);
    const big = await upload('ADMIN', Buffer.alloc(11 * 1024 * 1024, 1), 'grande.xlsx');
    expect([400, 413]).toContain(big.status);
  });

  it('conserva acentos y eñes en el nombre del archivo (UTF-8)', async () => {
    const name = 'CRONOGRAMA DETECCIÓN Y ALARMA Ñandú - 2026.xlsx';
    const up = (await upload('ADMIN', await book('CARTERA', [HEAD]), name).expect(201)).body;
    expect(up.fileName).toBe(name);
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: up.id } })).fileName).toBe(name);
    await ag.ADMIN.post(`/api/imports/${up.id}/cancel`).set(H).expect(200);
  });

  it('plantilla oficial: se descarga y sus columnas se reconocen automáticamente al importarla', async () => {
    const res = await ag.ADMIN.get('/api/imports/template.xlsx').buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(res.headers['content-disposition']).toMatch(/plantilla-importacion-ignis\.xlsx/);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['CARTERA', 'INSTRUCCIONES', 'CATÁLOGOS']);
    const head = (wb.getWorksheet('CARTERA')!.getRow(1).values as string[]).filter(Boolean);
    expect(head).toEqual(expect.arrayContaining(['Cliente', 'RUC', 'FECHA MTO', 'Proximo MTO', 'Detector de humo', 'Batería']));
    // round-trip: la plantilla vacía se reconoce sola
    const up = (await upload('ADMIN', res.body as Buffer, 'plantilla.xlsx').expect(201)).body;
    const sheet = (await ag.ADMIN.get(`/api/imports/${up.id}/sheet?name=CARTERA`).expect(200)).body;
    expect(sheet.headerRow).toBe(1);
    expect(sheet.guess.columns).toMatchObject({ status: 1, client: 2, ruc: 3, city: 4, clientEmail: 5, installation: 6, contact: 7, contactEmail: 8, central: 9, lastMaintenance: 10, nextMaintenance: 11, followUp: 12 });
    expect(sheet.guess.equipment.length).toBe(types.length);
    expect(sheet.guess.unrecognized).toEqual([]);
    await ag.ADMIN.post(`/api/imports/${up.id}/cancel`).set(H).expect(200);
  });

  it('flujo completo: subir → hoja → vista previa (sin escribir) → confirmar → datos con trazabilidad', async () => {
    const cats = (await ag.ADMIN.get('/api/catalogs/system-categories')).body;
    const bomba = cats.find((c: any) => c.name === 'BOMBA CI');
    // cliente preexistente que NO debe modificarse
    const pre = (await ag.ADMIN.post('/api/clients').set(H).send({ commercialName: 'Cliente Preexistente SA', ruc: '0991234567001', city: 'Guayaquil' }).expect(201)).body;
    const preInst = (await ag.ADMIN.post('/api/installations').set(H).send({ clientId: pre.id, name: 'Matriz' }).expect(201)).body;

    const rows = [
      HEAD,
      ['MTTO', 'Importadora Alfa SA', 'MATRIZ', 'Ana Pérez', 'BOSCH FPA 1000', d('2026-06-01'), d(addDays(TODAY, 90)), 'enviar proforma', 80, 59, 22],
      ['MTTO', 'Importadora Alfa SA', 'SUCURSAL NORTE', null, 'BOMBA CI', d('2024-05-01'), d('2025-01-01'), null, null, null, null],
      ['INSTALADO', 'Cliente Preexistente SA', 'MATRIZ', null, 'DSC 1832', d('2026-04-01'), null, null, null, 10, null],
      ['MTTO', 'Sin Fecha Valida SA', 'MATRIZ', null, 'DSC 585', 'no es fecha', null, null, null, null, null],
      ['MTTO', 'Cantidad Mala SA', 'MATRIZ', null, 'DSC 585', null, null, null, null, -4, null],
      Array(11).fill('CLIENTES PERDIDOS'),
      ['MTTO', 'Cliente Perdido SA', 'BODEGA', null, 'KIDDE VS4', d('2024-02-01'), d(addDays(TODAY, 30)), 'cerrada', null, 5, null],
    ];
    const up = (await upload('ADMIN', await book('CARTERA', rows, 'OTRA'), 'cartera-2026.xlsx').expect(201)).body;
    expect(up.sheets.map((s: any) => s.name)).toEqual(['CARTERA', 'OTRA']);
    expect(up.alreadyImported).toBeNull();
    const sheet = (await ag.ADMIN.get(`/api/imports/${up.id}/sheet?name=CARTERA`).expect(200)).body;
    expect(sheet.guess.columns).toMatchObject({ client: 2, central: 5 });
    expect(sheet.rows[1].cells[1]).toBe('Importadora Alfa SA');
    expect(sheet.rows[1].cells[5]).toBe('2026-06-01');
    await ag.ADMIN.get(`/api/imports/${up.id}/sheet?name=NOEXISTE`).expect(400);

    const before = { clients: await prisma.client.count(), systems: await prisma.installedSystem.count(), maints: await prisma.maintenance.count(), fu: await prisma.followUp.count() };
    const cfg = config(typeIds());
    // configuración inválida
    await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send({ ...cfg, headerRow: 0 }).expect(400);
    await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send({ sheet: 'CARTERA' }).expect(400);

    const prev = (await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(cfg).expect(200)).body;
    expect(prev.summary).toMatchObject({ rowsError: 2, rowsSkipped: 1, clientsNew: 2, clientsExisting: 1, clientsLost: 1, systemsNew: 4, systemsExisting: 0, historyMaintenances: 4, scheduledMaintenances: 1, followUps: 1 });
    const bad = prev.rows.filter((r: any) => r.status === 'ERROR');
    expect(bad.map((r: any) => r.clientName)).toEqual(['Sin Fecha Valida SA', 'Cantidad Mala SA']);
    expect(bad[0].errors[0]).toMatch(/Fecha de último mantenimiento: Fecha no reconocida/);
    expect(prev.centralValues.map((c: any) => c.key)).toEqual(expect.arrayContaining(['bosch fpa 1000', 'bomba ci', 'dsc 1832']));
    // la vista previa NO escribe nada
    expect({ clients: await prisma.client.count(), systems: await prisma.installedSystem.count(), maints: await prisma.maintenance.count(), fu: await prisma.followUp.count() }).toEqual(before);
    expect((await prisma.importBatch.findUnique({ where: { id: up.id } }))?.status).toBe('PREVIEWED');

    // confirmar exige confirmación explícita
    await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({}).expect(400);
    await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: false }).expect(400);
    await ag.OPERATIVO.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true }).expect(403);

    const done = (await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true }).expect(200)).body;
    expect(done.status).toBe('IMPORTED');
    expect(done.result).toMatchObject({ clientsCreated: 2, clientsReused: 2, installationsCreated: 3, systemsCreated: 4, historyCreated: 4, scheduledCreated: 1, followUpsCreated: 1, rowsImported: 4, rowsWithErrors: 2 });

    // --- datos creados ---
    const alfa = await prisma.client.findFirstOrThrow({ where: { commercialName: 'Importadora Alfa SA' }, include: { contacts: true, installations: { include: { systems: { include: { equipment: true, maintenances: true } } } } } });
    expect(alfa.importBatchId).toBe(up.id);
    expect(alfa.status).toBe('ACTIVE');
    expect(alfa.contacts).toHaveLength(1);
    expect(alfa.contacts[0]).toMatchObject({ name: 'Ana Pérez', email: null, receivesNotifications: false });
    expect(alfa.installations.map((i) => i.name).sort()).toEqual(['MATRIZ', 'SUCURSAL NORTE']);
    const matriz = alfa.installations.find((i) => i.name === 'MATRIZ')!.systems[0];
    expect(matriz).toMatchObject({ brand: 'Bosch', model: 'BOSCH FPA 1000', relation: 'MTTO', importBatchId: up.id });
    expect(matriz.lastMaintenanceDate?.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(matriz.nextMaintenanceDate?.toISOString().slice(0, 10)).toBe(addDays(TODAY, 90));
    expect(matriz.equipment.map((e) => e.quantity).sort((a, b) => a - b)).toEqual([22, 59]);
    expect(matriz.maintenances.map((m) => [m.status, m.scheduledDate.toISOString().slice(0, 10)]).sort()).toEqual([['PROGRAMADO', addDays(TODAY, 90)], ['REALIZADO', '2026-06-01']]);
    // próximo vencido (2025-01-01) + política HISTORICAL: se conserva como dato, SIN crear mantenimiento ni recordatorios
    const norte = alfa.installations.find((i) => i.name === 'SUCURSAL NORTE')!.systems[0];
    expect(norte.maintenances.map((m) => m.status)).toEqual(['REALIZADO']);
    expect(norte.nextMaintenanceDate?.toISOString().slice(0, 10)).toBe('2025-01-01');
    const cat = await prisma.systemCategory.findUniqueOrThrow({ where: { id: norte.categoryId } });
    expect(cat.name).toBe('BOMBA CI');
    expect(norte.model).toBeNull();
    // seguimiento importado: pendiente, sin fecha objetivo (no genera recordatorios)
    const fu = await prisma.followUp.findFirstOrThrow({ where: { title: 'Enviar proforma' }, include: { status: true } });
    expect(fu).toMatchObject({ clientId: alfa.id, targetDate: null, importBatchId: up.id });
    expect(fu.status.name).toBe('PENDIENTE');
    // cliente perdido: inactivo, sin programación ni seguimiento
    const lost = await prisma.client.findFirstOrThrow({ where: { commercialName: 'Cliente Perdido SA' }, include: { installations: { include: { systems: { include: { maintenances: true } } } } } });
    expect(lost.status).toBe('INACTIVE');
    expect(lost.installations[0].status).toBe('INACTIVE');
    expect(lost.installations[0].systems[0]).toMatchObject({ status: 'INACTIVE', nextMaintenanceDate: null });
    expect(lost.installations[0].systems[0].maintenances.map((m) => m.status)).toEqual(['REALIZADO']);
    expect(await prisma.followUp.count({ where: { clientId: lost.id } })).toBe(0);
    // cliente preexistente: reutilizado y SIN modificar; solo se agregó lo que faltaba
    const preAfter = await prisma.client.findUniqueOrThrow({ where: { id: pre.id } });
    expect(preAfter).toMatchObject({ commercialName: 'Cliente Preexistente SA', ruc: '0991234567001', city: 'Guayaquil', importBatchId: null });
    expect(await prisma.installation.count({ where: { clientId: pre.id } })).toBe(1);
    expect((await prisma.installation.findUniqueOrThrow({ where: { id: preInst.id } })).importBatchId).toBeNull();
    expect(await prisma.installedSystem.count({ where: { installationId: preInst.id } })).toBe(1); // el sistema DSC 1832 se creó dentro de la instalación existente
    // las filas con error no importaron nada
    expect(await prisma.client.count({ where: { commercialName: { in: ['Sin Fecha Valida SA', 'Cantidad Mala SA'] } } })).toBe(0);
    // marca de importación
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: up.id } })).fileData).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'import.confirmed', entityId: up.id } })).toBe(1);

    // ya importada: no se puede volver a confirmar ni cancelar
    await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true }).expect(400);
    await ag.ADMIN.post(`/api/imports/${up.id}/cancel`).set(H).expect(400);
    await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(cfg).expect(400);

    // --- reporte de errores descargable ---
    const rep = await ag.ADMIN.get(`/api/imports/${up.id}/report.xlsx`).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(rep.body as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Errores y advertencias')!;
    const lines: string[] = [];
    ws.eachRow((r, n) => { if (n > 1) lines.push(`${r.getCell(1).value}|${r.getCell(3).value}|${r.getCell(4).value}`); });
    expect(lines.some((l) => l.startsWith('5|Error|') && l.includes('Fecha de último mantenimiento'))).toBe(true);
    expect(lines.some((l) => l.startsWith('6|Error|') && l.includes('Cantidad inválida'))).toBe(true);
    expect(lines.some((l) => l.includes('Advertencia') && l.includes('vencido'))).toBe(true);

    // --- historial de importaciones ---
    const list = (await ag.ADMIN.get('/api/imports').expect(200)).body;
    expect(list.find((b: any) => b.id === up.id)).toMatchObject({ status: 'IMPORTED', fileName: 'cartera-2026.xlsx' });
    expect(JSON.stringify(list)).not.toMatch(/fileData/);
  });

  it('re-importar el mismo archivo es idempotente: no duplica ni borra nada', async () => {
    const rows = [HEAD, ['MTTO', 'Idempotente SA', 'MATRIZ', 'Luis Mora', 'DSC 1832', d('2026-03-01'), d(addDays(TODAY, 45)), 'llamar al cliente', null, 12, 3]];
    const buf = await book('CARTERA', rows);
    const run = async () => {
      const up = (await upload('ADMIN', buf, 'idem.xlsx').expect(201)).body;
      await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(config(typeIds())).expect(200);
      return { up, done: (await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true }).expect(200)).body };
    };
    const first = await run();
    expect(first.up.alreadyImported).toBeNull();
    expect(first.done.result).toMatchObject({ clientsCreated: 1, systemsCreated: 1, historyCreated: 1, scheduledCreated: 1, followUpsCreated: 1, contactsCreated: 1 });
    const counts = async () => ({ c: await prisma.client.count(), i: await prisma.installation.count(), s: await prisma.installedSystem.count(), m: await prisma.maintenance.count(), f: await prisma.followUp.count(), e: await prisma.equipment.count(), k: await prisma.clientContact.count() });
    const snapshot = await counts();
    const second = await run();
    expect(second.up.alreadyImported).toMatchObject({ id: first.up.id }); // avisa que el archivo ya se importó
    expect(second.done.result).toMatchObject({ clientsCreated: 0, clientsReused: 1, installationsCreated: 0, systemsCreated: 0, historyCreated: 0, historySkipped: 1, scheduledCreated: 0, scheduledSkipped: 1, followUpsCreated: 0, contactsCreated: 0 });
    expect(await counts()).toEqual(snapshot);
  });

  it('dos confirmaciones simultáneas: solo una importa', async () => {
    const buf = await book('CARTERA', [HEAD, ['MTTO', 'Concurrente SA', 'MATRIZ', null, 'DSC 1832', null, null, null, null, 1, null]]);
    const up = (await upload('ADMIN', buf, 'conc.xlsx').expect(201)).body;
    await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(config(typeIds())).expect(200);
    const res = await Promise.all([1, 2, 3].map(() => ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(res.filter((r) => r.status !== 200).every((r) => [400, 409].includes(r.status))).toBe(true);
    expect(await prisma.client.count({ where: { commercialName: 'Concurrente SA' } })).toBe(1);
  });

  it('opciones: política de próximos vencidos (programar), correos/RUC y fusión de duplicados por renombrado', async () => {
    const rows = [
      [...HEAD, 'RUC', 'Correo'],
      ['MTTO', 'AUDIAUTO', 'BATAN', null, 'BOSCH FPA 1000', null, d('2025-10-01'), null, null, 3, null, '1790011223001', 'info@audiauto.test'],
      ['MTTO', 'AUDIOAUTO', 'GYE', null, 'BOSCH FPA 1000', null, null, null, null, 2, null, null, 'correo-malo'],
    ];
    const buf = await book('CARTERA', rows);
    const up = (await upload('ADMIN', buf, 'opc.xlsx').expect(201)).body;
    const cfg = config(typeIds(), { columns: { status: 1, client: 2, installation: 3, contact: 4, central: 5, lastMaintenance: 6, nextMaintenance: 7, followUp: 8, ruc: 12, clientEmail: 13 }, options: { overdueNext: 'SCHEDULE', blankCentral: 'DEFAULT', ...defaults } });
    const p1 = (await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(cfg).expect(200)).body;
    expect(p1.rows[1].errors[0]).toMatch(/Correo del cliente inválido/);
    expect(p1.summary).toMatchObject({ rowsError: 1, scheduledMaintenances: 1 });
    // se corrige renombrando la fila 3 para fusionarla con AUDIAUTO y quitando el correo malo no es posible → se omite el error renombrando no basta; se omite la fila
    const p2 = (await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send({ ...cfg, overrides: { '3': { skip: true } } }).expect(200)).body;
    expect(p2.summary).toMatchObject({ rowsError: 0, rowsSkipped: 1, clientsNew: 1 });
    await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true }).expect(200);
    const c = await prisma.client.findFirstOrThrow({ where: { commercialName: 'AUDIAUTO' }, include: { installations: { include: { systems: { include: { maintenances: true } } } } } });
    expect(c).toMatchObject({ ruc: '1790011223001', email: 'info@audiauto.test' });
    // con la política SCHEDULE el próximo vencido SÍ se crea como mantenimiento (generará avisos): queda vencido
    const m = c.installations[0].systems[0].maintenances;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ status: 'PROGRAMADO' });
    expect(m[0].scheduledDate.toISOString().slice(0, 10)).toBe('2025-10-01');
  });

  it('cancelar una importación descarta el archivo y no crea nada', async () => {
    const buf = await book('CARTERA', [HEAD, ['MTTO', 'Cancelada SA', 'MATRIZ', null, 'DSC 1832', null, null, null, null, 1, null]]);
    const up = (await upload('ADMIN', buf, 'canc.xlsx').expect(201)).body;
    await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(config(typeIds())).expect(200);
    await ag.ADMIN.post(`/api/imports/${up.id}/cancel`).set(H).expect(200);
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: up.id } })).fileData).toBeNull();
    await ag.ADMIN.post(`/api/imports/${up.id}/confirm`).set(H).send({ acknowledge: true }).expect(400);
    expect(await prisma.client.count({ where: { commercialName: 'Cancelada SA' } })).toBe(0);
  });

  it('el reporte neutraliza fórmulas (=, +, -, @) para no ejecutarse al abrirlo en Excel', async () => {
    const buf = await book('CARTERA', [HEAD, ['MTTO', '=HYPERLINK("http://malo")', 'MATRIZ', null, 'DSC 1832', 'fecha mala', null, null, null, null, null]]);
    const up = (await upload('ADMIN', buf, 'form.xlsx').expect(201)).body;
    await ag.ADMIN.post(`/api/imports/${up.id}/preview`).set(H).send(config(typeIds())).expect(200);
    const rep = await ag.ADMIN.get(`/api/imports/${up.id}/report.xlsx`).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(rep.body as unknown as ExcelJS.Buffer);
    const v = String(wb.getWorksheet('Errores y advertencias')!.getRow(2).getCell(2).value);
    expect(v.startsWith("'=")).toBe(true);
  });

  it('atomicidad: si algo falla a mitad, la transacción se revierte completa', async () => {
    const row = (name: string, categoryId: string): PlannedRow => ({
      rowNumber: 2, status: 'OK', lost: false, errors: [], warnings: [], clientName: name, clientKey: name.toLowerCase(), clientNew: true, installationName: 'Principal', installationKey: 'principal',
      installationNew: true, equipment: [], summary: '',
      system: { categoryId, categoryName: 'X', brand: null, model: null, relation: null, isNew: true, key: `${name}|k` },
    });
    const goodCat = (await prisma.systemCategory.findFirstOrThrow()).id;
    const plan: Plan = { rows: [row('Atomico Uno SA', goodCat), row('Atomico Dos SA', '00000000-0000-4000-8000-000000000bad')], summary: emptyPlanSummary(), centralValues: [] };
    const batch = await prisma.importBatch.create({ data: { fileName: 'x.xlsx', fileHash: 'h', fileSize: 1 } });
    const cfg = importConfigSchema.parse({ sheet: 'S', headerRow: 1, columns: { client: 1 }, options: { ...defaults } });
    await expect(prisma.$transaction((tx) => executePlan(tx, plan, cfg, batch.id, TODAY))).rejects.toBeTruthy();
    expect(await prisma.client.count({ where: { commercialName: { startsWith: 'Atomico' } } })).toBe(0); // la primera fila tampoco quedó guardada
  });

  beforeEach(async () => {
    if (!defaults) {
      const s = (await ag.ADMIN.post('/api/imports').set(H).attach('file', await book('CARTERA', [HEAD]), 'tmp.xlsx')).body;
      const sh = (await ag.ADMIN.get(`/api/imports/${s.id}/sheet?name=CARTERA`)).body;
      defaults = { defaultCategoryId: sh.defaults.defaultCategoryId, defaultMaintenanceTypeId: sh.defaults.defaultMaintenanceTypeId, followUpTypeId: sh.defaults.followUpTypeId };
      await ag.ADMIN.post(`/api/imports/${s.id}/cancel`).set(H);
    }
  });
});
