import { Role } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser } from '../common/decorators';
import { trim } from '../common/helpers';

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type ColumnType = 'text' | 'number' | 'date' | 'datetime';
export interface ReportColumn { key: string; label: string; type: ColumnType; width?: number }

/** Filtros que puede declarar un reporte (la pantalla muestra solo los que aplican). */
export type FilterKey = 'dateRange' | 'client' | 'technician' | 'category' | 'maintenanceType' | 'followUpType' | 'followUpStatus' | 'priority' | 'responsible' | 'city' | 'entityStatus' | 'search' | 'days' | 'maintenanceStatus' | 'activityType';

export interface ReportFilters {
  from?: string; to?: string; clientId?: string; technicianId?: string; categoryId?: string; typeId?: string; statusId?: string; priority?: string; responsibleId?: string;
  city?: string; status?: string; search?: string; days?: number;
}

export interface ReportOutput { columns: ReportColumn[]; rows: Row[]; totals?: Row; note?: string }

export interface ReportContext { today: string; actor: AuthUser }

export interface ReportMeta {
  key: string; title: string; description: string; group: string; filters: FilterKey[]; dateLabel?: string; roles: Role[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parámetros de consulta de los reportes (los comunes; cada reporte usa solo los suyos). */
export class ReportQuery {
  @IsOptional() @Matches(DATE_RE, { message: 'La fecha debe tener formato AAAA-MM-DD' }) from?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'La fecha debe tener formato AAAA-MM-DD' }) to?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() statusId?: string;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsOptional() @IsIn(['BAJA', 'MEDIA', 'ALTA', 'URGENTE']) priority?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'PROGRAMADO', 'PENDIENTE', 'EN_PROCESO']) status?: string;
  @IsOptional() @trim() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class ExportQuery extends ReportQuery {
  @IsIn(['xlsx', 'csv', 'pdf']) format: 'xlsx' | 'csv' | 'pdf';
}
