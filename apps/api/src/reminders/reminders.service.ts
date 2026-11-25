import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, parseDateOnly, todayLocal, toISODate } from '../common/dates';
import { loadEnv } from '../config/env';
import { EMAIL_PROVIDER, EmailError, EmailProvider } from '../email/email.provider';
import { ReminderEmailData, renderReminderEmail } from '../email/email.templates';
import { OPEN } from '../maintenance/maintenance.rules';
import { PrismaService } from '../prisma/prisma.service';
import { cancelByIds } from './cancel';
import { dedupeKey, daysBetween, latestDueOccurrence, occurrenceKind, retryDelayMinutes, ReminderConfig } from './reminders.policy';
import { ReminderSettingsService } from './reminders.settings';

export interface RunOptions {
  /** Instante de la ejecución (por defecto, ahora). Permite simular el paso del tiempo en pruebas. */
  now?: Date;
  trigger: 'cron' | 'manual' | 'test';
  /** Ignora la hora de envío configurada (ejecución manual). */
  force?: boolean;
  /** false = solo genera los registros, sin enviar (pruebas). */
  send?: boolean;
}

export interface RunSummary {
  skippedBeforeSendHour: boolean;
  cancelledIneligible: number;
  created: number;
  noRecipients: number;
  superseded: number;
  claimed: number;
  sent: number;
  failed: number;
  cancelledAtSend: number;
  recoveredStale: number;
  purgedSessions: number;
  purgedJobRuns: number;
}

type Recipient = { email: string; name: string | null };
const STALE_MINUTES = 10;
const BATCH = 20;
const MAX_PER_RUN = 400;

/** Motor de recordatorios: genera, envía, reintenta y cancela. Idempotente y seguro ante ejecuciones simultáneas. */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger('Reminders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ReminderSettingsService,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  async run(opts: RunOptions): Promise<RunSummary & { jobId: string }> {
    const now = opts.now ?? new Date();
    const job = await this.prisma.jobRun.create({ data: { name: 'reminders', trigger: opts.trigger, startedAt: new Date() } });
    const summary: RunSummary = { skippedBeforeSendHour: false, cancelledIneligible: 0, created: 0, noRecipients: 0, superseded: 0, claimed: 0, sent: 0, failed: 0, cancelledAtSend: 0, recoveredStale: 0, purgedSessions: 0, purgedJobRuns: 0 };
    try {
      const cfg = await this.settings.get();
      const today = todayLocal(now);
      summary.recoveredStale = await this.recoverStale(now);
      await this.housekeeping(now, summary);
      summary.cancelledIneligible = await this.sweepIneligible();
      if (opts.force || this.localHour(now) >= cfg.sendHourLocal) await this.generate(today, cfg, summary, now);
      else summary.skippedBeforeSendHour = true;
      if (opts.send !== false) await this.deliver(now, cfg, summary);
      await this.prisma.jobRun.update({ where: { id: job.id }, data: { status: 'OK', finishedAt: new Date(), summary: summary as unknown as Prisma.InputJsonValue } });
    } catch (e) {
      // Un fallo inesperado queda registrado; los envíos ya hechos no se pierden.
      const msg = (e as Error).message?.slice(0, 500) ?? 'Error desconocido';
      this.logger.error(`Fallo en la ejecución de recordatorios: ${msg}`);
      await this.prisma.jobRun.update({ where: { id: job.id }, data: { status: 'ERROR', finishedAt: new Date(), error: msg, summary: summary as unknown as Prisma.InputJsonValue } });
    }
    return { ...summary, jobId: job.id };
  }

  private localHour(now: Date) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: loadEnv().APP_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
  }

  /** Limpieza diaria (la ejecuta el mismo cron): sesiones vencidas y registros de ejecución con más de 90 días. */
  private async housekeeping(_now: Date, s: RunSummary) {
    try {
      // Siempre con el reloj real: la limpieza no debe depender de la fecha simulada de una ejecución de prueba.
      const real = Date.now();
      s.purgedSessions = (await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(real - 86_400_000) } } })).count;
      s.purgedJobRuns = (await this.prisma.jobRun.deleteMany({ where: { startedAt: { lt: new Date(real - 90 * 86_400_000) } } })).count;
    } catch (e) {
      this.logger.warn(`No se pudo hacer la limpieza periódica: ${(e as Error).message}`); // no debe impedir los recordatorios
    }
  }

  /** Envíos que quedaron "en vuelo" (caída del servidor) se reprograman. */
  private async recoverStale(now: Date) {
    const r = await this.prisma.notification.updateMany({
      where: { status: 'SENDING', lockedAt: { lt: new Date(now.getTime() - STALE_MINUTES * 60_000) } },
      data: { status: 'FAILED', nextAttemptAt: now, lockedAt: null, lastError: 'Interrumpido durante el envío; se reintentará' },
    });
    return r.count;
  }

  /** Cancela recordatorios pendientes de elementos que ya no los requieren (cerrados, desactivados, sin fecha…). */
  private async sweepIneligible() {
    const pending = { status: { in: ['PENDING', 'FAILED'] as ('PENDING' | 'FAILED')[] }, nextAttemptAt: { not: null } };
    const rows = await this.prisma.notification.findMany({
      where: {
        ...pending,
        OR: [
          { followUpId: { not: null }, followUp: { is: { OR: [{ status: { isTerminal: true } }, { remindersEnabled: false }, { targetDate: null }, { client: { status: 'INACTIVE' } }] } } },
          {
            maintenanceId: { not: null },
            maintenance: { is: { OR: [{ status: { notIn: OPEN } }, { system: { OR: [{ status: 'INACTIVE' }, { installation: { OR: [{ status: 'INACTIVE' }, { client: { status: 'INACTIVE' } }] } }] } }] } },
          },
        ],
      },
      select: { id: true },
    });
    return cancelByIds(this.prisma, rows.map((r) => r.id), 'El elemento ya no requiere recordatorios');
  }

  // ---- Generación ----
  private async generate(today: string, cfg: ReminderConfig, s: RunSummary, now: Date) {
    const horizon = parseDateOnly(addDays(today, 31 * cfg.leadMonths + 1));
    const contactSel = { where: { active: true, receivesNotifications: true, email: { not: null } }, select: { name: true, email: true } } as const;

    const followUps = await this.prisma.followUp.findMany({
      where: { remindersEnabled: true, targetDate: { not: null, lte: horizon }, status: { isTerminal: false }, client: { status: 'ACTIVE' } },
      include: { client: { select: { contacts: contactSel } }, responsible: { select: { name: true, email: true, active: true } } },
    });
    const maints = await this.prisma.maintenance.findMany({
      where: { status: { in: OPEN }, scheduledDate: { lte: horizon }, system: { status: 'ACTIVE', installation: { status: 'ACTIVE', client: { status: 'ACTIVE' } } } },
      include: { system: { select: { responsible: { select: { name: true, email: true, active: true } }, installation: { select: { client: { select: { contacts: contactSel } } } } } } },
    });

    const prevFu = await this.prisma.notification.findMany({ where: { followUpId: { in: followUps.map((f) => f.id) }, status: { not: 'CANCELLED' } }, select: { followUpId: true, recipientEmail: true, dedupeKey: true } });
    const prevMt = await this.prisma.notification.findMany({ where: { maintenanceId: { in: maints.map((m) => m.id) }, status: { not: 'CANCELLED' } }, select: { maintenanceId: true, recipientEmail: true, dedupeKey: true } });
    const keysFor = (rows: { recipientEmail: string; dedupeKey: string }[]) => ({ hasAny: (email: string) => rows.some((r) => r.recipientEmail === email), has: (k: string) => rows.some((r) => r.dedupeKey === k) });

    const items: { entity: 'FOLLOW_UP' | 'MAINTENANCE'; id: string; target: string; recipients: Recipient[]; prev: ReturnType<typeof keysFor> }[] = [];
    for (const f of followUps) {
      const contacts = cfg.includeClientContacts ? f.client.contacts.map((c) => ({ email: c.email!, name: c.name })) : [];
      items.push({
        entity: 'FOLLOW_UP', id: f.id, target: toISODate(f.targetDate!), prev: keysFor(prevFu.filter((p) => p.followUpId === f.id)),
        recipients: this.recipients(f.responsible, cfg.internalRecipients, contacts),
      });
    }
    for (const m of maints) {
      const contacts = cfg.includeClientContacts ? m.system.installation.client.contacts.map((c) => ({ email: c.email!, name: c.name })) : [];
      items.push({
        entity: 'MAINTENANCE', id: m.id, target: toISODate(m.scheduledDate), prev: keysFor(prevMt.filter((p) => p.maintenanceId === m.id)),
        recipients: this.recipients(m.system.responsible, cfg.internalRecipients, contacts),
      });
    }

    for (const it of items) {
      try {
        const occ = latestDueOccurrence(it.target, today, cfg);
        if (!occ) continue;
        if (!it.recipients.length) { s.noRecipients++; continue; }
        const rows: Prisma.NotificationCreateManyInput[] = [];
        for (const r of it.recipients) {
          const key = dedupeKey(it.entity, it.id, r.email, occ);
          if (it.prev.has(key)) continue;
          rows.push({
            entityType: it.entity, ...(it.entity === 'FOLLOW_UP' ? { followUpId: it.id } : { maintenanceId: it.id }), recipientEmail: r.email, recipientName: r.name,
            kind: occurrenceKind(it.target, occ, it.prev.hasAny(r.email)), occurrenceDate: parseDateOnly(occ), dedupeKey: key, status: 'PENDING', nextAttemptAt: now,
          });
        }
        if (!rows.length) continue;
        // skipDuplicates + dedupeKey UNIQUE: ejecuciones simultáneas no pueden crear el mismo recordatorio dos veces.
        const created = await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
        s.created += created.count;
        // Un aviso más reciente reemplaza a los anteriores que no llegaron a enviarse.
        const older = await this.prisma.notification.findMany({
          where: { ...(it.entity === 'FOLLOW_UP' ? { followUpId: it.id } : { maintenanceId: it.id }), occurrenceDate: { lt: parseDateOnly(occ) }, status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { not: null } },
          select: { id: true },
        });
        s.superseded += await cancelByIds(this.prisma, older.map((o) => o.id), 'Reemplazada por un recordatorio más reciente');
      } catch (e) {
        this.logger.error(`No se pudo generar el recordatorio de ${it.entity} ${it.id}: ${(e as Error).message}`);
      }
    }
  }

  private recipients(responsible: { name: string; email: string; active: boolean } | null, internal: string[], contacts: { email: string; name: string }[]): Recipient[] {
    const map = new Map<string, Recipient>();
    if (responsible?.active && responsible.email) map.set(responsible.email.toLowerCase(), { email: responsible.email.toLowerCase(), name: responsible.name });
    for (const e of internal) if (!map.has(e.toLowerCase())) map.set(e.toLowerCase(), { email: e.toLowerCase(), name: null });
    for (const c of contacts) if (!map.has(c.email.toLowerCase())) map.set(c.email.toLowerCase(), { email: c.email.toLowerCase(), name: c.name });
    return [...map.values()];
  }

  // ---- Envío ----
  private async deliver(now: Date, cfg: ReminderConfig, s: RunSummary) {
    let processed = 0;
    while (processed < MAX_PER_RUN) {
      // FOR UPDATE SKIP LOCKED: cada notificación la reclama una sola ejecución, aunque haya varias a la vez.
      const nowUtc = now.toISOString();
      const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
        UPDATE "Notification" SET "status" = 'SENDING', "lockedAt" = (${nowUtc}::timestamptz AT TIME ZONE 'UTC'), "attempt" = "attempt" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE "id" IN (
          SELECT "id" FROM "Notification"
          WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" IS NOT NULL AND "nextAttemptAt" <= (${nowUtc}::timestamptz AT TIME ZONE 'UTC')
          ORDER BY "nextAttemptAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
        RETURNING "id"`;
      if (!claimed.length) break;
      s.claimed += claimed.length;
      processed += claimed.length;
      for (const { id } of claimed) await this.sendOne(id, now, cfg, s); // un fallo no detiene a los demás
    }
  }

  private async sendOne(id: string, now: Date, cfg: ReminderConfig, s: RunSummary) {
    const env = loadEnv();
    try {
      const n = await this.prisma.notification.findUniqueOrThrow({
        where: { id },
        include: {
          followUp: { include: { client: { select: { commercialName: true, status: true } }, installation: { select: { name: true } }, system: { select: { category: { select: { name: true } } } }, type: { select: { name: true } }, status: { select: { name: true, isTerminal: true } }, responsible: { select: { name: true } } } },
          maintenance: { include: { type: { select: { name: true } }, system: { select: { status: true, category: { select: { name: true } }, responsible: { select: { name: true } }, installation: { select: { name: true, status: true, client: { select: { commercialName: true, status: true } } } } } } } },
        },
      });

      // Re-validación justo antes de enviar: si se finalizó/canceló mientras esperaba, NO se envía.
      const f = n.followUp;
      const m = n.maintenance;
      const eligible = f
        ? !f.status.isTerminal && f.remindersEnabled && !!f.targetDate && f.client.status === 'ACTIVE'
        : !!m && OPEN.includes(m.status) && m.system.status === 'ACTIVE' && m.system.installation.status === 'ACTIVE' && m.system.installation.client.status === 'ACTIVE';
      if (!eligible) {
        await cancelByIds(this.prisma, [id], 'El elemento ya no requiere recordatorios');
        s.cancelledAtSend++;
        return;
      }
      if (env.EMAIL_MODE === 'live' && env.allowedRecipients.length && !env.allowedRecipients.includes(n.recipientEmail.toLowerCase())) {
        await cancelByIds(this.prisma, [id], 'Destinatario fuera de la lista permitida (EMAIL_ALLOWED_RECIPIENTS)');
        s.cancelledAtSend++;
        return;
      }

      const target = f ? toISODate(f.targetDate!) : toISODate(m!.scheduledDate);
      const data: ReminderEmailData = f
        ? {
            entityLabel: 'Seguimiento', title: f.title, client: f.client.commercialName, installation: f.installation?.name, systemType: f.system?.category.name, typeName: f.type.name,
            targetDate: target, status: f.status.name, responsible: f.responsible?.name, priority: f.priority[0] + f.priority.slice(1).toLowerCase(), nextAction: f.nextAction,
            url: `${env.APP_URL.replace(/\/$/, '')}/seguimientos/${f.id}`, daysLeft: daysBetween(todayLocal(now), target),
          }
        : {
            entityLabel: 'Mantenimiento', title: `${m!.type.name} · ${m!.system.category.name}`, client: m!.system.installation.client.commercialName, installation: m!.system.installation.name,
            systemType: m!.system.category.name, typeName: m!.type.name, targetDate: target, status: m!.status.replace('_', ' '), responsible: m!.system.responsible?.name,
            url: `${env.APP_URL.replace(/\/$/, '')}/mantenimientos/${m!.id}`, daysLeft: daysBetween(todayLocal(now), target),
          };
      const mail = renderReminderEmail(data);
      try {
        const res = await this.provider.send({ to: n.recipientEmail, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: n.id });
        await this.prisma.notification.update({
          where: { id }, data: { status: 'SENT', sentAt: new Date(), nextAttemptAt: null, lockedAt: null, lastError: null, subject: mail.subject, provider: this.provider.name, providerMessageId: res.id },
        });
        s.sent++;
      } catch (e) {
        const err = e instanceof EmailError ? e : new EmailError((e as Error).message ?? 'Error de envío');
        const delay = err.permanent ? null : retryDelayMinutes(n.attempt, cfg);
        await this.prisma.notification.update({
          where: { id },
          data: { status: 'FAILED', lockedAt: null, subject: mail.subject, provider: this.provider.name, lastError: err.message.slice(0, 500), nextAttemptAt: delay === null ? null : new Date(now.getTime() + delay * 60_000) },
        });
        s.failed++;
        this.logger.warn(`Envío fallido (${id}, intento ${n.attempt}): ${err.message}`);
      }
    } catch (e) {
      // Error inesperado con este registro: se libera para reintento y se continúa con el resto.
      this.logger.error(`Error procesando la notificación ${id}: ${(e as Error).message}`);
      await this.prisma.notification.updateMany({ where: { id, status: 'SENDING' }, data: { status: 'FAILED', lockedAt: null, nextAttemptAt: new Date(now.getTime() + 5 * 60_000), lastError: 'Error interno al procesar el envío' } }).catch(() => undefined);
      s.failed++;
    }
  }
}
