import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { CalendarQuery } from '../maintenance/dto/maintenance.dto';
import { ActivitiesService } from './activities.service';
import {
  ChangeStatusDto, CreateActivityDto, CreateFollowUpDto, CreateStatusDto, FollowUpCalendarQuery, ListActivitiesQuery, ListFollowUpsQuery,
  UpdateActivityDto, UpdateFollowUpDto, UpdateStatusDto,
} from './dto/follow-ups.dto';
import { FollowUpsService } from './follow-ups.service';

// Seguimientos: Administrador y Operativo gestionan; el Técnico consulta los suyos y registra actividades; Consulta solo lee.
const WRITERS = [Role.ADMIN, Role.OPERATIVO];
const ACTIVITY_WRITERS = [Role.ADMIN, Role.OPERATIVO, Role.TECNICO];
const ctx = (actor: AuthUser, req: Request) => ({ actor, ip: req.ip });

@Controller()
export class FollowUpsController {
  constructor(private readonly svc: FollowUpsService) {}

  @Get('follow-ups') list(@Query() q: ListFollowUpsQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('follow-ups/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Get('follow-ups/:id/history') history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.history(id, u); }

  @Roles(...WRITERS) @Post('follow-ups')
  create(@Body() dto: CreateFollowUpDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.create(dto, ctx(u, req)); }

  @Roles(...WRITERS) @Patch('follow-ups/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFollowUpDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.update(id, dto, ctx(u, req)); }

  @Roles(...WRITERS) @Post('follow-ups/:id/status') @HttpCode(200)
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStatusDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.changeStatus(id, dto, ctx(u, req)); }

  // Estados: lectura para todos, administración solo Administrador.
  @Get('follow-up-statuses') statuses(@Query('includeInactive') inc?: string) { return this.svc.listStatuses(inc === 'true'); }
  @Roles(Role.ADMIN) @Post('follow-up-statuses')
  createStatus(@Body() dto: CreateStatusDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.createStatus(dto, ctx(u, req)); }
  @Roles(Role.ADMIN) @Patch('follow-up-statuses/:id')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.updateStatus(id, dto, ctx(u, req)); }
}

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  @Get() list(@Query() q: ListActivitiesQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }

  @Roles(...ACTIVITY_WRITERS) @Post()
  create(@Body() dto: CreateActivityDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.create(dto, ctx(u, req)); }

  @Roles(...ACTIVITY_WRITERS) @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.update(id, dto, ctx(u, req)); }
}

/** Calendario combinado: mantenimientos (fecha programada) y seguimientos (fecha objetivo). */
@Controller('calendar')
export class CalendarController {
  constructor(private readonly maintenance: MaintenanceService, private readonly followUps: FollowUpsService) {}

  @Get()
  async calendar(@Query() q: FollowUpCalendarQuery, @CurrentUser() u: AuthUser) {
    // Filtros propios de mantenimientos (tipo, categoría de sistema, estado) excluyen a los seguimientos.
    const maintenanceOnly = !!(q.typeId || q.categoryId || q.status);
    const wantsM = q.kind !== 'followup';
    const wantsF = q.kind !== 'maintenance' && !maintenanceOnly;
    const mq = Object.assign(new CalendarQuery(), q);
    const [m, f] = await Promise.all([wantsM ? this.maintenance.calendar(mq, u) : [], wantsF ? this.followUps.calendar(q, u) : []]);
    return [...m, ...f].sort((a, b) => a.date.localeCompare(b.date));
  }
}
