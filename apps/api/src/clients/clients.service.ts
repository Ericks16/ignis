import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { normalizeName, pageArgs, definedKeys } from '../common/helpers';
import { CreateClientDto, CreateContactDto, ListClientsQuery, UpdateClientDto, UpdateContactDto } from './dto/clients.dto';

type Ctx = { actor: AuthUser; ip?: string };

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: ListClientsQuery) {
    const where: Prisma.ClientWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.search
        ? { OR: [
            { commercialName: { contains: q.search, mode: 'insensitive' } },
            { legalName: { contains: q.search, mode: 'insensitive' } },
            { ruc: { contains: q.search } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ] }
        : {}),
    };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({ where, orderBy: { commercialName: 'asc' }, skip, take, include: { _count: { select: { installations: true } } } }),
      this.prisma.client.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const c = await this.prisma.client.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ active: 'desc' }, { name: 'asc' }] },
        _count: { select: { installations: true } },
      },
    });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return c;
  }

  async create(dto: CreateClientDto, { actor, ip }: Ctx) {
    const { allowDuplicate, ...data } = dto;
    const normalizedName = normalizeName(data.commercialName);
    await this.assertNoDuplicate(normalizedName, undefined, allowDuplicate);
    const client = await this.prisma.client.create({ data: { ...data, normalizedName } }).catch(this.mapUnique);
    await this.audit.log({ actorId: actor.id, action: 'client.created', entity: 'Client', entityId: client.id, ip });
    return client;
  }

  async update(id: string, dto: UpdateClientDto, { actor, ip }: Ctx) {
    const current = await this.get(id);
    const { allowDuplicate, ...data } = dto;
    const extra: Prisma.ClientUpdateInput = {};
    if (data.commercialName && data.commercialName !== current.commercialName) {
      extra.normalizedName = normalizeName(data.commercialName);
      await this.assertNoDuplicate(extra.normalizedName as string, id, allowDuplicate);
    }
    const client = await this.prisma.client.update({ where: { id }, data: { ...data, ...extra } }).catch(this.mapUnique);
    await this.audit.log({ actorId: actor.id, action: 'client.updated', entity: 'Client', entityId: id, metadata: { fields: Object.keys(data) }, ip });
    return client;
  }

  /** Eliminación lógica: los clientes con historial nunca se borran físicamente. */
  async setStatus(id: string, status: EntityStatus, { actor, ip }: Ctx) {
    await this.get(id);
    const client = await this.prisma.client.update({ where: { id }, data: { status } });
    await this.audit.log({
      actorId: actor.id, action: status === 'ACTIVE' ? 'client.reactivated' : 'client.deactivated', entity: 'Client', entityId: id, ip,
    });
    return client;
  }

  async history(id: string) {
    await this.get(id);
    const contactIds = (await this.prisma.clientContact.findMany({ where: { clientId: id }, select: { id: true } })).map((c) => c.id);
    const installationIds = (await this.prisma.installation.findMany({ where: { clientId: id }, select: { id: true } })).map((i) => i.id);
    const logs = await this.prisma.auditLog.findMany({
      where: { OR: [
        { entity: 'Client', entityId: id },
        { entity: 'ClientContact', entityId: { in: contactIds } },
        { entity: 'Installation', entityId: { in: installationIds } },
      ] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { name: true } } },
    });
    return logs.map((l) => ({ id: l.id, action: l.action, entity: l.entity, metadata: l.metadata, actor: l.actor?.name ?? null, createdAt: l.createdAt }));
  }

  // ---- Contactos ----
  async addContact(clientId: string, dto: CreateContactDto, { actor, ip }: Ctx) {
    await this.get(clientId);
    const contact = await this.prisma.clientContact.create({ data: { ...dto, clientId } });
    await this.audit.log({ actorId: actor.id, action: 'contact.created', entity: 'ClientContact', entityId: contact.id, ip });
    return contact;
  }

  async updateContact(id: string, dto: UpdateContactDto, { actor, ip }: Ctx) {
    const found = await this.prisma.clientContact.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Contacto no encontrado');
    const contact = await this.prisma.clientContact.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'contact.updated', entity: 'ClientContact', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return contact;
  }

  private async assertNoDuplicate(normalizedName: string, excludeId?: string, allow?: boolean) {
    if (allow) return;
    const dup = await this.prisma.client.findFirst({ where: { normalizedName, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { commercialName: true } });
    if (dup) throw new ConflictException(`Ya existe un cliente con nombre equivalente: "${dup.commercialName}". Si es otro cliente, confirme la creación.`);
  }

  private mapUnique = (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ya existe un cliente con ese RUC');
    throw e;
  };
}
