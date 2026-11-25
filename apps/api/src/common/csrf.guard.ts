import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_CSRF } from './decorators';
import { loadEnv } from '../config/env';

/**
 * Protección CSRF para autenticación por cookie:
 * - Las mutaciones exigen la cabecera personalizada X-Requested-With: ignis
 *   (un formulario cross-site no puede enviarla).
 * - Si llega Origin, debe estar en CORS_ORIGINS.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (req.headers['x-requested-with'] !== 'ignis') throw new ForbiddenException('Solicitud no permitida (CSRF)');
    const origin = req.headers.origin as string | undefined;
    if (origin && !loadEnv().corsOrigins.includes(origin)) throw new ForbiddenException('Origen no permitido');
    return true;
  }
}
