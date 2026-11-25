import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceStatus, Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { addDays, parseDateOnly, todayLocal, toISODate } from '../common/dates';
import { AuthUser } from '../common/decorators';
import { pageArgs, definedKeys } from '../common/helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  CalendarQuery, CancelMaintenanceDto, CompleteMaintenanceDto, CreateMaintenanceDto, ListMaintenancesQuery,
  RescheduleMaintenanceDto, UpdateMaintenanceDto,
} from './dto/maintenance.dto';
import { canTransition, isOverdue, nextDateAfterCompletion, OPEN, TERMINAL } from './maintenance.rules';
import { cancelPendingFor } from '../reminders/cancel';
import { maintenanceScope } from '../common/scopes';

type Ctx = { actor: AuthUser; ip?: string };
const UPCOMING_DAYS = 30;
const TEXT_FIELDS = ['description', 'observations', 'recommendations', 'materials', 'result'] as const;

const include = {
  type: { select: { id: true, name: true } },
  system: {
    select: {
      id: true, brand: true, model: true, lastMaintenanceDate: true, nextMaintenanceDate: true,
      category: { select: { id: true, name: true } },
      installation: { select: { id: true, name: true, client: { select: { id: true, commercialName: true } } } },
    },
  },
  technicians: { select: { technician: { select: { id: true, name: true, initials: true } } } },
} satisfies Prisma.MaintenanceInclude;

type Row = Prisma.MaintenanceGetPayload<{ include: typeof include }>;

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Un Técnico solo ve los mantenimientos en los que está asignado (por su usuario vinculado). */
  private scope(actor: AuthUser): Prisma.MaintenanceWhereInput {
    return maintenanceScope(actor);
  }

  private shape(m: Row, today = todayLocal()) {
    const { technicians, ...rest } = m;
    return { ...rest, technicians: technicians.map((t) => t.technician), overdue: isOverdue(m.status, toISODate(m.scheduledDate), today) };
  }

  private filters(q: ListMaintenancesQuery | CalendarQuery, today: string): Prisma.MaintenanceWhereInput[] {
    const f: Prisma.MaintenanceWhereInput[] = [];
    if (q.typeId) f.push({ typeId: q.typeId });
    if (q.status) f.push({ status: q.status });
    if (q.technicianId) f.push({ technicians: { some: { technicianId: q.technicianId } } });
    if (q.clientId) f.push({ system: { installation: { clientId: q.clientId } } });
    if (q.categoryId) f.push({ system: { categoryId: q.categoryId } });
    if ('systemId' in q && q.systemId) f.push({ systemId: q.systemId });
    if ('due' in q && q.due) {
      if (q.due === 'open') f.push({ status: { in: OPEN } });
      if (q.due === 'overdue') f.push({ status: { in: OPEN }, scheduledDate: { lt: parseDateOnly(today) } });
      if (q.due === 'upcoming') f.push({ status: { in: OPEN }, scheduledDate: { gte: parseDateOnly(today), lte: parseDateOnly(addDays(today, UPCOMING_DAYS)) } });
    }
    if ('from' in q && q.from) f.push({ scheduledDate: { gte: parseDateOnly(q.from) } });
    if ('to' in q && q.to) f.push({ scheduledDate: { lte: parseDateOnly(q.to) } });
    if ('search' in q && q.search) {
      f.push({ OR: [
        { description: { contains: q.search, mode: 'insensitive' } },
        { system: { installation: { name: { contains: q.search, mode: 'insensitive' } } } },
        { system: { installation: { client: { commercialName: { contains: q.search, mode: 'insensitive' } } } } },
      ] });
    }
    return f;
  }

  async list(q: ListMaintenancesQuery, actor: AuthUser) {
    const today = todayLocal();
    const where: Prisma.MaintenanceWhereInput = { AND: [this.scope(actor), ...this.filters(q, today)] };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.maintenance.findMany({ where, include, skip, take, orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.maintenance.count({ where }),
    ]);
    return { items: rows.map((r) => this.shape(r, today)), total, page, pageSize };
  }

  async get(id: string, actor: AuthUser) {
    const m = await this.prisma.maintenance.findFirst({
      where: { AND: [{ id }, this.scope(actor)] },
      include: { ...include, rescheduledFrom: { select: { id: true, scheduledDate: true } }, rescheduledTo: { select: { id: true, scheduledDate: true } } },
    });
    if (!m) throw new NotFoundException('Mantenimiento no encontrado');
    return this.shape(m as unknown as Row) as ReturnType<MaintenanceService['shape']> & { rescheduledFrom: unknown; rescheduledTo: unknown };
  }

  async history(id: string, actor: AuthUser) {
    await this.get(id, actor);
    const logs = await this.prisma.auditLog.findMany({
      where: { entity: 'Maintenance', entityId: id }, orderBy: { createdAt: 'desc' }, include: { actor: { select: { name: true } } },
    });
    return logs.map((l) => ({ id: l.id, action: l.action, metadata: l.metadata, actor: l.actor?.name ?? null, createdAt: l.createdAt }));
  }

  async create(dto: CreateMaintenanceDto, { actor, ip }: Ctx) {
    const scheduledDate = parseDateOnly(dto.scheduledDate);
    const system = await this.prisma.installedSystem.findUnique({ where: { id: dto.systemId }, include: { installation: { include: { client: true } } } });
    if (!system) throw new NotFoundException('Sistema no encontrado');
    if (system.status !== 'ACTIVE' || system.installation.status !== 'ACTIVE' || system.installation.client.status !== 'ACTIVE') {
      throw new BadRequestException('El sistema, la instalación o el cliente están inactivos');
    }
    await this.assertType(dto.typeId);
    await this.assertTechnicians(dto.technicianIds);
    const { technicianIds, systemId, typeId, scheduledDate: _s, ...text } = dto;
    const m = await this.prisma.maintenance.create({
      data: { systemId, typeId, scheduledDate, ...text, technicians: { create: (technicianIds ?? []).map((technicianId) => ({ technicianId })) } },
    });
    await this.audit.log({ actorId: actor.id, action: 'maintenance.created', entity: 'Maintenance', entityId: m.id, metadata: { scheduledDate: dto.scheduledDate }, ip });
    return this.get(m.id, actor);
  }

  async update(id: string, dto: UpdateMaintenanceDto, { actor, ip }: Ctx) {
    const current = await this.get(id, actor);
    if (current.status === 'CANCELADO' || current.status === 'REPROGRAMADO') throw new BadRequestException('Este mantenimiento ya no admite cambios');
    const structural = dto.typeId !== undefined || dto.scheduledDate !== undefined || dto.technicianIds !== undefined;
    if (structural && actor.role === Role.TECNICO) throw new ForbiddenException('Un técnico solo puede registrar observaciones y resultados');
    if (structural && current.status === 'REALIZADO') throw new BadRequestException('Un mantenimiento realizado no puede cambiar de tipo, fecha o equipo');
    if (dto.typeId && dto.typeId !== current.type.id) await this.assertType(dto.typeId);
    if (dto.technicianIds) await this.assertTechnicians(dto.technicianIds);
    const { technicianIds, scheduledDate, ...rest } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenance.update({ where: { id }, data: { ...rest, ...(scheduledDate ? { scheduledDate: parseDateOnly(scheduledDate) } : {}) } });
      if (scheduledDate) await cancelPendingFor(tx, { maintenanceId: id }, 'Cambió la fecha programada; se recalcularán los recordatorios');
      if (technicianIds) {
        await tx.maintenanceTechnician.deleteMany({ where: { maintenanceId: id } });
        await tx.maintenanceTechnician.createMany({ data: technicianIds.map((technicianId) => ({ maintenanceId: id, technicianId })) });
      }
    });
    await this.audit.log({ actorId: actor.id, action: 'maintenance.updated', entity: 'Maintenance', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return this.get(id, actor);
  }

  async start(id: string, { actor, ip }: Ctx) {
    await this.transition(id, 'EN_PROCESO', actor);
    await this.audit.log({ actorId: actor.id, action: 'maintenance.started', entity: 'Maintenance', entityId: id, ip });
    return this.get(id, actor);
  }

  async setStatus(id: string, status: 'PROGRAMADO' | 'PENDIENTE', { actor, ip }: Ctx) {
    await this.transition(id, status, actor);
    await this.audit.log({ actorId: actor.id, action: 'maintenance.status_changed', entity: 'Maintenance', entityId: id, metadata: { status }, ip });
    return this.get(id, actor);
  }

  async complete(id: string, dto: CompleteMaintenanceDto, { actor, ip }: Ctx) {
    const current = await this.get(id, actor);
    if (!canTransition(current.status, 'REALIZADO')) throw new BadRequestException(`No se puede registrar como realizado desde el estado ${current.status}`);
    const today = todayLocal();
    parseDateOnly(dto.executedDate);
    if (dto.executedDate > today) throw new BadRequestException('La fecha de ejecución no puede ser futura');
    if (dto.nextMaintenanceDate) {
      parseDateOnly(dto.nextMaintenanceDate);
      if (dto.nextMaintenanceDate <= dto.executedDate) throw new BadRequestException('El próximo mantenimiento debe ser posterior a la fecha de ejecución');
    }
    const sys = current.system;
    const lastIso = sys.lastMaintenanceDate ? toISODate(sys.lastMaintenanceDate) : null;
    const nextIso = sys.nextMaintenanceDate ? toISODate(sys.nextMaintenanceDate) : null;
    const newNext = nextDateAfterCompletion(nextIso, dto.executedDate, dto.nextMaintenanceDate);
    const text: Record<string, string | null | undefined> = {};
    for (const f of TEXT_FIELDS) if (dto[f] !== undefined) text[f] = dto[f];
    await this.prisma.$transaction([
      this.prisma.maintenance.update({
        where: { id },
        data: { ...text, status: 'REALIZADO', executedDate: parseDateOnly(dto.executedDate), nextMaintenanceDate: dto.nextMaintenanceDate ? parseDateOnly(dto.nextMaintenanceDate) : null },
      }),
      this.prisma.installedSystem.update({
        where: { id: sys.id },
        data: {
          lastMaintenanceDate: parseDateOnly(!lastIso || dto.executedDate > lastIso ? dto.executedDate : lastIso),
          nextMaintenanceDate: newNext ? parseDateOnly(newNext) : null,
        },
      }),
    ]);
    await cancelPendingFor(this.prisma, { maintenanceId: id }, 'Mantenimiento realizado');
    await this.audit.log({
      actorId: actor.id, action: 'maintenance.completed', entity: 'Maintenance', entityId: id,
      metadata: { executedDate: dto.executedDate, nextMaintenanceDate: dto.nextMaintenanceDate ?? null }, ip,
    });
    return this.get(id, actor);
  }

  async cancel(id: string, dto: CancelMaintenanceDto, { actor, ip }: Ctx) {
    const current = await this.get(id, actor);
    if (!canTransition(current.status, 'CANCELADO')) throw new BadRequestException(`No se puede cancelar desde el estado ${current.status}`);
    const note = `[Cancelado] ${dto.reason}`;
    await this.prisma.maintenance.update({ where: { id }, data: { status: 'CANCELADO', observations: current.observations ? `${current.observations}\n${note}` : note } });
    await cancelPendingFor(this.prisma, { maintenanceId: id }, 'Mantenimiento cancelado');
    await this.audit.log({ actorId: actor.id, action: 'maintenance.cancelled', entity: 'Maintenance', entityId: id, metadata: { reason: dto.reason }, ip });
    return this.get(id, actor);
  }

  /** Reprogramar: el original queda REPROGRAMADO (trazabilidad) y se crea uno nuevo PROGRAMADO enlazado. */
  async reschedule(id: string, dto: RescheduleMaintenanceDto, { actor, ip }: Ctx) {
    const current = await this.get(id, actor);
    if (!canTransition(current.status, 'REPROGRAMADO')) throw new BadRequestException(`No se puede reprogramar desde el estado ${current.status}`);
    const newDate = parseDateOnly(dto.newDate);
    if (dto.newDate < todayLocal()) throw new BadRequestException('La nueva fecha no puede ser anterior a hoy');
    if (dto.newDate === toISODate(current.scheduledDate)) throw new BadRequestException('La nueva fecha debe ser distinta a la actual');
    const note = `[Reprogramado a ${dto.newDate}] ${dto.reason}`;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.maintenance.update({ where: { id }, data: { status: 'REPROGRAMADO', observations: current.observations ? `${current.observations}\n${note}` : note } });
      return tx.maintenance.create({
        data: {
          systemId: current.system.id, typeId: current.type.id, scheduledDate: newDate, description: current.description,
          rescheduledFromId: id, technicians: { create: current.technicians.map((t) => ({ technicianId: t.id })) },
        },
      });
    });
    await cancelPendingFor(this.prisma, { maintenanceId: id }, 'Mantenimiento reprogramado');
    await this.audit.log({ actorId: actor.id, action: 'maintenance.rescheduled', entity: 'Maintenance', entityId: id, metadata: { newDate: dto.newDate, newId: created.id, reason: dto.reason }, ip });
    return this.get(created.id, actor);
  }

  /** Eventos para el calendario (rango máximo 366 días). */
  async calendar(q: CalendarQuery, actor: AuthUser) {
    const from = parseDateOnly(q.from);
    const to = parseDateOnly(q.to);
    if (to < from) throw new BadRequestException('El rango de fechas no es válido');
    if ((to.getTime() - from.getTime()) / 86_400_000 > 366) throw new BadRequestException('El rango máximo es de 366 días');
    const today = todayLocal();
    const rows = await this.prisma.maintenance.findMany({
      where: { AND: [this.scope(actor), { scheduledDate: { gte: from, lte: to } }, ...this.filters(q, today)] },
      include, orderBy: { scheduledDate: 'asc' }, take: 2000,
    });
    return rows.map((r) => {
      const s = this.shape(r, today);
      return {
        id: s.id, kind: 'MAINTENANCE' as const, date: toISODate(s.scheduledDate), status: s.status, overdue: s.overdue,
        title: `${s.type.name} · ${s.system.installation.client.commercialName}`,
        client: s.system.installation.client.commercialName, installation: s.system.installation.name,
        category: s.system.category.name, type: s.type.name, technicians: s.technicians.map((t) => t.name),
      };
    });
  }

  /** Indicadores para el dashboard (respetan el alcance del rol). */
  async summary(actor: AuthUser, yearOverride?: number) {
    const today = todayLocal();
    const scope = this.scope(actor);
    const todayD = parseDateOnly(today);
    const year = yearOverride ?? Number(today.slice(0, 4));
    const [scheduled, upcoming, overdue, yearRows, nextVisits] = await Promise.all([
      this.prisma.maintenance.count({ where: { AND: [scope, { status: { in: OPEN } }] } }),
      this.prisma.maintenance.count({ where: { AND: [scope, { status: { in: OPEN }, scheduledDate: { gte: todayD, lte: parseDateOnly(addDays(today, UPCOMING_DAYS)) } }] } }),
      this.prisma.maintenance.count({ where: { AND: [scope, { status: { in: OPEN }, scheduledDate: { lt: todayD } }] } }),
      this.prisma.maintenance.findMany({
        where: { AND: [scope, { OR: [
          { scheduledDate: { gte: parseDateOnly(`${year}-01-01`), lte: parseDateOnly(`${year}-12-31`) } },
          { executedDate: { gte: parseDateOnly(`${year}-01-01`), lte: parseDateOnly(`${year}-12-31`) } },
        ] }] },
        select: { scheduledDate: true, executedDate: true, status: true },
      }),
      this.prisma.maintenance.findMany({ where: { AND: [scope, { status: { in: OPEN }, scheduledDate: { gte: todayD } }] }, include, orderBy: { scheduledDate: 'asc' }, take: 5 }),
    ]);
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, scheduled: 0, done: 0 }));
    // "scheduled": abiertos por fecha programada; "done": realizados por fecha de ejecución.
    for (const r of yearRows) {
      if (OPEN.includes(r.status)) {
        const sd = toISODate(r.scheduledDate);
        if (sd.startsWith(String(year))) monthly[Number(sd.slice(5, 7)) - 1].scheduled++;
      } else if (r.status === 'REALIZADO' && r.executedDate) {
        const ed = toISODate(r.executedDate);
        if (ed.startsWith(String(year))) monthly[Number(ed.slice(5, 7)) - 1].done++;
      }
    }
    return { scheduled, upcoming, overdue, monthly, year, nextVisits: nextVisits.map((r) => this.shape(r, today)) };
  }

  // ---- helpers ----
  private async transition(id: string, to: MaintenanceStatus, actor: AuthUser) {
    const current = await this.get(id, actor);
    if (!canTransition(current.status, to)) throw new BadRequestException(`No se puede pasar de ${current.status} a ${to}`);
    await this.prisma.maintenance.update({ where: { id }, data: { status: to } });
  }

  private async assertType(id: string) {
    const t = await this.prisma.maintenanceType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de mantenimiento no encontrado');
    if (!t.active) throw new BadRequestException('El tipo de mantenimiento está inactivo');
  }

  private async assertTechnicians(ids?: string[]) {
    if (!ids?.length) return;
    const found = await this.prisma.technician.count({ where: { id: { in: ids }, status: 'ACTIVE' } });
    if (found !== ids.length) throw new BadRequestException('Alguno de los técnicos no existe o está inactivo');
  }
}
