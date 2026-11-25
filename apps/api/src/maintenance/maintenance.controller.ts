import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CancelMaintenanceDto, CompleteMaintenanceDto, CreateMaintenanceDto, ListMaintenancesQuery,
  RescheduleMaintenanceDto, SetStatusDto, UpdateMaintenanceDto,
} from './dto/maintenance.dto';
import { MaintenanceService } from './maintenance.service';

// Programar/reprogramar/cancelar/asignar: Administrador y Operativo.
// Iniciar, registrar trabajo y observaciones: además el Técnico (solo en sus asignaciones; el servicio lo valida).
// Consulta: solo lectura.
const WRITERS = [Role.ADMIN, Role.OPERATIVO];
const FIELD_STAFF = [Role.ADMIN, Role.OPERATIVO, Role.TECNICO];
const ctx = (actor: AuthUser, req: Request) => ({ actor, ip: req.ip });

@Controller()
export class MaintenanceController {
  constructor(private readonly svc: MaintenanceService) {}

  @Get('maintenances') list(@Query() q: ListMaintenancesQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('maintenances/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Get('maintenances/:id/history') history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.history(id, u); }

  @Roles(...WRITERS) @Post('maintenances')
  create(@Body() dto: CreateMaintenanceDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.create(dto, ctx(u, req)); }

  @Roles(...FIELD_STAFF) @Patch('maintenances/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaintenanceDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(id, dto, ctx(u, req));
  }

  @Roles(...FIELD_STAFF) @Post('maintenances/:id/start') @HttpCode(200)
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.start(id, ctx(u, req)); }

  @Roles(...FIELD_STAFF) @Post('maintenances/:id/complete') @HttpCode(200)
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteMaintenanceDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.complete(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Post('maintenances/:id/status') @HttpCode(200)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStatusDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.setStatus(id, dto.status, ctx(u, req));
  }

  @Roles(...WRITERS) @Post('maintenances/:id/cancel') @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelMaintenanceDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.cancel(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Post('maintenances/:id/reschedule') @HttpCode(200)
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleMaintenanceDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.reschedule(id, dto, ctx(u, req));
  }
}
