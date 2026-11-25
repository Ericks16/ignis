import { checkTransition, isFollowUpOverdue } from '../src/follow-ups/follow-ups.rules';

const S = (name: string, isTerminal = false) => ({ name, isTerminal });

describe('Reglas de seguimientos (unitarias)', () => {
  it('vencido solo si está abierto y la fecha objetivo ya pasó', () => {
    expect(isFollowUpOverdue(false, '2026-03-09', '2026-03-10')).toBe(true);
    expect(isFollowUpOverdue(false, '2026-03-10', '2026-03-10')).toBe(false);
    expect(isFollowUpOverdue(false, null, '2026-03-10')).toBe(false);
    expect(isFollowUpOverdue(true, '2026-03-01', '2026-03-10')).toBe(false); // finalizado/cancelado nunca vence
  });

  it('transiciones entre estados abiertos son libres, salvo repetir el mismo', () => {
    expect(checkTransition(S('PENDIENTE'), S('EN PROCESO'))).toEqual({ ok: true, closes: false, reopens: false });
    expect(checkTransition(S('EN PROCESO'), S('ESPERANDO CLIENTE'))).toMatchObject({ ok: true });
    expect(checkTransition(S('PENDIENTE'), S('PENDIENTE'))).toMatchObject({ ok: false });
  });

  it('cerrar: FINALIZADO no exige motivo; CANCELADO sí', () => {
    expect(checkTransition(S('EN PROCESO'), S('FINALIZADO', true))).toEqual({ ok: true, closes: true, reopens: false });
    expect(checkTransition(S('EN PROCESO'), S('CANCELADO', true))).toMatchObject({ ok: false });
    expect(checkTransition(S('EN PROCESO'), S('CANCELADO', true), '  ')).toMatchObject({ ok: false });
    expect(checkTransition(S('EN PROCESO'), S('CANCELADO', true), 'Cliente desistió')).toMatchObject({ ok: true, closes: true });
  });

  it('un cerrado solo se reabre hacia un estado abierto y con motivo; nunca terminal -> terminal', () => {
    expect(checkTransition(S('FINALIZADO', true), S('EN PROCESO'))).toMatchObject({ ok: false });
    expect(checkTransition(S('FINALIZADO', true), S('EN PROCESO'), 'Faltó una visita')).toEqual({ ok: true, closes: false, reopens: true });
    expect(checkTransition(S('FINALIZADO', true), S('CANCELADO', true), 'x')).toMatchObject({ ok: false });
  });

  it('estados personalizados terminales también cierran', () => {
    expect(checkTransition(S('PENDIENTE'), S('CERRADO LEGAL', true))).toEqual({ ok: true, closes: true, reopens: false });
  });
});
