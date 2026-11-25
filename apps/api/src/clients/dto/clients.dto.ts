import { EntityStatus } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PageQuery, trim, trimOrNull } from '../../common/helpers';

const RUC_MSG = 'El RUC/cédula debe tener 10 o 13 dígitos';
const RUC_RE = /^\d{10}(\d{3})?$/;

export class CreateClientDto {
  @trim() @IsString() @MinLength(2) @MaxLength(150) commercialName: string;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @Matches(RUC_RE, { message: RUC_MSG }) ruc?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(250) address?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) province?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(2000) notes?: string | null;
  /** Confirma crear aunque exista otro cliente con nombre equivalente. */
  @IsOptional() @IsBoolean() allowDuplicate?: boolean;
}

export class UpdateClientDto {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(150) commercialName?: string;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @Matches(RUC_RE, { message: RUC_MSG }) ruc?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(250) address?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) province?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() allowDuplicate?: boolean;
}

export class ListClientsQuery extends PageQuery {
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(EntityStatus) status?: EntityStatus;
  @IsOptional() @trim() @IsString() @MaxLength(80) city?: string;
}

export class CreateContactDto {
  @trim() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) position?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @IsBoolean() receivesNotifications?: boolean;
}

export class UpdateContactDto {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) position?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @IsBoolean() receivesNotifications?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}
