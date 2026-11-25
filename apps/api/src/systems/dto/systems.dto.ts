import { EntityStatus, OperationalStatus, SystemRelation } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PageQuery, trim, trimOrNull } from '../../common/helpers';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'La fecha debe tener formato AAAA-MM-DD';
const opt = () => [IsOptional(), trimOrNull(), ValidateIf((_: unknown, v: unknown) => v != null)];
const applyAll = (...d: PropertyDecorator[]) => (t: object, k: string | symbol) => d.forEach((f) => f(t, k));

class SystemFields {
  @applyAll(...opt(), IsUUID()) responsibleId?: string | null;
  @applyAll(...opt(), IsString(), MaxLength(80)) brand?: string | null;
  @applyAll(...opt(), IsString(), MaxLength(80)) model?: string | null;
  @applyAll(...opt(), IsString(), MaxLength(80)) serialNumber?: string | null;
  @applyAll(...opt(), Matches(DATE_RE, { message: DATE_MSG })) installedAt?: string | null;
  @applyAll(...opt(), IsString(), MaxLength(200)) location?: string | null;
  @IsOptional() @IsEnum(OperationalStatus) operationalStatus?: OperationalStatus;
  @IsOptional() @ValidateIf((_, v) => v != null) @IsEnum(SystemRelation) relation?: SystemRelation | null;
  @applyAll(...opt(), IsString(), MaxLength(2000)) description?: string | null;
  @applyAll(...opt(), IsString(), MaxLength(2000)) notes?: string | null;
  @applyAll(...opt(), Matches(DATE_RE, { message: DATE_MSG })) lastMaintenanceDate?: string | null;
  @applyAll(...opt(), Matches(DATE_RE, { message: DATE_MSG })) nextMaintenanceDate?: string | null;
  @IsOptional() @ValidateIf((_, v) => v != null) @IsObject() extra?: Record<string, unknown> | null;
}

export class CreateSystemDto extends SystemFields {
  @IsUUID() installationId: string;
  @IsUUID() categoryId: string;
}

export class UpdateSystemDto extends SystemFields {
  @IsOptional() @IsUUID() categoryId?: string;
}

export class ListSystemsQuery extends PageQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() installationId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(EntityStatus) status?: EntityStatus;
  @IsOptional() @IsEnum(OperationalStatus) operationalStatus?: OperationalStatus;
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
}

export class CreateEquipmentDto {
  @IsUUID() typeId: string;
  @IsInt() @Min(1) @Max(100000) quantity: number;
  @applyAll(...opt(), IsString(), MaxLength(120)) label?: string | null;
  @IsOptional() @IsEnum(OperationalStatus) status?: OperationalStatus;
  @applyAll(...opt(), IsString(), MaxLength(1000)) notes?: string | null;
}

export class UpdateEquipmentDto {
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) quantity?: number;
  @applyAll(...opt(), IsString(), MaxLength(120)) label?: string | null;
  @IsOptional() @IsEnum(OperationalStatus) status?: OperationalStatus;
  @applyAll(...opt(), IsString(), MaxLength(1000)) notes?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
