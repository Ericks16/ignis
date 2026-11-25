import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { definedKeys } from '../common/helpers';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';

/** Campos públicos: nunca devolver passwordHash. */
const select = {
  id: true, email: true, name: true, role: true, active: true, mustChangePassword: true, selfRegistered: true,
  lastLoginAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthUser, ip?: string) {
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) throw new ConflictException('Ya existe un usuario con ese correo');
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, role: dto.role, passwordHash: await bcrypt.hash(dto.password, 12), mustChangePassword: true },
      select,
    });
    await this.audit.log({ actorId: actor.id, action: 'user.created', entity: 'User', entityId: user.id, metadata: { role: user.role }, ip });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ip?: string) {
    const target = await this.get(id);
    const losingAdmin = target.role === Role.ADMIN && target.active && ((dto.role && dto.role !== Role.ADMIN) || dto.active === false);
    if (losingAdmin) {
      if (id === actor.id) throw new BadRequestException('No puede quitarse a sí mismo el acceso de administrador');
      await this.assertAnotherAdmin(id);
    }
    const user = await this.prisma.user.update({ where: { id }, data: dto, select });
    if (dto.active === false || (dto.role && dto.role !== target.role)) await this.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log({ actorId: actor.id, action: 'user.updated', entity: 'User', entityId: id, metadata: { fields: definedKeys(dto) }, ip });
    return user;
  }

  async resetPassword(id: string, password: string, actor: AuthUser, ip?: string) {
    await this.get(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    await this.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log({ actorId: actor.id, action: 'user.password_reset', entity: 'User', entityId: id, ip });
  }

  private async assertAnotherAdmin(excludeId: string) {
    const others = await this.prisma.user.count({ where: { role: Role.ADMIN, active: true, id: { not: excludeId } } });
    if (!others) throw new BadRequestException('Debe existir al menos un administrador activo');
  }
}
