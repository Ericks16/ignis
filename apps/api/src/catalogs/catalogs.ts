import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { trim, trimOrNull, definedKeys } from '../common/helpers';
import { PrismaService } from '../prisma/prisma.service';

export class CreateCatalogItemDto {
  @trim() @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(300) description?: string | null;
  /** Solo tipos de dispositivo. */
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @Matches(/^[A-Z0-9_]{1,30}$/, { message: 'El código solo admite mayúsculas, números y guion bajo' }) code?: string | null;
  /** Solo categorías de sistema. */
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateCatalogItemDto {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @Matches(/^[A-Z0-9_]{1,30}$/, { message: 'El código solo admite mayúsculas, números y guion bajo' }) code?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

type Kind = 'system-categories' | 'equipment-types' | 'maintenance-types' | 'follow-up-types' | 'activity-types';
const KINDS: Kind[] = ['system-categories', 'equipment-types', 'maintenance-types', 'follow-up-types', 'activity-types'];

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private delegate(kind: string): any {
    if (!KINDS.includes(kind as Kind)) throw new NotFoundException('Catálogo no encontrado');
    if (kind === 'system-categories') return this.prisma.systemCategory;
    if (kind === 'maintenance-types') return this.prisma.maintenanceType;
    if (kind === 'follow-up-types') return this.prisma.followUpType;
    if (kind === 'activity-types') return this.prisma.activityType;
    return this.prisma.equipmentType;
  }

  /** Cada catálogo admite solo algunos campos opcionales. */
  private assertFields(kind: string, dto: { code?: unknown; sortOrder?: unknown }) {
    if (kind !== 'equipment-types' && dto.code !== undefined) throw new BadRequestException('Este catálogo no usa código');
    if (kind !== 'system-categories' && dto.sortOrder !== undefined) throw new BadRequestException('Este catálogo no usa orden');
  }

  list(kind: string, includeInactive: boolean) {
    const d = this.delegate(kind);
    return d.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: kind === 'system-categories' ? [{ sortOrder: 'asc' }, { name: 'asc' }] : { name: 'asc' },
    });
  }

  async create(kind: string, dto: CreateCatalogItemDto, actor: AuthUser, ip?: string) {
    const d = this.delegate(kind);
    this.assertFields(kind, dto);
    await this.assertUnique(kind, dto.name);
    const item = await d.create({ data: dto }).catch(() => { throw new ConflictException('El código ya está en uso'); });
    await this.audit.log({ actorId: actor.id, action: 'catalog.created', entity: kind, entityId: item.id, metadata: { name: item.name }, ip });
    return item;
  }

  async update(kind: string, id: string, dto: UpdateCatalogItemDto, actor: AuthUser, ip?: string) {
    const d = this.delegate(kind);
    const found = await d.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Elemento no encontrado');
    this.assertFields(kind, dto);
    if (dto.name && dto.name !== found.name) await this.assertUnique(kind, dto.name, id);
    const item = await d.update({ where: { id }, data: dto }).catch(() => { throw new ConflictException('El código ya está en uso'); });
    await this.audit.log({ actorId: actor.id, action: 'catalog.updated', entity: kind, entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return item;
  }

  private async assertUnique(kind: string, name: string, excludeId?: string) {
    const dup = await this.delegate(kind).findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`Ya existe "${dup.name}" en este catálogo`);
  }
}

/** Catálogos administrables. Lectura: todos los roles; escritura: solo Administrador. */
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly svc: CatalogsService) {}

  @Get(':kind')
  list(@Param('kind') kind: string, @Query('includeInactive') inc?: string) { return this.svc.list(kind, inc === 'true'); }

  @Roles(Role.ADMIN) @Post(':kind')
  create(@Param('kind') kind: string, @Body() dto: CreateCatalogItemDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.create(kind, dto, u, req.ip);
  }

  @Roles(Role.ADMIN) @Patch(':kind/:id')
  update(@Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogItemDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(kind, id, dto, u, req.ip);
  }
}
