import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { EntityStatus, Prisma, Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { parseDateOnly } from '../common/dates';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PageQuery, pageArgs, trim, trimOrNull, definedKeys } from '../common/helpers';
import { PrismaService } from '../prisma/prisma.service';

const opt = (...d: PropertyDecorator[]) => (t: object, k: string | symbol) => {
  [IsOptional(), trimOrNull(), ValidateIf((_: unknown, v: unknown) => v != null), ...d].forEach((f) => f(t, k));
};

class TechnicianFields {
  @opt(IsEmail(), MaxLength(254)) email?: string | null;
  @opt(IsString(), MaxLength(40)) phone?: string | null;
  @opt(IsString(), MaxLength(80)) position?: string | null;
  @opt(IsString(), MaxLength(80)) specialty?: string | null;
  @opt(Matches(/^[A-Za-z]{1,6}$/, { message: 'Las iniciales deben ser de 1 a 6 letras' })) initials?: string | null;
  @opt(Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato AAAA-MM-DD' })) hireDate?: string | null;
  @opt(IsString(), MaxLength(2000)) notes?: string | null;
  /** Vincula la ficha con un usuario del sistema (necesario para que un Técnico vea sus trabajos). */
  @opt(IsUUID()) userId?: string | null;
}

export class CreateTechnicianDto extends TechnicianFields {
  @trim() @IsString() @MinLength(2) @MaxLength(120) name: string;
}

export class UpdateTechnicianDto extends TechnicianFields {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(120) name?: string;
}

export class ListTechniciansQuery extends PageQuery {
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(EntityStatus) status?: EntityStatus;
}

type Ctx = { actor: AuthUser; ip?: string };

@Injectable()
export class TechniciansService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: ListTechniciansQuery) {
    const where: Prisma.TechnicianWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { specialty: { contains: q.search, mode: 'insensitive' } },
        { initials: { equals: q.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const { page, pageSize, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.technician.findMany({ where, orderBy: { name: 'asc' }, skip, take, include: { user: { select: { id: true, email: true } } } }),
      this.prisma.technician.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Lista corta de técnicos activos para formularios y filtros. */
  options() {
    return this.prisma.technician.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, initials: true }, orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const t = await this.prisma.technician.findUnique({ where: { id }, include: { user: { select: { id: true, email: true } } } });
    if (!t) throw new NotFoundException('Técnico no encontrado');
    return t;
  }

  async create(dto: CreateTechnicianDto, { actor, ip }: Ctx) {
    await this.assertUser(dto.userId);
    const t = await this.prisma.technician.create({ data: this.data(dto) as Prisma.TechnicianUncheckedCreateInput });
    await this.audit.log({ actorId: actor.id, action: 'technician.created', entity: 'Technician', entityId: t.id, ip });
    return t;
  }

  async update(id: string, dto: UpdateTechnicianDto, { actor, ip }: Ctx) {
    await this.get(id);
    await this.assertUser(dto.userId, id);
    const t = await this.prisma.technician.update({ where: { id }, data: this.data(dto) as Prisma.TechnicianUncheckedUpdateInput });
    await this.audit.log({ actorId: actor.id, action: 'technician.updated', entity: 'Technician', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return t;
  }

  async setStatus(id: string, status: EntityStatus, { actor, ip }: Ctx) {
    await this.get(id);
    const t = await this.prisma.technician.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId: actor.id, action: status === 'ACTIVE' ? 'technician.reactivated' : 'technician.deactivated', entity: 'Technician', entityId: id, ip });
    return t;
  }

  private data(dto: object) {
    const d: Record<string, unknown> = { ...dto };
    if (typeof d.hireDate === 'string') d.hireDate = parseDateOnly(d.hireDate);
    if (typeof d.initials === 'string') d.initials = d.initials.toUpperCase();
    return d;
  }

  private async assertUser(userId?: string | null, selfId?: string) {
    if (!userId) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { technician: true } });
    if (!u || !u.active) throw new BadRequestException('El usuario no existe o está inactivo');
    if (u.technician && u.technician.id !== selfId) throw new ConflictException('Ese usuario ya está vinculado a otro técnico');
  }
}

const WRITERS = [Role.ADMIN, Role.OPERATIVO];
const ctx = (actor: AuthUser, req: Request) => ({ actor, ip: req.ip });

@Controller('technicians')
export class TechniciansController {
  constructor(private readonly svc: TechniciansService) {}

  // Orden de rutas: 'options' antes de ':id'.
  @Get('options') options() { return this.svc.options(); }
  @Get() list(@Query() q: ListTechniciansQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Roles(...WRITERS) @Post()
  create(@Body() dto: CreateTechnicianDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.create(dto, ctx(u, req)); }

  @Roles(...WRITERS) @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTechnicianDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.update(id, dto, ctx(u, req)); }

  @Roles(...WRITERS) @Post(':id/deactivate') @HttpCode(200)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.setStatus(id, 'INACTIVE', ctx(u, req)); }

  @Roles(...WRITERS) @Post(':id/reactivate') @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.setStatus(id, 'ACTIVE', ctx(u, req)); }
}
