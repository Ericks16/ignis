import { Module } from '@nestjs/common';
import { CatalogsController, CatalogsService } from '../catalogs/catalogs';
import { SystemsController } from './systems.controller';
import { SystemsService } from './systems.service';

/** Catálogos, sistemas instalados y dispositivos (Fase 3). */
@Module({
  controllers: [CatalogsController, SystemsController],
  providers: [CatalogsService, SystemsService],
  exports: [SystemsService],
})
export class SystemsModule {}
