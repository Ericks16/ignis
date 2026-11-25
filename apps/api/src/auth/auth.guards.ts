import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC, ROLES_KEY } from '../common/decorators';
import { AuthService } from './auth.service';

import { loadEnv } from '../config/env';

/** En producción se usa el prefijo __Host- (el navegador exige Secure, Path=/ y sin Domain), lo que evita cookies falsificadas desde subdominios. */
export const sessionCookieName = () => (loadEnv().NODE_ENV === 'production' ? '__Host-ignis_session' : 'ignis_session');

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[sessionCookieName()];
    const user = token ? await this.auth.validateSession(token) : null;
    if (!user) throw new UnauthorizedException('Sesión no válida');
    req.user = user;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('No tiene permisos para esta acción');
    return true;
  }
}
