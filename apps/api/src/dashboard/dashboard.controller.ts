import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { todayLocal, parseDateOnly } from '../common/dates';
import { AuthUser, CurrentUser } from '../common/decorators';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { OPEN } from '../maintenance/maintenance.rules';
import { PrismaService } from '../prisma/prisma.service';

/** Dashboard: todos los indicadores se calculan con datos reales de la base de datos. */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
    private readonly followUps: FollowUpsService,
  ) {}

  /** Clientes que requieren atención: con mantenimientos o seguimientos abiertos y vencidos (los más urgentes primero). */
  private async attentionClients(actor: AuthUser) {
    if (actor.role === Role.TECNICO) return null;
    const today = parseDateOnly(todayLocal());
    const [m, f] = await Promise.all([
      this.prisma.maintenance.findMany({ where: { status: { in: OPEN }, scheduledDate: { lt: today } }, select: { system: { select: { installation: { select: { client: { select: { id: true, commercialName: true } } } } } } } }),
      this.prisma.followUp.findMany({ where: { status: { isTerminal: false }, targetDate: { lt: today } }, select: { client: { select: { id: true, commercialName: true } } } }),
    ]);
    const map = new Map<string, { clientId: string; name: string; overdueMaintenances: number; overdueFollowUps: number }>();
    const row = (c: { id: string; commercialName: string }) => map.get(c.id) ?? map.set(c.id, { clientId: c.id, name: c.commercialName, overdueMaintenances: 0, overdueFollowUps: 0 }).get(c.id)!;
    for (const x of m) row(x.system.installation.client).overdueMaintenances++;
    for (const x of f) row(x.client).overdueFollowUps++;
    const all = [...map.values()].sort((a, b) => b.overdueMaintenances + b.overdueFollowUps - (a.overdueMaintenances + a.overdueFollowUps) || a.name.localeCompare(b.name, 'es'));
    return { total: all.length, top: all.slice(0, 8) };
  }

  /** Sistemas activos por categoría (todas las categorías, incluso con cero). */
  private async systemsByCategory() {
    const [cats, groups] = await Promise.all([
      this.prisma.systemCategory.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
      this.prisma.installedSystem.groupBy({ by: ['categoryId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
    ]);
    return cats.map((c) => ({ name: c.name, count: groups.find((g) => g.categoryId === c.id)?._count._all ?? 0 }));
  }

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser, @Query('year') yearParam?: string) {
    const y = yearParam ? parseInt(yearParam, 10) : undefined;
    if (y !== undefined && (!Number.isInteger(y) || y < 2000 || y > 2100)) throw new BadRequestException('Año inválido');
    const isAdmin = user.role === Role.ADMIN;
    const users = isAdmin
      ? { active: await this.prisma.user.count({ where: { active: true } }), inactive: await this.prisma.user.count({ where: { active: false } }) }
      : null;
    const [systems, clientsActive, clientsInactive, installations, maintenance, followUps, attention, byCategory] = await Promise.all([
      this.prisma.installedSystem.count({ where: { status: 'ACTIVE' } }),
      this.prisma.client.count({ where: { status: 'ACTIVE' } }),
      this.prisma.client.count({ where: { status: 'INACTIVE' } }),
      this.prisma.installation.count({ where: { status: 'ACTIVE' } }),
      this.maintenance.summary(user, y),
      this.followUps.summary(user),
      this.attentionClients(user),
      this.systemsByCategory(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      users,
      clients: { total: clientsActive + clientsInactive, active: clientsActive, inactive: clientsInactive, needingAttention: attention?.total ?? null, attention: attention?.top ?? null },
      installations,
      systems,
      systemsByCategory: byCategory,
      maintenance,
      followUps,
    };
  }
}
