import { MaintenanceStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PageQuery, trim, trimOrNull } from '../../common/helpers';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'La fecha debe tener formato AAAA-MM-DD';
const opt = (...d: PropertyDecorator[]) => (t: object, k: string | symbol) => {
  [IsOptional(), trimOrNull(), ValidateIf((_: unknown, v: unknown) => v != null), ...d].forEach((f) => f(t, k));
};

class TextFields {
  @opt(IsString(), MaxLength(4000)) description?: string | null;
  @opt(IsString(), MaxLength(4000)) observations?: string | null;
  @opt(IsString(), MaxLength(4000)) recommendations?: string | null;
  @opt(IsString(), MaxLength(4000)) materials?: string | null;
  @opt(IsString(), MaxLength(4000)) result?: string | null;
}

export class CreateMaintenanceDto extends TextFields {
  @IsUUID() systemId: string;
  @IsUUID() typeId: string;
  @Matches(DATE_RE, { message: DATE_MSG }) scheduledDate: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) technicianIds?: string[];
}

export class UpdateMaintenanceDto extends TextFields {
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) scheduledDate?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) technicianIds?: string[];
}

export class CompleteMaintenanceDto extends TextFields {
  @Matches(DATE_RE, { message: DATE_MSG }) executedDate: string;
  /** Fecha del siguiente mantenimiento, definida por el usuario (no se calcula). */
  @opt(Matches(DATE_RE, { message: DATE_MSG })) nextMaintenanceDate?: string | null;
}

export class CancelMaintenanceDto {
  @trim() @IsString() @MaxLength(1000) reason: string;
}

export class RescheduleMaintenanceDto {
  @Matches(DATE_RE, { message: DATE_MSG }) newDate: string;
  @trim() @IsString() @MaxLength(1000) reason: string;
}

export class SetStatusDto {
  @IsIn(['PROGRAMADO', 'PENDIENTE']) status: 'PROGRAMADO' | 'PENDIENTE';
}

export class ListMaintenancesQuery extends PageQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() systemId?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(MaintenanceStatus) status?: MaintenanceStatus;
  /** overdue = vencidos; upcoming = próximos 30 días; open = sin terminar */
  @IsOptional() @IsIn(['overdue', 'upcoming', 'open']) due?: 'overdue' | 'upcoming' | 'open';
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) from?: string;
  @IsOptional() @Matches(DATE_RE, { message: DATE_MSG }) to?: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
}

export class CalendarQuery {
  @Matches(DATE_RE, { message: DATE_MSG }) from: string;
  @Matches(DATE_RE, { message: DATE_MSG }) to: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(MaintenanceStatus) status?: MaintenanceStatus;
}
