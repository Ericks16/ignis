import { EntityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PageQuery, trim, trimOrNull } from '../../common/helpers';

class InstallationFields {
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(60) type?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(250) address?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(80) province?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(120) contactName?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(40) contactPhone?: string | null;
  @IsOptional() @trimOrNull() @ValidateIf((_, v) => v != null) @IsString() @MaxLength(2000) notes?: string | null;
}

export class CreateInstallationDto extends InstallationFields {
  @IsUUID() clientId: string;
  @trim() @IsString() @MinLength(2) @MaxLength(150) name: string;
}

export class UpdateInstallationDto extends InstallationFields {
  @IsOptional() @trim() @IsString() @MinLength(2) @MaxLength(150) name?: string;
}

export class ListInstallationsQuery extends PageQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(EntityStatus) status?: EntityStatus;
}
