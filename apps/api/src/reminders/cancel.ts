import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Cancela notificaciones aún no enviadas (PENDING o FAILED con reintento programado) por ids.
 * Libera su dedupeKey para que, si el elemento se reabre o cambia su fecha, pueda generarse un recordatorio nuevo.
 * Las SENT se conservan siempre como historial; las SENDING (en vuelo) se re-validan justo antes de enviar.
 */
export async function cancelByIds(db: Db, ids: string[], reason: string): Promise<number> {
  if (!ids.length) return 0;
  return db.$executeRaw`UPDATE "Notification"
    SET "status" = 'CANCELLED', "nextAttemptAt" = NULL, "lockedAt" = NULL, "lastError" = ${reason},
        "dedupeKey" = "dedupeKey" || '#cancelled-' || "id", "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE "id" IN (${Prisma.join(ids)}) AND "status" IN ('PENDING', 'FAILED')`;
}

/** Cancela los recordatorios pendientes de un seguimiento o un mantenimiento (se usa dentro de la misma transacción que el cambio). */
export async function cancelPendingFor(db: Db, target: { followUpId?: string; maintenanceId?: string }, reason: string): Promise<number> {
  const rows = await db.notification.findMany({
    where: { ...target, status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { not: null } },
    select: { id: true },
  });
  return cancelByIds(db, rows.map((r) => r.id), reason);
}
