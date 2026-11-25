import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { pageArgs, definedKeys } from '../common/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { activityScope } from '../common/scopes';
import { CreateActivityDto, ListActivitiesQuery, UpdateActivityDto } from './dto/follow-ups.dto';

type Ctx = { actor: AuthUser; ip?: string };

const include = {
  type: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  client: { select: { id: true, commercialName: true } },
  followUp: { select: { id: true, title: true } },
  maintenance: { select: { id: true, scheduledDate: true } },
} satisfies Prisma.ActivityInclude;

/** Fecha local de Guayaquil (UTC-5, sin horario de verano) como instante UTC. */
const startOfDayEC = (iso: string) => new Date(`${iso}T00:00:00-05:00`);
const endOfDayEC = (iso: string) => new Date(`${iso}T23:59:59.999-05:00`);

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Técnico: actividades propias o vinculadas a sus seguimientos y mantenimientos asignados. */
  private scope(actor: AuthUser): Prisma.ActivityWhereInput {
    return activityScope(actor);
  }

  async list(q: ListActivitiesQuery, actor: AuthUser) {
    const f: Prisma.ActivityWhereInput[] = [this.scope(actor)];
    if (q.clientId) f.push({ clientId: q.clientId });
    if (q.installationId) f.push({ installationId: q.installationId });
    if (q.followUpId) f.push({ followUpId: q.followUpId });
    if (q.maintenanceId) f.push({ maintenanceId: q.maintenanceId });
    if (q.typeId) f.push({ typeId: q.typeId });
    if (q.userId) f.push({ userId: q.userId });
    if (q.from) f.push({ occurredAt: { gte: startOfDayEC(q.from) } });
    if (q.to) f.push({ occurredAt: { lte: endOfDayEC(q.to) } });
    if (q.search) f.push({ description: { contains: q.search, mode: 'insensitive' } });
    const where: Prisma.ActivityWhereInput = { AND: f };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({ where, include, skip, take, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async create(dto: CreateActivityDto, { actor, ip }: Ctx) {
    if (!dto.clientId && !dto.installationId && !dto.followUpId && !dto.maintenanceId) throw new BadRequestException('Indique el cliente, seguimiento o mantenimiento de la actividad');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('La fecha de la actividad no puede ser futura');
    await this.assertType(dto.typeId);

    let clientId = dto.clientId ?? null;
    let installationId = dto.installationId ?? null;
    if (dto.followUpId) {
      const fu = await this.prisma.followUp.findFirst({
        where: { id: dto.followUpId, ...(actor.role === Role.TECNICO ? { OR: [{ responsibleId: actor.id }, { technicians: { some: { technician: { userId: actor.id } } } }] } : {}) },
      });
      if (!fu) throw new NotFoundException('Seguimiento no encontrado');
      if (clientId && clientId !== fu.clientId) throw new BadRequestException('El seguimiento no pertenece al cliente indicado');
      clientId = fu.clientId;
    }
    if (dto.maintenanceId) {
      const m = await this.prisma.maintenance.findFirst({
        where: { id: dto.maintenanceId, ...(actor.role === Role.TECNICO ? { technicians: { some: { technician: { userId: actor.id } } } } : {}) },
        include: { system: { include: { installation: true } } },
      });
      if (!m) throw new NotFoundException('Mantenimiento no encontrado');
      if (clientId && clientId !== m.system.installation.clientId) throw new BadRequestException('El mantenimiento no pertenece al cliente indicado');
      clientId = m.system.installation.clientId;
      installationId = installationId ?? m.system.installationId;
    }
    if (installationId) {
      const i = await this.prisma.installation.findUnique({ where: { id: installationId } });
      if (!i) throw new NotFoundException('Instalación no encontrada');
      if (clientId && clientId !== i.clientId) throw new BadRequestException('La instalación no pertenece al cliente indicado');
      clientId = i.clientId;
    }
    if (clientId && !(await this.prisma.client.findUnique({ where: { id: clientId } }))) throw new NotFoundException('Cliente no encontrado');
    if (actor.role === Role.TECNICO && !dto.followUpId && !dto.maintenanceId) throw new ForbiddenException('Un técnico solo registra actividades de sus seguimientos o mantenimientos asignados');

    const a = await this.prisma.activity.create({
      data: { clientId, installationId, followUpId: dto.followUpId, maintenanceId: dto.maintenanceId, typeId: dto.typeId, description: dto.description, occurredAt, userId: actor.id },
      include,
    });
    await this.audit.log({ actorId: actor.id, action: 'activity.created', entity: 'Activity', entityId: a.id, ip });
    return a;
  }

  /** Solo el autor o Administrador/Operativo; el historial no se borra. */
  async update(id: string, dto: UpdateActivityDto, { actor, ip }: Ctx) {
    const a = await this.prisma.activity.findFirst({ where: { AND: [{ id }, this.scope(actor)] } });
    if (!a) throw new NotFoundException('Actividad no encontrada');
    if (actor.role === Role.TECNICO && a.userId !== actor.id) throw new ForbiddenException('Solo puede modificar sus propias actividades');
    if (dto.typeId && dto.typeId !== a.typeId) await this.assertType(dto.typeId);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : undefined;
    if (occurredAt && occurredAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('La fecha de la actividad no puede ser futura');
    const updated = await this.prisma.activity.update({ where: { id }, data: { ...dto, occurredAt }, include });
    await this.audit.log({ actorId: actor.id, action: 'activity.updated', entity: 'Activity', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return updated;
  }

  private async assertType(id: string) {
    const t = await this.prisma.activityType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de actividad no encontrado');
    if (!t.active) throw new BadRequestException('El tipo de actividad está inactivo');
  }
}
