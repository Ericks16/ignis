import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { pageArgs, definedKeys } from '../common/helpers';
import { parseDateOnly as toDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEquipmentDto, CreateSystemDto, ListSystemsQuery, UpdateEquipmentDto, UpdateSystemDto } from './dto/systems.dto';

type Ctx = { actor: AuthUser; ip?: string };

const DATE_FIELDS = ['installedAt', 'lastMaintenanceDate', 'nextMaintenanceDate'] as const;

function prepare(dto: object) {
  const data: Record<string, unknown> = { ...dto };
  for (const f of DATE_FIELDS) {
    const v = data[f];
    if (typeof v === 'string') data[f] = toDate(v);
  }
  return data;
}

const systemInclude = {
  category: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
  installation: { select: { id: true, name: true, status: true, clientId: true, client: { select: { id: true, commercialName: true } } } },
  _count: { select: { equipment: { where: { active: true } } } },
} satisfies Prisma.InstalledSystemInclude;

@Injectable()
export class SystemsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: ListSystemsQuery) {
    const where: Prisma.InstalledSystemWhereInput = {
      ...(q.installationId ? { installationId: q.installationId } : {}),
      ...(q.clientId ? { installation: { clientId: q.clientId } } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.operationalStatus ? { operationalStatus: q.operationalStatus } : {}),
      ...(q.search
        ? { OR: [
            { brand: { contains: q.search, mode: 'insensitive' } },
            { model: { contains: q.search, mode: 'insensitive' } },
            { serialNumber: { contains: q.search, mode: 'insensitive' } },
            { location: { contains: q.search, mode: 'insensitive' } },
            { installation: { name: { contains: q.search, mode: 'insensitive' } } },
            { installation: { client: { commercialName: { contains: q.search, mode: 'insensitive' } } } },
          ] }
        : {}),
    };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.installedSystem.findMany({
        where, skip, take, include: systemInclude,
        orderBy: [{ installation: { client: { commercialName: 'asc' } } }, { installation: { name: 'asc' } }, { createdAt: 'asc' }],
      }),
      this.prisma.installedSystem.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const s = await this.prisma.installedSystem.findUnique({
      where: { id },
      include: { ...systemInclude, equipment: { orderBy: [{ active: 'desc' }, { type: { name: 'asc' } }], include: { type: { select: { id: true, name: true, code: true } } } } },
    });
    if (!s) throw new NotFoundException('Sistema no encontrado');
    return s;
  }

  async create(dto: CreateSystemDto, { actor, ip }: Ctx) {
    const inst = await this.prisma.installation.findUnique({ where: { id: dto.installationId }, include: { client: true } });
    if (!inst) throw new NotFoundException('Instalación no encontrada');
    if (inst.status !== 'ACTIVE' || inst.client.status !== 'ACTIVE') throw new BadRequestException('La instalación o el cliente están inactivos');
    await this.assertCategory(dto.categoryId);
    await this.assertResponsible(dto.responsibleId);
    const s = await this.prisma.installedSystem.create({ data: prepare(dto) as Prisma.InstalledSystemUncheckedCreateInput });
    await this.audit.log({ actorId: actor.id, action: 'system.created', entity: 'InstalledSystem', entityId: s.id, ip });
    return s;
  }

  async update(id: string, dto: UpdateSystemDto, { actor, ip }: Ctx) {
    const current = await this.get(id);
    if (dto.categoryId && dto.categoryId !== current.categoryId) await this.assertCategory(dto.categoryId);
    await this.assertResponsible(dto.responsibleId);
    const s = await this.prisma.installedSystem.update({ where: { id }, data: prepare(dto) as Prisma.InstalledSystemUncheckedUpdateInput });
    await this.audit.log({ actorId: actor.id, action: 'system.updated', entity: 'InstalledSystem', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return s;
  }

  async setStatus(id: string, status: EntityStatus, { actor, ip }: Ctx) {
    const current = await this.get(id);
    if (status === 'ACTIVE' && current.installation.status !== 'ACTIVE') throw new BadRequestException('Reactive primero la instalación');
    const s = await this.prisma.installedSystem.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId: actor.id, action: status === 'ACTIVE' ? 'system.reactivated' : 'system.deactivated', entity: 'InstalledSystem', entityId: id, ip });
    return s;
  }

  // ---- Equipos / dispositivos ----
  async addEquipment(systemId: string, dto: CreateEquipmentDto, { actor, ip }: Ctx) {
    const sys = await this.get(systemId);
    if (sys.status !== 'ACTIVE') throw new BadRequestException('El sistema está inactivo');
    await this.assertEquipmentType(dto.typeId);
    const e = await this.prisma.equipment.create({ data: { ...dto, systemId } });
    await this.audit.log({ actorId: actor.id, action: 'equipment.created', entity: 'Equipment', entityId: e.id, metadata: { systemId, quantity: e.quantity }, ip });
    return e;
  }

  async updateEquipment(id: string, dto: UpdateEquipmentDto, { actor, ip }: Ctx) {
    const found = await this.prisma.equipment.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Dispositivo no encontrado');
    if (dto.typeId && dto.typeId !== found.typeId) await this.assertEquipmentType(dto.typeId);
    const e = await this.prisma.equipment.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'equipment.updated', entity: 'Equipment', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return e;
  }

  private async assertCategory(id: string) {
    const c = await this.prisma.systemCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Categoría no encontrada');
    if (!c.active) throw new BadRequestException('La categoría está inactiva');
  }

  private async assertEquipmentType(id: string) {
    const t = await this.prisma.equipmentType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de dispositivo no encontrado');
    if (!t.active) throw new BadRequestException('El tipo de dispositivo está inactivo');
  }

  private async assertResponsible(id?: string | null) {
    if (!id) return;
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !u.active) throw new BadRequestException('El responsable no existe o está inactivo');
  }
}
