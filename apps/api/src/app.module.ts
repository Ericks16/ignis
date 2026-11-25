import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './common/throttler.guard';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.service';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { SystemsModule } from './systems/systems.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { RemindersModule } from './reminders/reminders.module';
import { ImportsModule } from './imports/imports.module';
import { ReportsModule } from './reports/reports.module';
import { HealthController } from './health/health.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { AlertsController } from './dashboard/alerts.controller';
import { ChatModule } from './chat/chat.module';
import { CsrfGuard } from './common/csrf.guard';
import { pinoHttpOptions } from './common/logging';
import { loadEnv } from './config/env';
import { RolesGuard, SessionGuard } from './auth/auth.guards';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: pinoHttpOptions() }),
    // Límite general por IP; el de inicio de sesión es más estricto (ver AuthController). Configurables por entorno.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: () => loadEnv().RATE_LIMIT_GLOBAL }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    SystemsModule,
    MaintenanceModule,
    FollowUpsModule,
    RemindersModule,
    ImportsModule,
    ReportsModule,
    ChatModule,
  ],
  controllers: [HealthController, DashboardController, AlertsController],
  providers: [
    // Orden: límite de peticiones → CSRF → sesión → roles
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
