import { Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PASSWORD_MSG, PASSWORD_RULE } from '../../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail() @MaxLength(254) email: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEnum(Role) role: Role;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
}

export class UpdateUserDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
}

export class ListUsersQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
