import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { resetEnvCache } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';

const H = { 'X-Requested-With': 'ignis' };
const PASS = 'Passw0rd-Test1';
const UUID = '00000000-0000-4000-8000-000000000009';

type Ack = { ok: boolean; id?: string; error?: string };

describe('Chat en tiempo real (WebSocket)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  const agents: Record<string, ReturnType<typeof request.agent>> = {};
  const sockets: Socket[] = [];
  const ids: Record<string, string> = {};

  const connect = async (who: string, ticketOverride?: string): Promise<Socket> => {
    const ticket = ticketOverride ?? (await agents[who].post('/api/chat/ticket').set(H).expect(200)).body.ticket;
    const s = io(url, { auth: { ticket }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise<void>((res, rej) => { s.once('connect', () => res()); s.once('connect_error', rej); s.once('disconnect', () => rej(new Error('desconectado'))); });
    return s;
  };
  const emit = <T = Ack>(s: Socket, ev: string, payload: unknown): Promise<T> => new Promise((res) => s.emit(ev, payload, res));
  const next = <T>(s: Socket, ev: string): Promise<T> => new Promise((res) => s.once(ev, res));

  beforeAll(async () => {
    resetEnvCache();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.listen(0);
    url = await app.getUrl().then((u) => u.replace('[::1]', 'localhost'));
    prisma = app.get(PrismaService);
    for (const [k, role] of [['admin', Role.ADMIN], ['consulta', Role.CONSULTA], ['tec1', Role.TECNICO], ['tec2', Role.TECNICO]] as const) {
      const u = await prisma.user.create({ data: { email: `${k}@chat.local`, name: `Usuario ${k}`, role, passwordHash: await bcrypt.hash(PASS, 4) } });
      ids[k] = u.id;
      agents[k] = request.agent(app.getHttpServer());
      await agents[k].post('/api/auth/login').set(H).send({ email: `${k}@chat.local`, password: PASS }).expect(200);
    }
  });
  afterAll(async () => { sockets.forEach((s) => s.close()); await app.close(); });

  /** Conecta con un ticket dado y devuelve si el servidor mantiene la conexión abierta tras validar el ticket. */
  const staysConnected = async (ticket: string | undefined): Promise<boolean> => {
    const s = io(url, { auth: ticket === undefined ? {} : { ticket }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise<void>((res) => { s.once('connect', () => setTimeout(res, 300)); s.once('connect_error', () => res()); });
    return s.connected;
  };

  it('exige ticket: sin ticket, con ticket inventado o reutilizado el servidor cierra la conexión', async () => {
    expect(await staysConnected(undefined)).toBe(false);
    expect(await staysConnected('inventado')).toBe(false);
    const ticket = (await agents.admin.post('/api/chat/ticket').set(H).expect(200)).body.ticket;
    expect(await staysConnected(ticket)).toBe(true);
    expect(await staysConnected(ticket)).toBe(false); // un solo uso
  });

  it('el ticket solo se entrega con sesión válida', async () => {
    await request(app.getHttpServer()).post('/api/chat/ticket').set(H).expect(401);
    await request(app.getHttpServer()).post('/api/chat/ticket').expect(403); // sin cabecera CSRF
  });

  it('un mensaje enviado llega en tiempo real a los demás de la sala, se guarda y queda en el historial', async () => {
    const a = await connect('admin');
    const b = await connect('consulta');
    expect(await emit(a, 'join', { room: 'general' })).toEqual({ ok: true });
    expect(await emit(b, 'join', { room: 'general' })).toEqual({ ok: true });
    const got = next<{ id: string; body: string; user: { name: string; role: string } }>(b, 'message');
    const ack = await emit(a, 'send', { room: 'general', body: '  Hola equipo  ' });
    expect(ack.ok).toBe(true);
    const msg = await got;
    expect(msg).toMatchObject({ body: 'Hola equipo', user: { name: 'Usuario admin', role: 'ADMIN' } });
    expect(await prisma.chatMessage.count({ where: { room: 'general', userId: ids.admin, body: 'Hola equipo' } })).toBe(1);
    const hist = (await agents.consulta.get('/api/chat/messages?room=general').expect(200)).body.items;
    expect(hist.at(-1)).toMatchObject({ body: 'Hola equipo', user: { name: 'Usuario admin' } });
  });

  it('valida salas, longitud y vacío; no se puede escribir sin unirse a la sala', async () => {
    const a = await connect('admin');
    expect((await emit(a, 'send', { room: 'general', body: 'sin unirse' })).ok).toBe(false);
    await emit(a, 'join', { room: 'general' });
    expect((await emit(a, 'send', { room: 'general', body: '   ' })).error).toMatch(/vacío/);
    expect((await emit(a, 'send', { room: 'general', body: 'x'.repeat(1001) })).error).toMatch(/supera/);
    expect((await emit(a, 'send', { room: 'general', body: { $ne: 1 } })).ok).toBe(false);
    expect((await emit(a, 'join', { room: "../admin'; DROP TABLE" })).ok).toBe(false);
    expect((await emit(a, 'join', { room: 'otra' })).ok).toBe(false);
    expect((await emit(a, 'join', undefined)).ok).toBe(false);
  });

  it('el HTML se guarda como texto (se muestra escapado en pantalla)', async () => {
    const a = await connect('admin');
    await emit(a, 'join', { room: 'general' });
    const xss = '<img src=x onerror=alert(1)>';
    expect((await emit(a, 'send', { room: 'general', body: xss })).ok).toBe(true);
    expect((await agents.admin.get('/api/chat/messages?room=general').expect(200)).body.items.at(-1).body).toBe(xss);
  });

  it('limita la velocidad de envío por conexión', async () => {
    const a = await connect('consulta');
    await emit(a, 'join', { room: 'general' });
    const acks: Ack[] = [];
    for (let i = 0; i < 20; i++) acks.push(await emit(a, 'send', { room: 'general', body: `m${i}` }));
    expect(acks.filter((x) => x.ok)).toHaveLength(15);
    expect(acks.at(-1)?.error).toMatch(/demasiado rápido/);
  });

  describe('Salas por seguimiento: solo quien puede ver el seguimiento', () => {
    let followUpId: string;
    beforeAll(async () => {
      const client = (await agents.admin.post('/api/clients').set(H).send({ commercialName: 'Cliente Chat SA' }).expect(201)).body;
      const typeId = (await prisma.followUpType.findFirstOrThrow()).id;
      const fu = (await agents.admin.post('/api/follow-ups').set(H).send({ clientId: client.id, title: 'Seguimiento chat', typeId, startDate: '2026-01-01', targetDate: '2026-12-01' }).expect(201)).body;
      followUpId = fu.id;
      // el técnico 1 está asignado; el técnico 2 no
      const tech = await prisma.technician.create({ data: { name: 'Tec Uno', userId: ids.tec1 } });
      await prisma.followUpTechnician.create({ data: { followUpId, technicianId: tech.id } });
    });

    it('permiso por sala en el socket y en el historial HTTP', async () => {
      const room = `followup:${followUpId}`;
      const admin = await connect('admin');
      const t1 = await connect('tec1');
      const t2 = await connect('tec2');
      expect((await emit(admin, 'join', { room })).ok).toBe(true);
      expect((await emit(t1, 'join', { room })).ok).toBe(true);
      expect(await emit(t2, 'join', { room })).toEqual({ ok: false, error: 'No tiene acceso a esta sala' });
      expect((await emit(t2, 'send', { room, body: 'intruso' })).ok).toBe(false);

      const got = next<{ body: string }>(t1, 'message');
      expect((await emit(admin, 'send', { room, body: 'Revisar con el técnico' })).ok).toBe(true);
      expect((await got).body).toBe('Revisar con el técnico');

      await agents.tec1.get(`/api/chat/messages?room=${encodeURIComponent(room)}`).expect(200);
      await agents.tec2.get(`/api/chat/messages?room=${encodeURIComponent(room)}`).expect(403);
      await agents.admin.get(`/api/chat/messages?room=followup:${UUID}`).expect(403); // seguimiento inexistente
      await agents.admin.get('/api/chat/messages?room=basura').expect(400);
    });

    it('los mensajes de una sala no se filtran a otra', async () => {
      const t2 = await connect('tec2');
      const admin = await connect('admin');
      await emit(t2, 'join', { room: 'general' });
      await emit(admin, 'join', { room: `followup:${followUpId}` });
      let leaked = false;
      t2.on('message', (m: { room: string }) => { if (m.room !== 'general') leaked = true; });
      await emit(admin, 'send', { room: `followup:${followUpId}`, body: 'privado' });
      await new Promise((r) => setTimeout(r, 200));
      expect(leaked).toBe(false);
    });
  });
});
