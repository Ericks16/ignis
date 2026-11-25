import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Lista mínima de usuarios activos (id y nombre) para elegir responsables. Visible para cualquier usuario autenticado. */
@Controller('user-options')
export class UserOptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
