import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

/** Importación de Excel (Fase 7). */
@Module({ controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
