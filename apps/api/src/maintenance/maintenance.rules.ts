import { MaintenanceStatus } from '@prisma/client';

/** Estados que ya no admiten cambios de estado. */
export const TERMINAL: MaintenanceStatus[] = ['REALIZADO', 'CANCELADO', 'REPROGRAMADO'];
/** Estados abiertos (cuentan para programados, próximos y vencidos). */
export const OPEN: MaintenanceStatus[] = ['PROGRAMADO', 'PENDIENTE', 'EN_PROCESO'];

const ALLOWED: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  PROGRAMADO: ['PENDIENTE', 'EN_PROCESO', 'REALIZADO', 'CANCELADO', 'REPROGRAMADO'],
  PENDIENTE: ['PROGRAMADO', 'EN_PROCESO', 'REALIZADO', 'CANCELADO', 'REPROGRAMADO'],
  EN_PROCESO: ['PENDIENTE', 'REALIZADO', 'CANCELADO', 'REPROGRAMADO'],
  REALIZADO: [],
  CANCELADO: [],
  REPROGRAMADO: [],
};

export const canTransition = (from: MaintenanceStatus, to: MaintenanceStatus) => ALLOWED[from].includes(to);

/** Vencido: sigue abierto y su fecha programada es anterior a hoy. Fechas en formato AAAA-MM-DD. */
export const isOverdue = (status: MaintenanceStatus, scheduled: string, today: string) => OPEN.includes(status) && scheduled < today;

/**
 * Próximo mantenimiento del sistema tras registrar un trabajo realizado.
 * - Si el usuario define una fecha, esa es la que se guarda (nunca se calcula una periodicidad).
 * - Si no la define y la fecha anterior ya quedó cumplida (<= ejecución), se limpia para no marcar un vencido falso.
 * - Si no la define y la anterior sigue en el futuro, se conserva.
 */
export function nextDateAfterCompletion(current: string | null, executed: string, userDefined?: string | null): string | null {
  if (userDefined) return userDefined;
  if (current && current > executed) return current;
  return null;
}
