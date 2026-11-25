import { MaintenanceStatus, Priority } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PageQuery, trim, trimOrNull } from '../../common/helpers';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'La fecha debe tener formato AAAA-MM-DD';
const opt = (...d: PropertyDecorator[]) => (t: object, k: string | symbol) => {
  [IsOptional(), trimOrNull(), ValidateIf((_: unknown, v: unknown) => v != null), ...d].forEach((f) => f(t, k));
};

class FollowUpFields {
  @opt(IsUUID()) installationId?: string | null;
  @opt(IsUUID()) systemId?: string | null;
  @opt(IsUUID()) maintenanceId?: string | null;
  @opt(IsString(), MaxLength(4000)) description?: string | null;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @opt(IsUUID()) responsibleId?: string | null;
  @opt(Matches(DATE_RE, { message: DATE_MSG })) targetDate?: string | null;
  @opt(IsString(), MaxLength(1000)) nextAction?: string | null;
  @opt(IsString(), MaxLength(4000)) observations?: string | null;
  @IsOptional() @IsBoolean() remindersEnabled?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) technicianIds?: string[];
}

export class CreateFollowUpDto extends FollowUpFields {
  @IsUUID() clientId: string;
  @trim() @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsUUID() typeId: string;
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) startDate?: string;
}

export class UpdateFollowUpDto extends FollowUpFields {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) startDate?: string;
}

export class ChangeStatusDto {
  @IsUUID() statusId: string;
  @opt(IsString(), MaxLength(2000)) comment?: string | null;
}

export class ListFollowUpsQuery extends PageQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() statusId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** open = sin cerrar; closed = finalizados/cancelados; overdue = abiertos con fecha objetivo vencida; upcoming = vencen en 30 días */
  @IsOptional() @IsIn(['open', 'closed', 'overdue', 'upcoming']) state?: 'open' | 'closed' | 'overdue' | 'upcoming';
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
}

export class CreateStatusDto {
  @trim() @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateStatusDto {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---- Actividades ----
export class CreateActivityDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() installationId?: string;
  @IsOptional() @IsUUID() followUpId?: string;
  @IsOptional() @IsUUID() maintenanceId?: string;
  @IsUUID() typeId: string;
  @trim() @IsString() @MinLength(2) @MaxLength(2000) description: string;
  /** Fecha y hora de la actividad (ISO 8601). Por defecto, ahora. */
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(2000) description?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class ListActivitiesQuery extends PageQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() installationId?: string;
  @IsOptional() @IsUUID() followUpId?: string;
  @IsOptional() @IsUUID() maintenanceId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) from?: string;
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) to?: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
}

export class FollowUpCalendarQuery {
  @Matches(DATE_RE, { message: DATE_MSG }) from: string;
  @Matches(DATE_RE, { message: DATE_MSG }) to: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(MaintenanceStatus) status?: MaintenanceStatus;
  @IsOptional() @IsIn(['maintenance', 'followup']) kind?: 'maintenance' | 'followup';
}
