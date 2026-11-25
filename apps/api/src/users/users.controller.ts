import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateUserDto, ListUsersQuery, ResetPasswordDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

/** Gestión de usuarios: solo Administrador (validado en backend). */
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() list(@Query() q: ListUsersQuery) { return this.users.list(q); }

  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.users.get(id); }

  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.users.create(dto, actor, req.ip);
  }

  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.users.update(id, dto, actor, req.ip);
  }

  @Post(':id/reset-password') @HttpCode(204)
  async reset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    await this.users.resetPassword(id, dto.password, actor, req.ip);
  }
}
