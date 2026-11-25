import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from '../email/email.provider';
import { createEmailProvider } from '../reminders/reminders.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: EMAIL_PROVIDER, useFactory: createEmailProvider }],
  exports: [AuthService],
})
export class AuthModule {}
