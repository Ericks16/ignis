import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { loadEnv } from '../config/env';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Hash de relleno para igualar tiempos cuando el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Siempre se compara el hash (tiempo constante) y la respuesta es la misma para correo inexistente, clave errónea,
    // usuario inactivo o cuenta bloqueada: así no se puede averiguar qué correos existen.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    if (!user || !ok || !user.active || locked) {
      if (user && !locked) {
        const failed = user.failedLogins + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
        });
      }
      await this.audit.log({ actorId: user?.id, action: 'auth.login_failed', entity: 'User', entityId: user?.id, ip });
      throw new UnauthorizedException('Credenciales inválidas o cuenta bloqueada temporalmente');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const token = randomBytes(32).toString('base64url');
    const ttlMs = loadEnv().SESSION_TTL_HOURS * 3_600_000;
    await this.prisma.session.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + ttlMs), ip, userAgent: userAgent?.slice(0, 255) },
    });
    await this.audit.log({ actorId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, ip });
    return { token, ttlMs, user };
  }

  async logout(sessionId: string, userId: string, ip?: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
    await this.audit.log({ actorId: userId, action: 'auth.logout', entity: 'User', entityId: userId, ip });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, ip?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new BadRequestException('La contraseña actual es incorrecta');
    if (current === next) throw new BadRequestException('La nueva contraseña debe ser distinta');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false } });
    await this.prisma.session.deleteMany({ where: { userId, id: { not: sessionId } } }); // cierra las demás sesiones
    await this.audit.log({ actorId: userId, action: 'auth.password_changed', entity: 'User', entityId: userId, ip });
  }

  /** Valida el token de sesión; devuelve el usuario o null. */
  async validateSession(token: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user.active) return null;
    if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    }
    const u = session.user;
    return { id: u.id, email: u.email, name: u.name, role: u.role, sessionId: session.id, mustChangePassword: u.mustChangePassword };
  }
}
