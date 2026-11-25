import { Controller, Get } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { addDays, parseDateOnly, toISODate, todayLocal } from '../common/dates';
import { followUpScope, maintenanceScope } from '../common/scopes';
import { AuthUser, CurrentUser } from '../common/decorators';
import { OPEN } from '../maintenance/maintenance.rules';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderSettingsService } from '../reminders/reminders.settings';

const DAY = 86_400_000;
const HORIZON_DAYS = 30;

/**
 * Alertas dentro del sistema. NO dependen del correo: un seguimiento o mantenimiento vencido o por vencer aparece aquí
 * aunque el cliente no tenga correo, el responsable no tenga correo configurado o el envío esté en modo prueba.
 */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly prisma: PrismaService, private readonly settings: ReminderSettingsService) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser) {
    const today = todayLocal();
    const todayDate = parseDateOnly(today);
    const horizon = parseDateOnly(addDays(today, HORIZON_DAYS));
    const days = (d: Date) => Math.round((d.getTime() - todayDate.getTime()) / DAY);

    const [fu, mt] = await Promise.all([
      this.prisma.followUp.findMany({
        where: { AND: [followUpScope(user), { status: { isTerminal: false }, targetDate: { not: null, lte: horizon } }] },
        select: { id: true, title: true, targetDate: true, client: { select: { commercialName: true } } },
        orderBy: { targetDate: 'asc' }, take: 200,
      }),
      this.prisma.maintenance.findMany({
        where: { AND: [maintenanceScope(user), { status: { in: OPEN }, scheduledDate: { lte: horizon } }] },
        select: { id: true, scheduledDate: true, type: { select: { name: true } }, system: { select: { installation: { select: { client: { select: { commercialName: true } } } } } } },
        orderBy: { scheduledDate: 'asc' }, take: 200,
      }),
    ]);

    const items = [
      ...fu.map((f) => ({ kind: 'followup' as const, id: f.id, title: f.title, client: f.client.commercialName, date: toISODate(f.targetDate!), daysLeft: days(f.targetDate!) })),
      ...mt.map((m) => ({ kind: 'maintenance' as const, id: m.id, title: m.type.name, client: m.system.installation.client.commercialName, date: toISODate(m.scheduledDate), daysLeft: days(m.scheduledDate) })),
    ].sort((a, b) => a.daysLeft - b.daysLeft);
    const overdue = items.filter((i) => i.daysLeft < 0).length;

    // Seguimientos que no tienen a quién avisar por correo (informativo para el personal; siguen visibles arriba).
    let withoutEmailRecipient: number | null = null;
    if (user.role === Role.ADMIN || user.role === Role.OPERATIVO) {
      const cfg = await this.settings.get();
      if (cfg.internalRecipients.length === 0) {
        const noContact: Prisma.FollowUpWhereInput = cfg.includeClientContacts
          ? { client: { contacts: { none: { active: true, receivesNotifications: true, email: { not: null } } } } }
          : {};
        withoutEmailRecipient = await this.prisma.followUp.count({
          where: { remindersEnabled: true, status: { isTerminal: false }, targetDate: { not: null }, OR: [{ responsibleId: null }, { responsible: { active: false } }], ...noContact },
        });
      }
    }

    return { overdue, upcoming: items.length - overdue, total: items.length, items: items.slice(0, 8), withoutEmailRecipient };
  }
}
