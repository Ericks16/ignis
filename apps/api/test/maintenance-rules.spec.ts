import { addDays, parseDateOnly, todayLocal } from '../src/common/dates';
import { canTransition, isOverdue, nextDateAfterCompletion } from '../src/maintenance/maintenance.rules';

describe('Fechas en America/Guayaquil (unitarias)', () => {
  const tz = 'America/Guayaquil';
  it('a las 23:30 hora de Guayaquil sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    // 2026-03-10 23:30 en Guayaquil (UTC-5) = 2026-03-11 04:30 UTC
    expect(todayLocal(new Date('2026-03-11T04:30:00Z'), tz)).toBe('2026-03-10');
  });
  it('a las 00:30 hora de Guayaquil ya es el día nuevo', () => {
    expect(todayLocal(new Date('2026-03-11T05:30:00Z'), tz)).toBe('2026-03-11');
  });
  it('addDays cruza fin de mes y año bisiesto', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('parseDateOnly rechaza fechas imposibles o mal formadas', () => {
    expect(() => parseDateOnly('2026-02-30')).toThrow();
    expect(() => parseDateOnly('30/02/2026')).toThrow();
    expect(parseDateOnly('2026-02-28').toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('Reglas de estado de mantenimientos (unitarias)', () => {
  it('transiciones válidas e inválidas', () => {
    expect(canTransition('PROGRAMADO', 'EN_PROCESO')).toBe(true);
    expect(canTransition('EN_PROCESO', 'REALIZADO')).toBe(true);
    expect(canTransition('EN_PROCESO', 'PROGRAMADO')).toBe(false);
    for (const t of ['REALIZADO', 'CANCELADO', 'REPROGRAMADO'] as const) {
      for (const to of ['PROGRAMADO', 'PENDIENTE', 'EN_PROCESO', 'REALIZADO', 'CANCELADO', 'REPROGRAMADO'] as const) {
        expect(canTransition(t, to)).toBe(false);
      }
    }
  });
  it('vencido solo si está abierto y la fecha ya pasó', () => {
    expect(isOverdue('PROGRAMADO', '2026-03-09', '2026-03-10')).toBe(true);
    expect(isOverdue('PROGRAMADO', '2026-03-10', '2026-03-10')).toBe(false); // hoy no es vencido
    expect(isOverdue('REALIZADO', '2026-03-01', '2026-03-10')).toBe(false);
    expect(isOverdue('CANCELADO', '2026-03-01', '2026-03-10')).toBe(false);
  });
  it('el próximo mantenimiento nunca se calcula por periodicidad', () => {
    expect(nextDateAfterCompletion('2026-01-01', '2026-03-10', '2027-03-01')).toBe('2027-03-01'); // lo define el usuario
    expect(nextDateAfterCompletion('2026-01-01', '2026-03-10')).toBeNull(); // la fecha vieja ya se cumplió: se limpia
    expect(nextDateAfterCompletion('2026-09-01', '2026-03-10')).toBe('2026-09-01'); // la futura se conserva
    expect(nextDateAfterCompletion(null, '2026-03-10')).toBeNull();
  });
});
