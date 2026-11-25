import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthUser } from '../common/decorators';
import { followUpScope, maintenanceScope } from '../common/scopes';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatUser { id: string; name: string; role: Role }
export interface ChatMessageDto { id: string; room: string; body: string; createdAt: string; user: ChatUser }

const TICKET_TTL_MS = 60_000;
export const MAX_BODY = 1000;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROOM_RE = new RegExp(`^(general|(followup|maintenance):(${UUID}))$`);

/** Salas: «general» (todo el personal) y una por seguimiento o mantenimiento (solo quien puede verlo). */
@Injectable()
export class ChatService {
  private readonly tickets = new Map<string, { user: ChatUser; exp: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Ticket de un solo uso (60 s) para abrir el socket. Evita depender de la cookie, que no viaja a otro dominio. */
  issueTicket(user: AuthUser): { ticket: string; expiresInSeconds: number } {
    const now = Date.now();
    for (const [t, v] of this.tickets) if (v.exp < now) this.tickets.delete(t);
    const ticket = randomBytes(24).toString('base64url');
    this.tickets.set(ticket, { user: { id: user.id, name: user.name, role: user.role }, exp: now + TICKET_TTL_MS });
    return { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 };
  }

  consumeTicket(ticket: unknown): ChatUser | null {
    if (typeof ticket !== 'string') return null;
    const t = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return t && t.exp >= Date.now() ? t.user : null;
  }

  isValidRoom(room: unknown): room is string {
    return typeof room === 'string' && ROOM_RE.test(room);
  }

  async canAccess(user: ChatUser, room: string): Promise<boolean> {
    const m = ROOM_RE.exec(room);
    if (!m) return false;
    if (m[1] === 'general') return true;
    const actor = { id: user.id, role: user.role } as AuthUser;
    if (m[2] === 'followup') return (await this.prisma.followUp.count({ where: { AND: [followUpScope(actor), { id: m[3] }] } })) > 0;
    return (await this.prisma.maintenance.count({ where: { AND: [maintenanceScope(actor), { id: m[3] }] } })) > 0;
  }

  async save(user: ChatUser, room: string, body: string): Promise<ChatMessageDto> {
    const row = await this.prisma.chatMessage.create({ data: { room, userId: user.id, body } });
    return { id: row.id, room, body: row.body, createdAt: row.createdAt.toISOString(), user };
  }

  async history(room: string, before: Date | undefined, limit: number): Promise<ChatMessageDto[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { room, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' }, take: limit,
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    return rows.reverse().map((r) => ({ id: r.id, room: r.room, body: r.body, createdAt: r.createdAt.toISOString(), user: r.user }));
  }
}
