import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { todayLocal } from '../src/common/dates';
import { resetEnvCache } from '../src/config/env';
import { EMAIL_PROVIDER, EmailError, EmailMessage, EmailProvider } from '../src/email/email.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { RemindersService } from '../src/reminders/reminders.service';

const PASS = 'Passw0rd-Test1';
const H = { 'X-Requested-With': 'ignis' };
const INTERNAL = 'interno@ignis.test';

/** Proveedor falso: registra lo "enviado" y permite simular fallos. */
class FakeProvider implements EmailProvider {
  readonly name = 'fake';
  sent: EmailMessage[] = [];
  failFor = new Set<string>();
  failPermanentFor = new Set<string>();
  failAll = false;
  async send(m: EmailMessage) {
    if (this.failPermanentFor.has(m.to)) throw new EmailError('Dirección rechazada', true);
    if (this.failAll || this.failFor.has(m.to)) throw new EmailError('Proveedor no disponible');
    this.sent.push(m);
    return { id: `fake-${this.sent.length}` };
  }
  reset() { this.sent = []; this.failFor.clear(); this.failPermanentFor.clear(); this.failAll = false; }
}

/** 08:30 (hora de Guayaquil, UTC-5) del día indicado, más un desplazamiento en minutos. */
const at = (day: string, plusMin = 0) => new Date(new Date(`${day}T13:30:00Z`).getTime() + plusMin * 60_000);

describe('Recordatorios por correo (integración, proveedor falso)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let engine: RemindersService;
  const fake = new FakeProvider();
  const ag: Record<string, ReturnType<typeof request.agent>> = {};
  const uid: Record<string, string> = {};
  let clientId: string; let systemId: string; let typeId: string; let mType: string;

  const run = (now: Date, extra: object = {}) => engine.run({ now, trigger: 'test', ...extra });
  const notifs = (where: object) => prisma.notification.findMany({ where, orderBy: [{ occurrenceDate: 'asc' }, { recipientEmail: 'asc' }] });
  const newFollowUp = async (title: string, targetDate: string, extra: object = {}) =>
    (await ag.ADMIN.post('/api/follow-ups').set(H).send({ clientId, title, typeId, startDate: '2026-01-01', targetDate, responsibleId: uid.ADMIN, ...extra }).expect(201)).body;
  /** Aísla el escenario: desactiva el resto de seguimientos y mantenimientos y limpia lo pendiente. */
  const only = async (followUpId?: string, maintenanceId?: string) => {
    await prisma.followUp.updateMany({ where: followUpId ? { id: { not: followUpId } } : {}, data: { remindersEnabled: false } });
    await prisma.maintenance.updateMany({ where: maintenanceId ? { id: { not: maintenanceId } } : {}, data: { status: 'CANCELADO' } });
    await prisma.notification.deleteMany({ where: { status: { in: ['PENDING', 'FAILED'] } } });
    fake.reset();
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(fake).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    engine = app.get(RemindersService);
    for (const [key, role] of [['ADMIN', Role.ADMIN], ['OPERATIVO', Role.OPERATIVO], ['TECNICO', Role.TECNICO], ['CONSULTA', Role.CONSULTA]] as const) {
      const email = `${key.toLowerCase()}@r.local`;
      const u = await prisma.user.create({ data: { email, name: key, role, passwordHash: await bcrypt.hash(PASS, 4) } });
      uid[key] = u.id;
      const a = request.agent(app.getHttpServer());
      await a.post('/api/auth/login').set(H).send({ email, password: PASS }).expect(200);
      ag[key] = a;
    }
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ internalRecipients: [INTERNAL] }).expect(200);
    clientId = (await ag.ADMIN.post('/api/clients').set(H).send({ commercialName: 'Cliente Recordatorios SA' }).expect(201)).body.id;
    const inst = (await ag.ADMIN.post('/api/installations').set(H).send({ clientId, name: 'Matriz' }).expect(201)).body.id;
    const cat = (await ag.ADMIN.get('/api/catalogs/system-categories')).body[1].id; // BOMBA CI
    systemId = (await ag.ADMIN.post('/api/systems').set(H).send({ installationId: inst, categoryId: cat, responsibleId: uid.ADMIN }).expect(201)).body.id;
    typeId = (await ag.ADMIN.get('/api/catalogs/follow-up-types')).body[0].id;
    mType = (await ag.ADMIN.get('/api/catalogs/maintenance-types')).body[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('flujo completo del ejemplo (objetivo 24 dic): primer aviso 24 nov, semanal, vencido y detención al finalizar', async () => {
    const f = await newFollowUp('Mantenimiento anual de bombas', '2026-12-24');
    await only(f.id);
    const mine = () => notifs({ followUpId: f.id });

    // Antes del primer aviso y antes de la hora de envío: no se genera nada
    expect((await run(at('2026-11-23'))).created).toBe(0);
    const early = await run(new Date('2026-11-24T12:00:00Z')); // 07:00 en Guayaquil
    expect(early.skippedBeforeSendHour).toBe(true);
    expect(await mine()).toHaveLength(0);

    // 24 nov 08:30: primer recordatorio al responsable y al correo interno
    const r1 = await run(at('2026-11-24'));
    expect(r1).toMatchObject({ created: 2, sent: 2, failed: 0 });
    expect(fake.sent.map((m) => m.to).sort()).toEqual(['admin@r.local', INTERNAL]);
    let rows = await mine();
    expect(rows.every((r) => r.kind === 'FIRST' && r.status === 'SENT' && r.provider === 'fake' && r.attempt === 1)).toBe(true);
    const mail = fake.sent[0];
    expect(mail.subject).toContain('Recordatorio: Mantenimiento anual de bombas');
    expect(mail.html).toContain(`http://app.ignis.test/seguimientos/${f.id}`);
    expect(mail.html).toContain('Cliente Recordatorios SA');
    expect(mail.text).toContain('Abrir en el sistema');
    expect(mail.idempotencyKey).toBeTruthy();

    // Ejecución repetida el mismo día: idempotente
    const again = await run(at('2026-11-24', 60));
    expect(again).toMatchObject({ created: 0, sent: 0 });
    expect(fake.sent).toHaveLength(2);

    // 1 dic con TRES ejecuciones simultáneas: un solo envío por destinatario
    const [a, b, c] = await Promise.all([run(at('2026-12-01')), run(at('2026-12-01')), run(at('2026-12-01'))]);
    expect(a.created + b.created + c.created).toBe(2);
    expect(a.sent + b.sent + c.sent).toBe(2);
    expect(fake.sent).toHaveLength(4);
    expect((await mine()).filter((r) => r.kind === 'WEEKLY')).toHaveLength(2);

    // El sistema estuvo parado el 8 y el 15: el 22 solo se envía el último aviso (sin ráfaga)
    const r22 = await run(at('2026-12-22'));
    expect(r22).toMatchObject({ created: 2, sent: 2 });
    rows = await mine();
    expect([...new Set(rows.map((r) => r.occurrenceDate.toISOString().slice(0, 10)))]).toEqual(['2026-11-24', '2026-12-01', '2026-12-22']);

    // Vencido: continúa semanalmente indicándolo
    fake.sent = [];
    const r29 = await run(at('2026-12-30'));
    expect(r29).toMatchObject({ created: 2, sent: 2 });
    expect(fake.sent[0].subject).toContain('VENCIDO');
    expect(fake.sent[0].html).toContain('VENCIDO hace 6 días');
    expect((await mine()).filter((r) => r.kind === 'OVERDUE')).toHaveLength(2);

    // Se generan los del 5 ene sin enviar y se finaliza: se cancelan al instante, sin esperar al cron
    fake.sent = [];
    await run(at('2027-01-05'), { send: false });
    const pending = (await mine()).filter((r) => r.status === 'PENDING');
    expect(pending).toHaveLength(2);
    const statuses = (await ag.ADMIN.get('/api/follow-up-statuses')).body;
    await ag.ADMIN.post(`/api/follow-ups/${f.id}/status`).set(H).send({ statusId: statuses.find((s: any) => s.name === 'FINALIZADO').id, comment: 'Listo' }).expect(200);
    const afterClose = await mine();
    expect(afterClose.filter((r) => r.status === 'CANCELLED')).toHaveLength(2);
    expect(afterClose.filter((r) => r.status === 'PENDING')).toHaveLength(0);
    expect(afterClose.filter((r) => r.status === 'SENT').length).toBeGreaterThanOrEqual(8); // el historial anterior se conserva
    // y el motor no vuelve a enviar nada de este seguimiento
    const later = await run(at('2027-01-12'));
    expect(later.sent).toBe(0);
    expect(fake.sent).toHaveLength(0);
    expect(await mine()).toHaveLength(afterClose.length);
  });

  it('un seguimiento CANCELADO tampoco genera recordatorios', async () => {
    const f = await newFollowUp('Cotización cancelada', '2027-03-10');
    await only(f.id);
    const statuses = (await ag.ADMIN.get('/api/follow-up-statuses')).body;
    await ag.ADMIN.post(`/api/follow-ups/${f.id}/status`).set(H).send({ statusId: statuses.find((s: any) => s.name === 'CANCELADO').id, comment: 'Ya no se requiere' }).expect(200);
    const r = await run(at('2027-03-10'));
    expect(r.created).toBe(0);
    expect(fake.sent).toHaveLength(0);
  });

  it('no envía si se finaliza mientras la notificación esperaba (re-validación al enviar)', async () => {
    const f = await newFollowUp('Se cierra en carrera', '2027-04-10');
    await only(f.id);
    await run(at('2027-03-10'), { send: false });
    // simula un cierre que no pasó por la cancelación inmediata (p. ej. cambio directo en BD)
    const term = await prisma.followUpStatus.findFirstOrThrow({ where: { name: 'FINALIZADO' } });
    await prisma.followUp.update({ where: { id: f.id }, data: { statusId: term.id } });
    const r = await run(at('2027-03-10', 1));
    expect(r.sent).toBe(0);
    expect(fake.sent).toHaveLength(0);
    expect((await notifs({ followUpId: f.id })).every((n) => n.status === 'CANCELLED')).toBe(true);
  });

  it('errores: se registra, se reintenta con espera y un fallo no detiene a los demás', async () => {
    const f = await newFollowUp('Con fallos de envío', '2027-06-24');
    await only(f.id);
    fake.failFor.add(INTERNAL);
    const base = '2027-05-24';
    const r1 = await run(at(base));
    expect(r1).toMatchObject({ created: 2, sent: 1, failed: 1 });
    expect(fake.sent.map((m) => m.to)).toEqual(['admin@r.local']); // el otro destinatario no quedó bloqueado
    let n = (await notifs({ followUpId: f.id, recipientEmail: INTERNAL }))[0];
    expect(n).toMatchObject({ status: 'FAILED', attempt: 1, lastError: expect.stringContaining('Proveedor no disponible') });
    expect(n.nextAttemptAt!.getTime()).toBe(at(base, 5).getTime()); // primer reintento a los 5 minutos
    // antes del plazo no se reintenta
    expect((await run(at(base, 4))).claimed).toBe(0);
    // recupera el servicio: el reintento sale y no se duplica el envío ya hecho
    fake.failFor.clear();
    const r2 = await run(at(base, 6));
    expect(r2).toMatchObject({ sent: 1, failed: 0 });
    n = (await notifs({ followUpId: f.id, recipientEmail: INTERNAL }))[0];
    expect(n).toMatchObject({ status: 'SENT', attempt: 2, lastError: null });
    expect(fake.sent.map((m) => m.to).sort()).toEqual(['admin@r.local', INTERNAL]);
  });

  it('agota los intentos configurados y permite el reintento manual', async () => {
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ maxAttempts: 3, retryMinutes: [5, 10] }).expect(200);
    const f = await newFollowUp('Falla siempre', '2027-08-24');
    await only(f.id);
    fake.failAll = true;
    const t0 = '2027-07-24';
    await run(at(t0));
    await run(at(t0, 6));
    await run(at(t0, 30));
    const rows = await notifs({ followUpId: f.id });
    expect(rows.every((r) => r.status === 'FAILED' && r.attempt === 3 && r.nextAttemptAt === null)).toBe(true);
    expect((await run(at(t0, 600))).claimed).toBe(0); // ya no se reintenta solo
    // reintento manual: Consulta no puede; Operativo sí
    await ag.CONSULTA.post(`/api/notifications/${rows[0].id}/retry`).set(H).expect(403);
    fake.failAll = false;
    await ag.OPERATIVO.post(`/api/notifications/${rows[0].id}/retry`).set(H).expect(200);
    const r = await run(at(t0, 700));
    expect(r.sent).toBe(1);
    await ag.OPERATIVO.post(`/api/notifications/${rows[0].id}/retry`).set(H).expect(400); // ya enviado
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ maxAttempts: 5, retryMinutes: [5, 30, 120, 720] }).expect(200);
  });

  it('un rechazo permanente (dirección inválida) no se reintenta', async () => {
    const f = await newFollowUp('Dirección rechazada', '2027-10-24');
    await only(f.id);
    fake.failPermanentFor.add(INTERNAL);
    await run(at('2027-09-24'));
    const n = (await notifs({ followUpId: f.id, recipientEmail: INTERNAL }))[0];
    expect(n).toMatchObject({ status: 'FAILED', attempt: 1, nextAttemptAt: null });
    expect((await run(at('2027-09-24', 1000))).claimed).toBe(0);
  });

  it('cambiar la fecha objetivo cancela lo pendiente y recalcula el calendario', async () => {
    const f = await newFollowUp('Cambia de fecha', '2028-02-24');
    await only(f.id);
    await run(at('2028-01-24'), { send: false });
    expect((await notifs({ followUpId: f.id, status: 'PENDING' }))).toHaveLength(2);
    await ag.ADMIN.patch(`/api/follow-ups/${f.id}`).set(H).send({ targetDate: '2028-03-24' }).expect(200);
    expect((await notifs({ followUpId: f.id, status: 'PENDING' }))).toHaveLength(0);
    expect((await run(at('2028-01-24'))).created).toBe(0); // aún no llega el primer aviso del nuevo plazo (24 feb)
    expect((await run(at('2028-02-24'))).created).toBe(2);
    // desactivar recordatorios también los detiene
    await run(at('2028-03-02'), { send: false });
    await ag.ADMIN.patch(`/api/follow-ups/${f.id}`).set(H).send({ remindersEnabled: false }).expect(200);
    expect((await notifs({ followUpId: f.id, status: 'PENDING' }))).toHaveLength(0);
    fake.sent = [];
    expect((await run(at('2028-03-09'))).sent).toBe(0);
  });

  it('destinatarios: responsable + correos internos; sin duplicados; contactos del cliente solo con permiso explícito', async () => {
    // el responsable también está en la lista interna -> un solo correo
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ internalRecipients: [INTERNAL, 'ADMIN@r.local'] }).expect(200);
    const f = await newFollowUp('Destinatarios', '2028-06-24');
    await only(f.id);
    await ag.ADMIN.post(`/api/clients/${clientId}/contacts`).set(H).send({ name: 'Contacto Activo', email: 'contacto@cliente.test', receivesNotifications: true }).expect(201);
    await ag.ADMIN.post(`/api/clients/${clientId}/contacts`).set(H).send({ name: 'Contacto Callado', email: 'callado@cliente.test' }).expect(201);
    await run(at('2028-05-24'));
    expect(fake.sent.map((m) => m.to).sort()).toEqual(['admin@r.local', INTERNAL]); // por defecto los contactos NO reciben correos
    // se activa el interruptor global: solo el contacto marcado
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ includeClientContacts: true }).expect(200);
    const f2 = await newFollowUp('Destinatarios con contactos', '2028-06-24');
    await only(f2.id);
    await run(at('2028-05-24'));
    expect(fake.sent.map((m) => m.to).sort()).toEqual(['admin@r.local', 'contacto@cliente.test', INTERNAL]);
    expect(fake.sent.some((m) => m.to === 'callado@cliente.test')).toBe(false);
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ includeClientContacts: false, internalRecipients: [INTERNAL] }).expect(200);
  });

  it('seguimiento sin fecha objetivo o sin destinatarios: no genera avisos (y queda contado)', async () => {
    const f = await newFollowUp('Sin fecha', '2028-09-24');
    await prisma.followUp.update({ where: { id: f.id }, data: { targetDate: null } });
    await only(f.id);
    expect((await run(at('2028-08-24'))).created).toBe(0);
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ internalRecipients: [] }).expect(200);
    const g = await ag.ADMIN.post('/api/follow-ups').set(H).send({ clientId, title: 'Sin destinatarios', typeId, startDate: '2026-01-01', targetDate: '2028-09-24' }).expect(201);
    await only(g.body.id);
    const r = await run(at('2028-08-24'));
    expect(r).toMatchObject({ created: 0, noRecipients: 1 });
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ internalRecipients: [INTERNAL] }).expect(200);
  });

  it('mantenimientos: recordatorio un mes antes de la fecha programada y se detiene al realizarse', async () => {
    const today = todayLocal();
    const m = (await ag.ADMIN.post('/api/maintenances').set(H).send({ systemId, typeId: mType, scheduledDate: '2029-02-10' }).expect(201)).body;
    await only(undefined, m.id);
    expect((await run(at('2029-01-09'))).created).toBe(0);
    const r = await run(at('2029-01-10'));
    expect(r).toMatchObject({ created: 2, sent: 2 });
    expect(fake.sent[0].html).toContain(`http://app.ignis.test/mantenimientos/${m.id}`);
    expect(fake.sent[0].html).toContain('BOMBA CI');
    // se generan los siguientes y se completa: se cancelan
    await run(at('2029-01-17'), { send: false });
    expect(await notifs({ maintenanceId: m.id, status: 'PENDING' })).toHaveLength(2);
    await ag.ADMIN.post(`/api/maintenances/${m.id}/complete`).set(H).send({ executedDate: today }).expect(200);
    expect(await notifs({ maintenanceId: m.id, status: 'PENDING' })).toHaveLength(0);
    fake.sent = [];
    expect((await run(at('2029-01-24'))).sent).toBe(0);
  });

  it('reprogramar un mantenimiento detiene los avisos del original', async () => {
    const m = (await ag.ADMIN.post('/api/maintenances').set(H).send({ systemId, typeId: mType, scheduledDate: '2029-06-10' }).expect(201)).body;
    await only(undefined, m.id);
    await run(at('2029-05-10'), { send: false });
    expect(await notifs({ maintenanceId: m.id, status: 'PENDING' })).toHaveLength(2);
    const nd = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await ag.ADMIN.post(`/api/maintenances/${m.id}/reschedule`).set(H).send({ newDate: nd, reason: 'Cliente lo pidió' }).expect(200);
    expect(await notifs({ maintenanceId: m.id, status: 'PENDING' })).toHaveLength(0);
  });

  it('endpoint del cron: protegido por secreto, sin sesión ni cabecera CSRF', async () => {
    const http = request(app.getHttpServer());
    await http.post('/api/internal/cron/reminders').expect(401);
    await http.post('/api/internal/cron/reminders').set('x-cron-secret', 'incorrecto').expect(401);
    await http.post('/api/internal/cron/reminders').set('x-cron-secret', 'test-cron-secret-0123456789abcdef').expect(200).then((r) => {
      expect(r.body.jobId).toBeTruthy();
      expect(r.body).toHaveProperty('sent');
    });
    await http.get('/api/internal/cron/reminders').expect(404);
    // sin CRON_SECRET configurado el endpoint queda deshabilitado
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET; resetEnvCache();
    await http.post('/api/internal/cron/reminders').set('x-cron-secret', 'lo-que-sea').expect(503);
    process.env.CRON_SECRET = saved; resetEnvCache();
    const job = await prisma.jobRun.findFirst({ where: { trigger: 'cron' }, orderBy: { startedAt: 'desc' } });
    expect(job).toMatchObject({ status: 'OK', name: 'reminders' });
  });

  it('API de notificaciones y configuración: permisos y validación', async () => {
    await ag.TECNICO.get('/api/notifications').expect(403);
    await ag.CONSULTA.get('/api/notifications').expect(200);
    const list = (await ag.OPERATIVO.get('/api/notifications?status=SENT&pageSize=5').expect(200)).body;
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items[0]).toHaveProperty('recipientEmail');
    expect(JSON.stringify(list)).not.toMatch(/dedupeKey/);
    expect((await ag.ADMIN.get(`/api/notifications?search=${encodeURIComponent(INTERNAL)}`)).body.items.every((i: any) => i.recipientEmail === INTERNAL)).toBe(true);
    await ag.ADMIN.get('/api/notifications?status=NOPE').expect(400);
    await ag.CONSULTA.get('/api/notifications/runs').expect(200);
    // ejecución manual: solo Administrador
    await ag.OPERATIVO.post('/api/notifications/run').set(H).expect(403);
    await ag.ADMIN.post('/api/notifications/run').set(H).expect(200);
    // configuración
    await ag.OPERATIVO.put('/api/settings/reminders').set(H).send({ repeatDays: 3 }).expect(403);
    await ag.OPERATIVO.get('/api/settings/reminders').expect(200);
    await ag.CONSULTA.get('/api/settings/reminders').expect(403);
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ repeatDays: 0 }).expect(400);
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ sendHourLocal: 25 }).expect(400);
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ internalRecipients: ['no-es-correo'] }).expect(400);
    await ag.ADMIN.put('/api/settings/reminders').set(H).send({ unknown: 1 }).expect(400);
    const ok = (await ag.ADMIN.put('/api/settings/reminders').set(H).send({ repeatDays: 7, internalRecipients: [INTERNAL] }).expect(200)).body;
    expect(ok).toMatchObject({ leadMonths: 1, repeatDays: 7, internalRecipients: [INTERNAL] });
    expect(await prisma.auditLog.count({ where: { action: 'settings.reminders_updated' } })).toBeGreaterThan(0);
  });

  it('/health/ready informa correo y scheduler sin exponer secretos', async () => {
    const res = (await request(app.getHttpServer()).get('/health/ready').expect(200)).body;
    expect(res).toMatchObject({ status: 'ok', database: 'up', email: { mode: 'test', provider: 'console' }, scheduler: { lastStatus: 'OK', cronEnabled: true } });
    expect(JSON.stringify(res)).not.toMatch(/test-cron-secret|api[-_]?key|@r\.local/i);
  });
});
