import { Injectable } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuditService } from '../audit/audit.service';
import { definedKeys, definedOnly } from '../common/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_REMINDER_CONFIG, ReminderConfig } from './reminders.policy';

const KEY = 'reminders';
const lower = Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)) : value));

export class UpdateReminderSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(12) leadMonths?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) repeatDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) maxAttempts?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) @Min(1, { each: true }) @Max(10_080, { each: true }) retryMinutes?: number[];
  @IsOptional() @IsInt() @Min(0) @Max(23) sendHourLocal?: number;
  /** Correos internos (departamento, administración…) que reciben todos los recordatorios. */
  @IsOptional() @lower @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsEmail({}, { each: true }) internalRecipients?: string[];
  /** Si está activo, los contactos del cliente marcados con «recibe recordatorios» también reciben el correo. */
  @IsOptional() @IsBoolean() includeClientContacts?: boolean;
}

/** Configuración de recordatorios, editable por el Administrador (se guarda en la tabla Setting). */
@Injectable()
export class ReminderSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async get(): Promise<ReminderConfig> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    return { ...DEFAULT_REMINDER_CONFIG, ...((row?.value as Partial<ReminderConfig> | undefined) ?? {}) };
  }

  async update(dto: UpdateReminderSettingsDto, actorId: string, ip?: string): Promise<ReminderConfig> {
    const next = { ...(await this.get()), ...definedOnly(dto) };
    await this.prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as object }, update: { value: next as object } });
    await this.audit.log({ actorId, action: 'settings.reminders_updated', entity: 'Setting', entityId: KEY, metadata: { fields: definedKeys(dto) }, ip });
    return next;
  }
}
