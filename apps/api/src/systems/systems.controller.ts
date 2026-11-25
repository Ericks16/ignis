import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateEquipmentDto, CreateSystemDto, ListSystemsQuery, UpdateEquipmentDto, UpdateSystemDto } from './dto/systems.dto';
import { SystemsService } from './systems.service';

// Lectura: todos los roles. Escritura: Administrador y Administrador operativo.
const WRITERS = [Role.ADMIN, Role.OPERATIVO];
const ctx = (actor: AuthUser, req: Request) => ({ actor, ip: req.ip });

@Controller()
export class SystemsController {
  constructor(private readonly svc: SystemsService) {}

  @Get('systems') list(@Query() q: ListSystemsQuery) { return this.svc.list(q); }
  @Get('systems/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Roles(...WRITERS) @Post('systems')
  create(@Body() dto: CreateSystemDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.create(dto, ctx(u, req)); }

  @Roles(...WRITERS) @Patch('systems/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSystemDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Post('systems/:id/deactivate') @HttpCode(200)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.setStatus(id, 'INACTIVE', ctx(u, req)); }

  @Roles(...WRITERS) @Post('systems/:id/reactivate') @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.setStatus(id, 'ACTIVE', ctx(u, req)); }

  @Roles(...WRITERS) @Post('systems/:id/equipment')
  addEquipment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEquipmentDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.addEquipment(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Patch('equipment/:id')
  updateEquipment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEquipmentDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.updateEquipment(id, dto, ctx(u, req));
  }
}
