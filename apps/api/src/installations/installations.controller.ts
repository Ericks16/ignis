import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateInstallationDto, ListInstallationsQuery, UpdateInstallationDto } from './dto/installations.dto';
import { InstallationsService } from './installations.service';

const WRITERS = [Role.ADMIN, Role.OPERATIVO];
const ctx = (actor: AuthUser, req: Request) => ({ actor, ip: req.ip });

@Controller('installations')
export class InstallationsController {
  constructor(private readonly svc: InstallationsService) {}

  @Get() list(@Query() q: ListInstallationsQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Roles(...WRITERS) @Post()
  create(@Body() dto: CreateInstallationDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.create(dto, ctx(u, req)); }

  @Roles(...WRITERS) @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInstallationDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Post(':id/deactivate') @HttpCode(200)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.setStatus(id, 'INACTIVE', ctx(u, req)); }

  @Roles(...WRITERS) @Post(':id/reactivate') @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.setStatus(id, 'ACTIVE', ctx(u, req)); }
}
