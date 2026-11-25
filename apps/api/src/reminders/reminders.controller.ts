import { BadRequestException, Body, Controller, Get, HttpCode, Headers, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { NotificationKind, NotificationStatus, Prisma, Role } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Public, Roles, SkipCsrf } from '../common/decorators';
import { PageQuery, pageArgs, trim } from '../common/helpers';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from './reminders.service';
import { ReminderSettingsService, UpdateReminderSettingsDto } from './reminders.settings';

export class ListNotificationsQuery extends PageQuery {
  @IsOptional() @IsEnum(NotificationStatus) status?: NotificationStatus;
  @IsOptional() @IsEnum(NotificationKind) kind?: NotificationKind;
  @IsOptional() @IsUUID() followUpId?: string;
  @IsOptional() @IsUUID() maintenanceId?: string;
  @IsOptional() @trim() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

const READERS = [Role.ADMIN, Role.OPERATIVO, Role.CONSULTA];
const WRITERS = [Role.ADMIN, Role.OPERATIVO];

/** Historial de notificaciones, reintentos manuales y ejecución manual del motor. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly engine: RemindersService, private readonly audit: AuditService) {}

  @Roles(...READERS) @Get()
  async list(@Query() q: ListNotificationsQuery) {
    const f: Prisma.NotificationWhereInput[] = [];
    if (q.status) f.push({ status: q.status });
    if (q.kind) f.push({ kind: q.kind });
    if (q.followUpId) f.push({ followUpId: q.followUpId });
    if (q.maintenanceId) f.push({ maintenanceId: q.maintenanceId });
    if (q.search) f.push({ recipientEmail: { contains: q.search, mode: 'insensitive' } });
    if (q.from) f.push({ createdAt: { gte: new Date(`${q.from}T00:00:00-05:00`) } });
    if (q.to) f.push({ createdAt: { lte: new Date(`${q.to}T23:59:59.999-05:00`) } });
    const where: Prisma.NotificationWhereInput = { AND: f };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        select: {
          id: true, entityType: true, recipientEmail: true, recipientName: true, kind: true, occurrenceDate: true, status: true, attempt: true, nextAttemptAt: true,
          subject: true, lastError: true, provider: true, sentAt: true, createdAt: true,
          followUp: { select: { id: true, title: true, client: { select: { commercialName: true } } } },
          maintenance: { select: { id: true, scheduledDate: true, type: { select: { name: true } }, system: { select: { installation: { select: { client: { select: { commercialName: true } } } } } } } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  @Roles(...READERS) @Get('runs')
  runs() {
    return this.prisma.jobRun.findMany({ where: { name: 'reminders' }, orderBy: { startedAt: 'desc' }, take: 15 });
  }

  /** Ejecución manual (ignora la hora de envío). Solo Administrador. */
  @Roles(Role.ADMIN) @Post('run') @HttpCode(200)
  async runNow(@CurrentUser() u: AuthUser, @Req() req: Request) {
    const r = await this.engine.run({ trigger: 'manual', force: true });
    await this.audit.log({ actorId: u.id, action: 'reminders.run_manual', entity: 'JobRun', entityId: r.jobId, ip: req.ip });
    return r;
  }

  /** Reintento manual de un envío fallido definitivamente. */
  @Roles(...WRITERS) @Post(':id/retry') @HttpCode(200)
  async retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException('Notificación no encontrada');
    if (n.status !== 'FAILED' || n.nextAttemptAt) throw new BadRequestException('Solo se pueden reintentar manualmente los envíos fallidos sin reintentos pendientes');
    const r = await this.prisma.notification.update({ where: { id }, data: { status: 'PENDING', attempt: 0, nextAttemptAt: new Date(), lastError: null } });
    await this.audit.log({ actorId: u.id, action: 'notification.retry_requested', entity: 'Notification', entityId: id, ip: req.ip });
    return r;
  }
}

@Controller('settings/reminders')
export class ReminderSettingsController {
  constructor(private readonly svc: ReminderSettingsService) {}
  @Roles(Role.ADMIN, Role.OPERATIVO) @Get() get() { return this.svc.get(); }

  /** Estado del correo y del scheduler para la pantalla de configuración (sin claves ni direcciones). */
  @Roles(Role.ADMIN, Role.OPERATIVO) @Get('status')
  status() {
    const env = loadEnv();
    return {
      emailMode: env.EMAIL_MODE,
      provider: env.EMAIL_MODE === 'live' ? env.EMAIL_PROVIDER : 'console',
      cronEnabled: !!env.CRON_SECRET,
      recipientsRestricted: env.EMAIL_MODE === 'live' && env.allowedRecipients.length > 0,
      timezone: env.APP_TIMEZONE,
    };
  }
  @Roles(Role.ADMIN) @Put()
  update(@Body() dto: UpdateReminderSettingsDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.update(dto, u.id, req.ip); }
}

/** Endpoint para el cron externo (cron-job.org, GitHub Actions…). Se autentica con CRON_SECRET, no con sesión. */
@Controller('internal/cron')
export class CronController {
  constructor(private readonly engine: RemindersService) {}

  @Public() @SkipCsrf() @SkipThrottle() @Post('reminders') @HttpCode(200)
  async reminders(@Headers('x-cron-secret') secret?: string) {
    const expected = loadEnv().CRON_SECRET;
    if (!expected) throw new ServiceUnavailableException('El cron está deshabilitado (falta CRON_SECRET)');
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Secreto inválido');
    const { jobId, ...summary } = await this.engine.run({ trigger: 'cron' });
    return { jobId, ...summary };
  }
}
