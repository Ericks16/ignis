import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { loadEnv } from '../config/env';
import { ChatService, ChatUser, MAX_BODY } from './chat.service';

const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 15;

type Ack = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Chat en tiempo real con Socket.IO (WebSocket). Autenticación: ticket de un solo uso obtenido por HTTP con la sesión.
 * Cada mensaje se vuelve a validar (sala, permiso, longitud) y se guarda en la base de datos antes de difundirse.
 */
@WebSocketGateway({
  cors: { origin: loadEnv().corsOrigins, credentials: false },
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Chat');
  @WebSocketServer() server: Server;

  constructor(private readonly chat: ChatService) {}

  handleConnection(client: Socket) {
    const user = this.chat.consumeTicket(client.handshake.auth?.ticket);
    if (!user) { client.emit('chat_error', 'No autorizado'); client.disconnect(true); return; }
    client.data.user = user;
    client.data.sent = [] as number[];
  }

  private who(client: Socket): ChatUser | null { return (client.data.user as ChatUser | undefined) ?? null; }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { room?: unknown }): Promise<Ack> {
    const user = this.who(client);
    if (!user) return { ok: false, error: 'No autorizado' };
    const room = body?.room;
    if (!this.chat.isValidRoom(room)) return { ok: false, error: 'Sala no válida' };
    if (!(await this.chat.canAccess(user, room))) return { ok: false, error: 'No tiene acceso a esta sala' };
    await client.join(room);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { room?: unknown }): Promise<Ack> {
    if (this.chat.isValidRoom(body?.room)) await client.leave(body.room);
    return { ok: true };
  }

  @SubscribeMessage('send')
  async send(@ConnectedSocket() client: Socket, @MessageBody() body: { room?: unknown; body?: unknown }): Promise<Ack> {
    const user = this.who(client);
    if (!user) return { ok: false, error: 'No autorizado' };
    const room = body?.room;
    if (!this.chat.isValidRoom(room) || !client.rooms.has(room)) return { ok: false, error: 'Únase a la sala antes de escribir' };
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!text) return { ok: false, error: 'El mensaje está vacío' };
    if (text.length > MAX_BODY) return { ok: false, error: `El mensaje supera ${MAX_BODY} caracteres` };

    const now = Date.now();
    const sent = (client.data.sent as number[]).filter((t) => now - t < WINDOW_MS);
    if (sent.length >= MAX_PER_WINDOW) return { ok: false, error: 'Está escribiendo demasiado rápido' };
    sent.push(now);
    client.data.sent = sent;

    // El permiso se revisa de nuevo: pudo cambiar desde que se unió a la sala.
    if (!(await this.chat.canAccess(user, room))) { await client.leave(room); return { ok: false, error: 'No tiene acceso a esta sala' }; }
    try {
      const msg = await this.chat.save(user, room, text);
      this.server.to(room).emit('message', msg);
      return { ok: true, id: msg.id };
    } catch (e) {
      this.logger.error(`No se pudo guardar el mensaje: ${(e as Error).message}`);
      return { ok: false, error: 'No se pudo enviar el mensaje' };
    }
  }
}
