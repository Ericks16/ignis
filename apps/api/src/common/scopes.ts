import { Prisma, Role } from '@prisma/client';
import { AuthUser } from './decorators';

/**
 * Alcance de datos por rol. Una sola definición compartida por las pantallas, los reportes y las exportaciones,
 * para que un reporte nunca muestre más de lo que el usuario puede ver en el sistema.
 * El Técnico solo ve lo asignado a su usuario (a través de su ficha de técnico vinculada).
 */
export const maintenanceScope = (actor: AuthUser): Prisma.MaintenanceWhereInput =>
  actor.role === Role.TECNICO ? { technicians: { some: { technician: { userId: actor.id } } } } : {};

export const followUpScope = (actor: AuthUser): Prisma.FollowUpWhereInput =>
  actor.role === Role.TECNICO
    ? { OR: [{ responsibleId: actor.id }, { technicians: { some: { technician: { userId: actor.id } } } }] }
    : {};

export const activityScope = (actor: AuthUser): Prisma.ActivityWhereInput => {
  if (actor.role !== Role.TECNICO) return {};
  return {
    OR: [
      { userId: actor.id },
      { followUp: followUpScope(actor) },
      { maintenance: { technicians: { some: { technician: { userId: actor.id } } } } },
    ],
  };
};
