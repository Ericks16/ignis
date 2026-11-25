export interface StatusInfo { name: string; isTerminal: boolean }

/** Vencido: sigue abierto (estado no terminal) y su fecha objetivo es anterior a hoy. Fechas AAAA-MM-DD. */
export const isFollowUpOverdue = (isTerminal: boolean, target: string | null, today: string) => !isTerminal && !!target && target < today;

export type TransitionCheck = { ok: true; closes: boolean; reopens: boolean } | { ok: false; reason: string };

/**
 * Reglas de cambio de estado:
 * - No se puede "cambiar" al mismo estado.
 * - De un estado terminal solo se reabre hacia uno no terminal, y exige comentario (queda en el historial).
 * - No se pasa de un terminal a otro terminal (p. ej. FINALIZADO -> CANCELADO).
 * - CANCELADO exige un motivo.
 */
export function checkTransition(from: StatusInfo, to: StatusInfo, comment?: string | null): TransitionCheck {
  if (from.name === to.name) return { ok: false, reason: 'El seguimiento ya tiene ese estado' };
  if (from.isTerminal && to.isTerminal) return { ok: false, reason: 'Un seguimiento cerrado solo puede reabrirse hacia un estado no terminal' };
  if (from.isTerminal && !comment?.trim()) return { ok: false, reason: 'Indique el motivo de la reapertura' };
  if (to.isTerminal && to.name === 'CANCELADO' && !comment?.trim()) return { ok: false, reason: 'Indique el motivo de la cancelación' };
  return { ok: true, closes: to.isTerminal, reopens: from.isTerminal && !to.isTerminal };
}
