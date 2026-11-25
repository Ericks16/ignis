import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Límite de peticiones solo para HTTP; el chat por WebSocket tiene su propio límite por conexión. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return Promise.resolve(true);
    return super.canActivate(ctx);
  }
}
