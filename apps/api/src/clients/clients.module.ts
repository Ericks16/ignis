import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { InstallationsController } from '../installations/installations.controller';
import { InstallationsService } from '../installations/installations.service';

/** Clientes, contactos e instalaciones (Fase 2). */
@Module({
  controllers: [ClientsController, InstallationsController],
  providers: [ClientsService, InstallationsService],
  exports: [ClientsService, InstallationsService],
})
export class ClientsModule {}
