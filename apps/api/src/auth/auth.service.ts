import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { EMAIL_PROVIDER, EmailProvider } from '../email/email.provider';
import { renderActionEmail } from '../email/email.templates';
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

const RESET_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider) {}

  /**
   * Solicitud de acceso. La cuenta nace INACTIVA con rol de solo consulta; un administrador la revisa y activa.
   * La respuesta es siempre la misma exista o no el correo (no se puede averiguar qué correos están registrados).
   */
  async register(name: string, email: string, password: string, ip?: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.user.create({ data: { name, email, passwordHash, role: 'CONSULTA', active: false, selfRegistered: true } });
      await this.audit.log({ actorId: user.id, action: 'auth.register_requested', entity: 'User', entityId: user.id, ip });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // correo ya registrado: se ignora en silencio
      await this.audit.log({ action: 'auth.register_duplicate', entity: 'User', ip });
    }
  }

  /** Genera un enlace de un solo uso (vence en 1 h) y lo envía por correo. Responde igual exista o no la cuenta. */
  async forgotPassword(email: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) { await this.audit.log({ action: 'auth.forgot_unknown', entity: 'User', ip }); return; }
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) } }),
    ]);
    const url = `${loadEnv().APP_URL.replace(/\/$/, '')}/restablecer?token=${token}`;
    const mail = renderActionEmail({
      title: 'Restablecer su contraseña',
      intro: `Recibimos una solicitud para restablecer la contraseña de su cuenta. El enlace vence en ${RESET_TTL_MINUTES} minutos y solo sirve una vez.`,
      buttonLabel: 'Elegir nueva contraseña', url,
      footer: 'Si usted no lo solicitó, ignore este correo: su contraseña no cambiará.',
    });
    try {
      await this.email.send({ to: user.email, subject: '[IGNIS] Restablecer su contraseña', html: mail.html, text: mail.text, idempotencyKey: `reset-${hashToken(token).slice(0, 24)}` });
    } catch (e) {
      this.logger.error(`No se pudo enviar el correo de recuperación: ${(e as Error).message}`); // no se revela al solicitante
    }
    await this.audit.log({ actorId: user.id, action: 'auth.forgot_requested', entity: 'User', entityId: user.id, ip });
  }

  async resetPassword(token: string, newPassword: string, ip?: string) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) throw new BadRequestException('El enlace no es válido o ya venció. Solicite uno nuevo.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.session.deleteMany({ where: { userId: row.userId } }),
    ]);
    await this.audit.log({ actorId: row.userId, action: 'auth.password_reset_by_link', entity: 'User', entityId: row.userId, ip });
  }

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
