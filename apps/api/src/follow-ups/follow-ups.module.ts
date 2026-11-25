import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { ActivitiesService } from './activities.service';
import { ActivitiesController, CalendarController, FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

/** Seguimientos, estados, actividades y calendario combinado (Fase 5). */
@Module({
  imports: [MaintenanceModule],
  controllers: [FollowUpsController, ActivitiesController, CalendarController],
  providers: [FollowUpsService, ActivitiesService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
