import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const SKIP_CSRF = 'skipCsrf';
/** Solo para endpoints máquina-a-máquina autenticados por secreto propio (cron). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
  mustChangePassword: boolean;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
