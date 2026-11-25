import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { resetEnvCache } from '../src/config/env';
import { EMAIL_PROVIDER, EmailMessage } from '../src/email/email.provider';
import { PrismaService } from '../src/prisma/prisma.service';

const H = { 'X-Requested-With': 'ignis' };
const PASS = 'Passw0rd-Test1';
const NEW_PASS = 'Nueva-Clave-9876';

describe('Registro con aprobación y recuperación de contraseña', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sent: EmailMessage[] = [];
  const http = () => request(app.getHttpServer());
  const tokenFrom = (m: EmailMessage) => /restablecer\?token=([A-Za-z0-9_-]+)/.exec(m.text)![1];

  beforeAll(async () => {
    resetEnvCache();
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER).useValue({ name: 'fake', send: async (m: EmailMessage) => { sent.push(m); return { id: 'x' }; } })
      .compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.create({ data: { email: 'admin@rec.local', name: 'Admin', role: Role.ADMIN, passwordHash: await bcrypt.hash(PASS, 4) } });
    await prisma.user.create({ data: { email: 'ana@rec.local', name: 'Ana', role: Role.OPERATIVO, passwordHash: await bcrypt.hash(PASS, 4) } });
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { sent.length = 0; });

  describe('Solicitud de acceso', () => {
    it('crea una cuenta INACTIVA de solo consulta que no puede ingresar hasta que un administrador la apruebe', async () => {
      const res = await http().post('/api/auth/register').set(H).send({ name: 'Nuevo Usuario', email: 'Nuevo@Rec.Local', password: PASS }).expect(202);
      expect(res.body.message).toMatch(/administrador revisará/i);
      const u = await prisma.user.findUniqueOrThrow({ where: { email: 'nuevo@rec.local' } });
      expect(u).toMatchObject({ active: false, selfRegistered: true, role: 'CONSULTA' });
      expect(u.passwordHash).not.toBe(PASS);
      await http().post('/api/auth/login').set(H).send({ email: 'nuevo@rec.local', password: PASS }).expect(401);

      const admin = request.agent(app.getHttpServer());
      await admin.post('/api/auth/login').set(H).send({ email: 'admin@rec.local', password: PASS }).expect(200);
      const list = (await admin.get('/api/users?search=nuevo@rec.local').expect(200)).body.items;
      expect(list[0]).toMatchObject({ selfRegistered: true, active: false });
      await admin.patch(`/api/users/${u.id}`).set(H).send({ active: true, role: 'TECNICO' }).expect(200);
      await http().post('/api/auth/login').set(H).send({ email: 'nuevo@rec.local', password: PASS }).expect(200);
    });

    it('no revela si el correo ya existe y no permite escalar el rol desde el formulario', async () => {
      const dup = await http().post('/api/auth/register').set(H).send({ name: 'Otra Ana', email: 'ana@rec.local', password: PASS }).expect(202);
      const fresh = await http().post('/api/auth/register').set(H).send({ name: 'Persona Nueva', email: 'persona@rec.local', password: PASS }).expect(202);
      expect(dup.body).toEqual(fresh.body);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: 'ana@rec.local' } })).role).toBe('OPERATIVO'); // la cuenta existente no cambió
      await http().post('/api/auth/register').set(H).send({ name: 'Hacker', email: 'h@rec.local', password: PASS, role: 'ADMIN', active: true }).expect(400);
      expect(await prisma.user.count({ where: { email: 'h@rec.local' } })).toBe(0);
    });

    it('valida nombre, correo y fortaleza de la contraseña', async () => {
      await http().post('/api/auth/register').set(H).send({ name: 'X', email: 'x@rec.local', password: PASS }).expect(400);
      await http().post('/api/auth/register').set(H).send({ name: 'Nombre Valido', email: 'no-es-correo', password: PASS }).expect(400);
      await http().post('/api/auth/register').set(H).send({ name: 'Nombre Valido', email: 'v@rec.local', password: '123456' }).expect(400);
    });
  });

  describe('Olvidé mi contraseña', () => {
    it('envía un enlace de un solo uso por correo; con él se elige una contraseña nueva, se cierran las sesiones y el enlace no se reutiliza', async () => {
      const old = request.agent(app.getHttpServer());
      await old.post('/api/auth/login').set(H).send({ email: 'ana@rec.local', password: PASS }).expect(200);

      const res = await http().post('/api/auth/forgot-password').set(H).send({ email: 'ANA@rec.local' }).expect(202);
      expect(res.body.message).toMatch(/si el correo está registrado/i);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('ana@rec.local');
      expect(sent[0].html).toContain('Elegir nueva contraseña');
      const token = tokenFrom(sent[0]);
      // en la base solo vive el hash
      const stored = await prisma.passwordResetToken.findMany({ where: { user: { email: 'ana@rec.local' } } });
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).not.toBe(token);

      await http().post('/api/auth/reset-password').set(H).send({ token, newPassword: 'corta' }).expect(400); // contraseña débil: el enlace sigue vigente
      await http().post('/api/auth/reset-password').set(H).send({ token, newPassword: NEW_PASS }).expect(204);
      await http().post('/api/auth/login').set(H).send({ email: 'ana@rec.local', password: PASS }).expect(401);
      await http().post('/api/auth/login').set(H).send({ email: 'ana@rec.local', password: NEW_PASS }).expect(200);
      await old.get('/api/auth/me').expect(401); // la sesión anterior se cerró
      const again = await http().post('/api/auth/reset-password').set(H).send({ token, newPassword: 'Otra-Clave-1234' }).expect(400);
      expect(again.body.message).toMatch(/no es válido|venció/i);
    });

    it('un correo desconocido o inactivo recibe la misma respuesta y no se envía nada', async () => {
      await prisma.user.create({ data: { email: 'baja@rec.local', name: 'Baja', role: Role.CONSULTA, active: false, passwordHash: 'x' } });
      const a = await http().post('/api/auth/forgot-password').set(H).send({ email: 'nadie@rec.local' }).expect(202);
      const b = await http().post('/api/auth/forgot-password').set(H).send({ email: 'baja@rec.local' }).expect(202);
      expect(a.body).toEqual(b.body);
      expect(sent).toHaveLength(0);
    });

    it('un enlace vencido o inventado se rechaza; pedir otro invalida el anterior', async () => {
      await http().post('/api/auth/reset-password').set(H).send({ token: 'x'.repeat(43), newPassword: NEW_PASS }).expect(400);
      await http().post('/api/auth/forgot-password').set(H).send({ email: 'admin@rec.local' }).expect(202);
      const first = tokenFrom(sent[0]);
      await http().post('/api/auth/forgot-password').set(H).send({ email: 'admin@rec.local' }).expect(202);
      const second = tokenFrom(sent[1]);
      expect(second).not.toBe(first);
      await http().post('/api/auth/reset-password').set(H).send({ token: first, newPassword: NEW_PASS }).expect(400);
      await prisma.passwordResetToken.updateMany({ where: { user: { email: 'admin@rec.local' } }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().post('/api/auth/reset-password').set(H).send({ token: second, newPassword: NEW_PASS }).expect(400);
    });

    it('un fallo del proveedor de correo no se filtra al solicitante', async () => {
      const mod = app.get(EMAIL_PROVIDER) as { send: (m: EmailMessage) => Promise<unknown> };
      const spy = jest.spyOn(mod, 'send').mockRejectedValueOnce(new Error('proveedor caído'));
      await http().post('/api/auth/forgot-password').set(H).send({ email: 'admin@rec.local' }).expect(202);
      spy.mockRestore();
    });
  });

  describe('Alertas internas (no dependen del correo)', () => {
    it('un seguimiento vencido aparece en las alertas aunque el cliente no tenga correo ni haya a quién enviar correos', async () => {
      const admin = request.agent(app.getHttpServer());
      await admin.post('/api/auth/login').set(H).send({ email: 'admin@rec.local', password: PASS }).expect(200);
      const adminId = (await admin.get('/api/auth/me').expect(200)).body.id;
      const client = (await admin.post('/api/clients').set(H).send({ commercialName: 'Cliente Sin Correo SA' }).expect(201)).body; // sin email ni contactos
      const type = (await prisma.followUpType.findFirstOrThrow()).id;
      const fu = (await admin.post('/api/follow-ups').set(H).send({ clientId: client.id, title: 'Cotizar renovación', typeId: type, startDate: '2020-01-01', targetDate: '2020-02-01', responsibleId: adminId }).expect(201)).body;
      await prisma.followUp.update({ where: { id: fu.id }, data: { responsibleId: null } }); // además, sin responsable
      await admin.put('/api/settings/reminders').set(H).send({ internalRecipients: [] }).expect(200);

      const alerts = (await admin.get('/api/alerts').expect(200)).body;
      expect(alerts.overdue).toBeGreaterThanOrEqual(1);
      const item = alerts.items.find((i: { id: string }) => i.id === fu.id);
      expect(item).toMatchObject({ kind: 'followup', client: 'Cliente Sin Correo SA', title: 'Cotizar renovación' });
      expect(item.daysLeft).toBeLessThan(0);
      expect(alerts.withoutEmailRecipient).toBeGreaterThanOrEqual(1); // se avisa al personal de que ese seguimiento no tiene destinatario de correo
    });

    it('el técnico solo recibe alertas de lo que tiene asignado', async () => {
      await prisma.user.create({ data: { email: 'tec@rec.local', name: 'Tec', role: Role.TECNICO, passwordHash: await bcrypt.hash(PASS, 4) } });
      const tec = request.agent(app.getHttpServer());
      await tec.post('/api/auth/login').set(H).send({ email: 'tec@rec.local', password: PASS }).expect(200);
      const a = (await tec.get('/api/alerts').expect(200)).body;
      expect(a.total).toBe(0);
      expect(a.withoutEmailRecipient).toBeNull();
    });
  });
});
