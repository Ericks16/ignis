import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { addDays, parseDateOnly, todayLocal, toISODate } from '../common/dates';
import { AuthUser } from '../common/decorators';
import { pageArgs, definedKeys } from '../common/helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeStatusDto, CreateFollowUpDto, CreateStatusDto, FollowUpCalendarQuery, ListFollowUpsQuery, UpdateFollowUpDto, UpdateStatusDto,
} from './dto/follow-ups.dto';
import { checkTransition, isFollowUpOverdue } from './follow-ups.rules';
import { cancelPendingFor } from '../reminders/cancel';
import { followUpScope } from '../common/scopes';

type Ctx = { actor: AuthUser; ip?: string };
const UPCOMING_DAYS = 30;

const include = {
  client: { select: { id: true, commercialName: true } },
  installation: { select: { id: true, name: true } },
  system: { select: { id: true, brand: true, model: true, category: { select: { name: true } } } },
  maintenance: { select: { id: true, scheduledDate: true, type: { select: { name: true } } } },
  type: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, isTerminal: true } },
  responsible: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  technicians: { select: { technician: { select: { id: true, name: true, initials: true } } } },
} satisfies Prisma.FollowUpInclude;
type Row = Prisma.FollowUpGetPayload<{ include: typeof include }>;

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Un Técnico solo ve los seguimientos de los que es responsable o en los que está asignado. */
  scope(actor: AuthUser): Prisma.FollowUpWhereInput {
    return followUpScope(actor);
  }

  private shape(f: Row, today = todayLocal()) {
    const { technicians, ...rest } = f;
    return {
      ...rest,
      technicians: technicians.map((t) => t.technician),
      overdue: isFollowUpOverdue(f.status.isTerminal, f.targetDate ? toISODate(f.targetDate) : null, today),
    };
  }

  private filters(q: ListFollowUpsQuery, today: string): Prisma.FollowUpWhereInput[] {
    const f: Prisma.FollowUpWhereInput[] = [];
    const t = parseDateOnly(today);
    if (q.clientId) f.push({ clientId: q.clientId });
    if (q.statusId) f.push({ statusId: q.statusId });
    if (q.typeId) f.push({ typeId: q.typeId });
    if (q.priority) f.push({ priority: q.priority });
    if (q.responsibleId) f.push({ responsibleId: q.responsibleId });
    if (q.technicianId) f.push({ technicians: { some: { technicianId: q.technicianId } } });
    if (q.state === 'open') f.push({ status: { isTerminal: false } });
    if (q.state === 'closed') f.push({ status: { isTerminal: true } });
    if (q.state === 'overdue') f.push({ status: { isTerminal: false }, targetDate: { lt: t } });
    if (q.state === 'upcoming') f.push({ status: { isTerminal: false }, targetDate: { gte: t, lte: parseDateOnly(addDays(today, UPCOMING_DAYS)) } });
    if (q.search) {
      f.push({ OR: [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { client: { commercialName: { contains: q.search, mode: 'insensitive' } } },
      ] });
    }
    return f;
  }

  async list(q: ListFollowUpsQuery, actor: AuthUser) {
    const today = todayLocal();
    const where: Prisma.FollowUpWhereInput = { AND: [this.scope(actor), ...this.filters(q, today)] };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.followUp.findMany({ where, include, skip, take, orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] }),
      this.prisma.followUp.count({ where }),
    ]);
    return { items: rows.map((r) => this.shape(r, today)), total, page, pageSize };
  }

  async get(id: string, actor: AuthUser) {
    const f = await this.prisma.followUp.findFirst({ where: { AND: [{ id }, this.scope(actor)] }, include });
    if (!f) throw new NotFoundException('Seguimiento no encontrado');
    return this.shape(f);
  }

  async history(id: string, actor: AuthUser) {
    await this.get(id, actor);
    const rows = await this.prisma.followUpHistory.findMany({ where: { followUpId: id }, orderBy: { createdAt: 'desc' }, include: { changedBy: { select: { name: true } } } });
    return rows.map((h) => ({ id: h.id, fromName: h.fromName, toName: h.toName, comment: h.comment, by: h.changedBy?.name ?? null, createdAt: h.createdAt }));
  }

  async create(dto: CreateFollowUpDto, { actor, ip }: Ctx) {
    const today = todayLocal();
    const startDate = dto.startDate ?? today;
    await this.validateLinks(dto.clientId, dto, true);
    await this.assertType(dto.typeId);
    await this.assertResponsible(dto.responsibleId);
    await this.assertTechnicians(dto.technicianIds);
    this.assertDates(startDate, dto.targetDate);
    const initial = await this.prisma.followUpStatus.findFirst({ where: { name: 'PENDIENTE', isSystem: true } });
    if (!initial) throw new ConflictException('Falta el estado inicial PENDIENTE; revise la configuración');
    const { technicianIds, startDate: _s, targetDate, ...data } = dto;
    const f = await this.prisma.$transaction(async (tx) => {
      const created = await tx.followUp.create({
        data: {
          ...data, statusId: initial.id, startDate: parseDateOnly(startDate), targetDate: targetDate ? parseDateOnly(targetDate) : null,
          technicians: { create: (technicianIds ?? []).map((technicianId) => ({ technicianId })) },
        },
      });
      await tx.followUpHistory.create({ data: { followUpId: created.id, fromName: null, toName: initial.name, changedById: actor.id, comment: 'Seguimiento creado' } });
      return created;
    });
    await this.audit.log({ actorId: actor.id, action: 'followup.created', entity: 'FollowUp', entityId: f.id, ip });
    return this.get(f.id, actor);
  }

  async update(id: string, dto: UpdateFollowUpDto, { actor, ip }: Ctx) {
    const cur = await this.get(id, actor);
    if (cur.status.isTerminal) throw new BadRequestException('El seguimiento está cerrado; reábralo para editarlo');
    const links = {
      installationId: dto.installationId === undefined ? cur.installation?.id : dto.installationId,
      systemId: dto.systemId === undefined ? cur.system?.id : dto.systemId,
      maintenanceId: dto.maintenanceId === undefined ? cur.maintenance?.id : dto.maintenanceId,
    };
    if (dto.installationId !== undefined || dto.systemId !== undefined || dto.maintenanceId !== undefined) await this.validateLinks(cur.client.id, links, false);
    if (dto.typeId && dto.typeId !== cur.type.id) await this.assertType(dto.typeId);
    if (dto.responsibleId && dto.responsibleId !== cur.responsible?.id) await this.assertResponsible(dto.responsibleId);
    if (dto.technicianIds) await this.assertTechnicians(dto.technicianIds);
    this.assertDates(dto.startDate ?? toISODate(cur.startDate), dto.targetDate === undefined ? (cur.targetDate ? toISODate(cur.targetDate) : null) : dto.targetDate);
    const { technicianIds, startDate, targetDate, ...rest } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.followUp.update({
        where: { id },
        data: { ...rest, ...(startDate ? { startDate: parseDateOnly(startDate) } : {}), ...(targetDate !== undefined ? { targetDate: targetDate ? parseDateOnly(targetDate) : null } : {}) },
      });
      // Si cambia la fecha objetivo, el responsable o se desactivan los recordatorios, los pendientes se recalculan.
      if (dto.targetDate !== undefined || dto.responsibleId !== undefined || dto.remindersEnabled !== undefined) await cancelPendingFor(tx, { followUpId: id }, 'El seguimiento fue modificado; se recalcularán los recordatorios');
      if (technicianIds) {
        await tx.followUpTechnician.deleteMany({ where: { followUpId: id } });
        await tx.followUpTechnician.createMany({ data: technicianIds.map((technicianId) => ({ followUpId: id, technicianId })) });
      }
    });
    await this.audit.log({ actorId: actor.id, action: 'followup.updated', entity: 'FollowUp', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return this.get(id, actor);
  }

  /**
   * Cambia el estado. Si es terminal (FINALIZADO/CANCELADO), en la misma transacción: registra fecha y usuario,
   * escribe el historial y deja una actividad. Los recordatorios (Fase 6) leen el estado terminal, por lo que se
   * detienen de inmediato; allí se añadirá la cancelación de notificaciones pendientes en esta misma transacción.
   */
  async changeStatus(id: string, dto: ChangeStatusDto, { actor, ip }: Ctx) {
    const cur = await this.get(id, actor);
    const target = await this.prisma.followUpStatus.findUnique({ where: { id: dto.statusId } });
    if (!target) throw new NotFoundException('Estado no encontrado');
    if (!target.active) throw new BadRequestException('El estado está inactivo');
    const check = checkTransition(cur.status, target, dto.comment);
    if (!check.ok) throw new BadRequestException(check.reason);
    const comment = dto.comment?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.followUp.update({
        where: { id },
        data: { statusId: target.id, ...(check.closes ? { completedAt: new Date(), completedById: actor.id } : {}), ...(check.reopens ? { completedAt: null, completedById: null } : {}) },
      });
      await tx.followUpHistory.create({ data: { followUpId: id, fromName: cur.status.name, toName: target.name, changedById: actor.id, comment } });
      // Cerrar detiene los recordatorios de inmediato, en la misma transacción (sin esperar al cron).
      if (check.closes) await cancelPendingFor(tx, { followUpId: id }, `Seguimiento ${target.name.toLowerCase()}`);
      if (target.name === 'FINALIZADO') {
        const type = await tx.activityType.findFirst({ where: { name: 'Seguimiento finalizado', active: true } });
        if (type) {
          await tx.activity.create({
            data: { clientId: cur.client.id, followUpId: id, userId: actor.id, typeId: type.id, description: `Seguimiento finalizado: ${cur.title}${comment ? `. ${comment}` : ''}` },
          });
        }
      }
    });
    await this.audit.log({
      actorId: actor.id, action: check.closes ? 'followup.closed' : check.reopens ? 'followup.reopened' : 'followup.status_changed',
      entity: 'FollowUp', entityId: id, metadata: { from: cur.status.name, to: target.name }, ip,
    });
    return this.get(id, actor);
  }

  /** Eventos de seguimientos (fecha objetivo) para el calendario. */
  async calendar(q: FollowUpCalendarQuery, actor: AuthUser) {
    const from = parseDateOnly(q.from);
    const to = parseDateOnly(q.to);
    if (to < from) throw new BadRequestException('El rango de fechas no es válido');
    if ((to.getTime() - from.getTime()) / 86_400_000 > 366) throw new BadRequestException('El rango máximo es de 366 días');
    const today = todayLocal();
    const where: Prisma.FollowUpWhereInput = {
      AND: [
        this.scope(actor),
        { targetDate: { gte: parseDateOnly(q.from), lte: parseDateOnly(q.to) } },
        ...(q.clientId ? [{ clientId: q.clientId }] : []),
        ...(q.technicianId ? [{ OR: [{ technicians: { some: { technicianId: q.technicianId } } }, { responsible: { technician: { is: { id: q.technicianId } } } }] }] : []),
      ],
    };
    const rows = await this.prisma.followUp.findMany({ where, include, orderBy: { targetDate: 'asc' }, take: 2000 });
    return rows.map((r) => {
      const s = this.shape(r, today);
      return {
        id: s.id, kind: 'FOLLOWUP' as const, date: toISODate(s.targetDate as Date), status: s.status.name, closed: s.status.isTerminal, overdue: s.overdue,
        title: `Seguimiento · ${s.title}`, client: s.client.commercialName, installation: s.installation?.name ?? '',
        technicians: s.technicians.map((t) => t.name), priority: s.priority,
      };
    });
  }

  /** Indicadores para el dashboard. */
  async summary(actor: AuthUser) {
    const today = todayLocal();
    const t = parseDateOnly(today);
    const scope = this.scope(actor);
    const [statuses, grouped, overdue, upcoming] = await Promise.all([
      this.prisma.followUpStatus.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.followUp.groupBy({ by: ['statusId'], where: scope, _count: { _all: true } }),
      this.prisma.followUp.count({ where: { AND: [scope, { status: { isTerminal: false }, targetDate: { lt: t } }] } }),
      this.prisma.followUp.count({ where: { AND: [scope, { status: { isTerminal: false }, targetDate: { gte: t, lte: parseDateOnly(addDays(today, UPCOMING_DAYS)) } }] } }),
    ]);
    const count = (id: string) => grouped.find((g) => g.statusId === id)?._count._all ?? 0;
    const byStatus = statuses.map((s) => ({ id: s.id, name: s.name, isTerminal: s.isTerminal, count: count(s.id) }));
    const named = (n: string) => byStatus.find((s) => s.name === n)?.count ?? 0;
    return {
      pending: named('PENDIENTE'), inProgress: named('EN PROCESO'), finished: named('FINALIZADO'),
      open: byStatus.filter((s) => !s.isTerminal).reduce((a, s) => a + s.count, 0), overdue, upcoming, byStatus,
    };
  }

  // ---- Estados (administración controlada) ----
  listStatuses(includeInactive: boolean) {
    return this.prisma.followUpStatus.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createStatus(dto: CreateStatusDto, { actor, ip }: Ctx) {
    const name = dto.name.toUpperCase();
    if (await this.prisma.followUpStatus.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException(`Ya existe el estado "${name}"`);
    const s = await this.prisma.followUpStatus.create({ data: { name, isTerminal: dto.isTerminal ?? false, sortOrder: dto.sortOrder ?? 50 } });
    await this.audit.log({ actorId: actor.id, action: 'followup_status.created', entity: 'FollowUpStatus', entityId: s.id, metadata: { name, isTerminal: s.isTerminal }, ip });
    return s;
  }

  async updateStatus(id: string, dto: UpdateStatusDto, { actor, ip }: Ctx) {
    const cur = await this.prisma.followUpStatus.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Estado no encontrado');
    if (cur.isSystem && (dto.name !== undefined || dto.active === false)) throw new BadRequestException('Los estados de sistema no se pueden renombrar ni desactivar');
    const data: Prisma.FollowUpStatusUpdateInput = { ...dto, ...(dto.name ? { name: dto.name.toUpperCase() } : {}) };
    if (dto.name && dto.name.toUpperCase() !== cur.name && (await this.prisma.followUpStatus.findFirst({ where: { name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } } }))) {
      throw new ConflictException('Ya existe un estado con ese nombre');
    }
    const s = await this.prisma.followUpStatus.update({ where: { id }, data });
    await this.audit.log({ actorId: actor.id, action: 'followup_status.updated', entity: 'FollowUpStatus', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return s;
  }

  // ---- helpers ----
  /** Valida que instalación, sistema y mantenimiento pertenezcan al mismo cliente y sean coherentes entre sí. */
  private async validateLinks(clientId: string, l: { installationId?: string | null; systemId?: string | null; maintenanceId?: string | null }, requireActiveClient: boolean) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (requireActiveClient && client.status !== 'ACTIVE') throw new BadRequestException('El cliente está inactivo');
    let installationId = l.installationId ?? null;
    if (l.installationId) {
      const i = await this.prisma.installation.findUnique({ where: { id: l.installationId } });
      if (!i || i.clientId !== clientId) throw new BadRequestException('La instalación no pertenece al cliente');
    }
    let systemId = l.systemId ?? null;
    if (systemId) {
      const s = await this.prisma.installedSystem.findUnique({ where: { id: systemId }, include: { installation: true } });
      if (!s || s.installation.clientId !== clientId) throw new BadRequestException('El sistema no pertenece al cliente');
      if (installationId && s.installationId !== installationId) throw new BadRequestException('El sistema no pertenece a la instalación indicada');
      installationId = s.installationId;
    }
    if (l.maintenanceId) {
      const m = await this.prisma.maintenance.findUnique({ where: { id: l.maintenanceId }, include: { system: { include: { installation: true } } } });
      if (!m || m.system.installation.clientId !== clientId) throw new BadRequestException('El mantenimiento no pertenece al cliente');
      if (systemId && m.systemId !== systemId) throw new BadRequestException('El mantenimiento no corresponde al sistema indicado');
      if (installationId && m.system.installationId !== installationId) throw new BadRequestException('El mantenimiento no corresponde a la instalación indicada');
    }
  }

  private assertDates(start: string, target?: string | null) {
    parseDateOnly(start);
    if (target) {
      parseDateOnly(target);
      if (target < start) throw new BadRequestException('La fecha objetivo no puede ser anterior a la fecha de inicio');
    }
  }

  private async assertType(id: string) {
    const t = await this.prisma.followUpType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de seguimiento no encontrado');
    if (!t.active) throw new BadRequestException('El tipo de seguimiento está inactivo');
  }

  private async assertResponsible(id?: string | null) {
    if (!id) return;
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !u.active) throw new BadRequestException('El responsable no existe o está inactivo');
  }

  private async assertTechnicians(ids?: string[]) {
    if (!ids?.length) return;
    if ((await this.prisma.technician.count({ where: { id: { in: ids }, status: 'ACTIVE' } })) !== ids.length) throw new BadRequestException('Alguno de los técnicos no existe o está inactivo');
  }
}
