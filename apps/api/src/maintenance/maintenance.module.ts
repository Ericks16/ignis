import { Module } from '@nestjs/common';
import { TechniciansController, TechniciansService } from '../technicians/technicians';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/** Técnicos, mantenimientos y calendario (Fase 4). */
@Module({
  controllers: [TechniciansController, MaintenanceController],
  providers: [TechniciansService, MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
