import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,72}$/;
export const PASSWORD_MSG = 'La contraseña debe tener entre 10 y 72 caracteres, con mayúscula, minúscula y número';

const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(200) currentPassword: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword: string;
}

/** Solicitud de acceso: la cuenta queda inactiva hasta que un administrador la apruebe. */
export class RegisterDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @Transform(trimLower) @IsEmail() @MaxLength(254) email: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
}

export class ForgotPasswordDto {
  @Transform(trimLower) @IsEmail() @MaxLength(254) email: string;
}

export class ResetPasswordWithTokenDto {
  @IsString() @MinLength(20) @MaxLength(200) token: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword: string;
}
