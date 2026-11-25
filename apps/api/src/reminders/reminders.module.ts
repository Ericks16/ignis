import { Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { BrevoEmailProvider, ConsoleEmailProvider, EMAIL_PROVIDER, EmailProvider, ResendEmailProvider } from '../email/email.provider';
import { CronController, NotificationsController, ReminderSettingsController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ReminderSettingsService } from './reminders.settings';

/** Selecciona el proveedor de correo. En modo test SIEMPRE se usa la consola: nunca se envía nada real. */
export function createEmailProvider(): EmailProvider {
  const env = loadEnv();
  if (env.EMAIL_MODE !== 'live') return new ConsoleEmailProvider();
  if (env.EMAIL_PROVIDER === 'resend') return new ResendEmailProvider(env.RESEND_API_KEY!, env.EMAIL_FROM);
  if (env.EMAIL_PROVIDER === 'brevo') return new BrevoEmailProvider(env.BREVO_API_KEY!, env.EMAIL_FROM);
  return new ConsoleEmailProvider();
}

/** Recordatorios por correo, notificaciones y cron (Fase 6). */
@Module({
  controllers: [NotificationsController, ReminderSettingsController, CronController],
  providers: [RemindersService, ReminderSettingsService, { provide: EMAIL_PROVIDER, useFactory: createEmailProvider }],
  exports: [RemindersService],
})
export class RemindersModule {}
