import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ClientsService } from './clients.service';
import { CreateClientDto, CreateContactDto, ListClientsQuery, UpdateClientDto, UpdateContactDto } from './dto/clients.dto';

// Lectura: todos los roles autenticados. Escritura: Administrador y Administrador operativo.
const WRITERS = [Role.ADMIN, Role.OPERATIVO];
const ctx = (actor: AuthUser, req: Request) => ({ actor, ip: req.ip });

@Controller()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('clients') list(@Query() q: ListClientsQuery) { return this.clients.list(q); }

  @Get('clients/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.clients.get(id); }

  @Get('clients/:id/history') history(@Param('id', ParseUUIDPipe) id: string) { return this.clients.history(id); }

  @Roles(...WRITERS) @Post('clients')
  create(@Body() dto: CreateClientDto, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.clients.create(dto, ctx(u, req)); }

  @Roles(...WRITERS) @Patch('clients/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.clients.update(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Post('clients/:id/deactivate') @HttpCode(200)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.clients.setStatus(id, 'INACTIVE', ctx(u, req));
  }

  @Roles(...WRITERS) @Post('clients/:id/reactivate') @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.clients.setStatus(id, 'ACTIVE', ctx(u, req));
  }

  @Roles(...WRITERS) @Post('clients/:id/contacts')
  addContact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateContactDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.clients.addContact(id, dto, ctx(u, req));
  }

  @Roles(...WRITERS) @Patch('contacts/:id')
  updateContact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.clients.updateContact(id, dto, ctx(u, req));
  }
}
