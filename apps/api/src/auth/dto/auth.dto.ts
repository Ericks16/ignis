import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,72}$/;
export const PASSWORD_MSG = 'La contraseña debe tener entre 10 y 72 caracteres, con mayúscula, minúscula y número';

export class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(200) currentPassword: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword: string;
}
