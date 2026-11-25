import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordWithTokenDto } from './dto/auth.dto';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { sessionCookieName } from './auth.guards';
import { loadEnv } from '../config/env';

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: loadEnv().NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: () => loadEnv().RATE_LIMIT_LOGIN, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, ttlMs, user } = await this.auth.login(dto.email, dto.password, req.ip, req.headers['user-agent']);
    res.cookie(sessionCookieName(), token, cookieOpts(ttlMs));
    return { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword };
  }

  @Public()
  @Throttle({ default: { limit: () => loadEnv().RATE_LIMIT_LOGIN, ttl: 60_000 } })
  @Post('register')
  @HttpCode(202)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    await this.auth.register(dto.name, dto.email, dto.password, req.ip);
    return { message: 'Solicitud recibida. Un administrador revisará su acceso y le avisará cuando esté activo.' };
  }

  @Public()
  @Throttle({ default: { limit: () => loadEnv().RATE_LIMIT_LOGIN, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.auth.forgotPassword(dto.email, req.ip);
    return { message: 'Si el correo está registrado, recibirá un enlace para restablecer su contraseña.' };
  }

  @Public()
  @Throttle({ default: { limit: () => loadEnv().RATE_LIMIT_LOGIN, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordWithTokenDto, @Req() req: Request) {
    await this.auth.resetPassword(dto.token, dto.newPassword, req.ip);
  }

  @SkipThrottle()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    const { sessionId, ...rest } = user;
    return rest;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId, user.id, req.ip);
    res.clearCookie(sessionCookieName(), { path: '/', httpOnly: true, secure: loadEnv().NODE_ENV === 'production', sameSite: 'lax' });
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    await this.auth.changePassword(user.id, user.sessionId, dto.currentPassword, dto.newPassword, req.ip);
  }
}
