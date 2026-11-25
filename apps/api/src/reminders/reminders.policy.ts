import { addDays } from '../common/dates';

/**
 * Política de recordatorios (funciones puras, sin acceso a base de datos):
 *  - Primer aviso: N meses calendario antes de la fecha objetivo (por defecto 1).
 *  - Avisos posteriores: cada `repeatDays` días (por defecto 7), contados desde el primer aviso, sin parar al vencer.
 *  - Si el mes anterior no tiene ese día (31 de marzo -> febrero) se usa el último día de ese mes.
 */
export interface ReminderConfig {
  leadMonths: number;
  repeatDays: number;
  maxAttempts: number;
  retryMinutes: number[];
  sendHourLocal: number;
  internalRecipients: string[];
  includeClientContacts: boolean;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  leadMonths: 1,
  repeatDays: 7,
  maxAttempts: 5,
  retryMinutes: [5, 30, 120, 720],
  sendHourLocal: 8,
  internalRecipients: [],
  includeClientContacts: false,
};

const daysInMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = mes 1..12

/** Resta n meses calendario a una fecha AAAA-MM-DD, recortando al último día del mes si hace falta. */
export function subtractMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

export const firstOccurrence = (target: string, cfg: Pick<ReminderConfig, 'leadMonths'>) => subtractMonths(target, cfg.leadMonths);

/**
 * Último recordatorio que ya correspondía enviar a más tardar hoy (o null si todavía no llega el primero).
 * Si el sistema estuvo detenido varios días, solo importa este: no se envía una ráfaga de atrasados.
 */
export function latestDueOccurrence(target: string, today: string, cfg: Pick<ReminderConfig, 'leadMonths' | 'repeatDays'>): string | null {
  const first = firstOccurrence(target, cfg);
  if (today < first) return null;
  const k = Math.floor(daysBetween(first, today) / cfg.repeatDays);
  return addDays(first, k * cfg.repeatDays);
}

export type Kind = 'FIRST' | 'WEEKLY' | 'OVERDUE';

/** OVERDUE si la fecha del aviso es posterior a la fecha objetivo; FIRST si no hubo avisos previos; WEEKLY en los demás casos. */
export function occurrenceKind(target: string, occurrence: string, hasPrevious: boolean): Kind {
  if (occurrence > target) return 'OVERDUE';
  return hasPrevious ? 'WEEKLY' : 'FIRST';
}

/** Retraso (en minutos) antes del intento número `attempt` (1 = primer fallo). Nulo si ya no hay más intentos. */
export function retryDelayMinutes(attempt: number, cfg: Pick<ReminderConfig, 'maxAttempts' | 'retryMinutes'>): number | null {
  if (attempt >= cfg.maxAttempts) return null;
  const list = cfg.retryMinutes.length ? cfg.retryMinutes : [5];
  return list[Math.min(attempt - 1, list.length - 1)];
}

export const dedupeKey = (entity: 'FOLLOW_UP' | 'MAINTENANCE', id: string, email: string, occurrence: string) =>
  `${entity}:${id}:${email.trim().toLowerCase()}:${occurrence}`;
