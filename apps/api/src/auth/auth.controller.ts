import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
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
