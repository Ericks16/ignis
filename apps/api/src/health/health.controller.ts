import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Si el cron no ha corrido en este tiempo, el scheduler se considera atrasado. */
const STALE_HOURS = 26;

/** Endpoints de salud. No exponen información sensible (nunca claves ni direcciones). */
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    const env = loadEnv();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    const last = await this.prisma.jobRun.findFirst({ where: { name: 'reminders' }, orderBy: { startedAt: 'desc' } });
    const minutes = last ? Math.round((Date.now() - last.startedAt.getTime()) / 60_000) : null;
    const warnings: string[] = [];
    if (!env.CRON_SECRET) warnings.push('cron deshabilitado (falta CRON_SECRET)');
    else if (minutes === null) warnings.push('el scheduler aún no se ha ejecutado');
    else if (minutes > STALE_HOURS * 60) warnings.push('el scheduler está atrasado');
    if (last?.status === 'ERROR') warnings.push('la última ejecución del scheduler falló');
    // Con correo real, un remitente sin configurar (valor por defecto @localhost) hace que el proveedor rechace todos los envíos.
    if (env.EMAIL_MODE === 'live' && /@localhost\b/i.test(env.EMAIL_FROM)) warnings.push('EMAIL_FROM no está configurado con una dirección real: el proveedor rechazará los correos (recuperación de contraseña y recordatorios)');
    return {
      status: 'ok',
      database: 'up',
      email: { mode: env.EMAIL_MODE, provider: env.EMAIL_MODE === 'live' ? env.EMAIL_PROVIDER : 'console' },
      scheduler: { lastRunAt: last?.startedAt ?? null, lastStatus: last?.status ?? null, minutesSinceLastRun: minutes, cronEnabled: !!env.CRON_SECRET },
      warnings,
    };
  }
}
