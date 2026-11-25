import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { pageArgs, definedKeys } from '../common/helpers';
import { CreateInstallationDto, ListInstallationsQuery, UpdateInstallationDto } from './dto/installations.dto';

type Ctx = { actor: AuthUser; ip?: string };

@Injectable()
export class InstallationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: ListInstallationsQuery) {
    const where: Prisma.InstallationWhereInput = {
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { address: { contains: q.search, mode: 'insensitive' } },
            { client: { commercialName: { contains: q.search, mode: 'insensitive' } } },
          ] }
        : {}),
    };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.installation.findMany({
        where, skip, take, orderBy: [{ client: { commercialName: 'asc' } }, { name: 'asc' }],
        include: { client: { select: { id: true, commercialName: true, status: true } } },
      }),
      this.prisma.installation.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const i = await this.prisma.installation.findUnique({ where: { id }, include: { client: { select: { id: true, commercialName: true, status: true } } } });
    if (!i) throw new NotFoundException('Instalación no encontrada');
    return i;
  }

  async create(dto: CreateInstallationDto, { actor, ip }: Ctx) {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (client.status !== 'ACTIVE') throw new BadRequestException('No se pueden agregar instalaciones a un cliente inactivo');
    const inst = await this.prisma.installation.create({ data: dto });
    await this.audit.log({ actorId: actor.id, action: 'installation.created', entity: 'Installation', entityId: inst.id, metadata: { name: inst.name }, ip });
    return inst;
  }

  async update(id: string, dto: UpdateInstallationDto, { actor, ip }: Ctx) {
    await this.get(id);
    const inst = await this.prisma.installation.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'installation.updated', entity: 'Installation', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return inst;
  }

  async setStatus(id: string, status: EntityStatus, { actor, ip }: Ctx) {
    const current = await this.get(id);
    if (status === 'ACTIVE' && current.client.status !== 'ACTIVE') throw new BadRequestException('Reactive primero al cliente');
    const inst = await this.prisma.installation.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId: actor.id, action: status === 'ACTIVE' ? 'installation.reactivated' : 'installation.deactivated', entity: 'Installation', entityId: id, ip });
    return inst;
  }
}
