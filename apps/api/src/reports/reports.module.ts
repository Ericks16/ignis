import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Reportes filtrables y exportaciones a Excel, CSV y PDF (Fase 8). */
@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
