import { renderReminderEmail, urgency } from '../src/email/email.templates';
import { ConsoleEmailProvider, ResendEmailProvider } from '../src/email/email.provider';
import { resetEnvCache } from '../src/config/env';
import { createEmailProvider } from '../src/reminders/reminders.module';
import { dedupeKey, firstOccurrence, latestDueOccurrence, occurrenceKind, retryDelayMinutes, subtractMonths } from '../src/reminders/reminders.policy';

const cfg = { leadMonths: 1, repeatDays: 7 };

describe('Política de fechas de recordatorios (unitarias)', () => {
  it('un mes antes: mismo día del mes anterior', () => {
    expect(subtractMonths('2026-12-24', 1)).toBe('2026-11-24');
    expect(subtractMonths('2026-08-20', 1)).toBe('2026-07-20'); // ejemplo del prompt
  });
  it('si el mes anterior no tiene ese día, se usa su último día', () => {
    expect(subtractMonths('2026-03-31', 1)).toBe('2026-02-28');
    expect(subtractMonths('2028-03-31', 1)).toBe('2028-02-29'); // bisiesto
    expect(subtractMonths('2026-05-31', 1)).toBe('2026-04-30');
    expect(subtractMonths('2026-12-31', 1)).toBe('2026-11-30');
  });
  it('cruza el año y soporta varios meses', () => {
    expect(subtractMonths('2027-01-15', 1)).toBe('2026-12-15');
    expect(subtractMonths('2027-03-31', 3)).toBe('2026-12-31');
    expect(subtractMonths('2027-01-31', 12)).toBe('2026-01-31');
  });

  it('calendario del ejemplo: objetivo 24 dic -> 24 nov, 1, 8, 15, 22 dic y luego vencido semanal', () => {
    const t = '2026-12-24';
    expect(firstOccurrence(t, cfg)).toBe('2026-11-24');
    expect(latestDueOccurrence(t, '2026-11-23', cfg)).toBeNull();
    expect(latestDueOccurrence(t, '2026-11-24', cfg)).toBe('2026-11-24');
    expect(latestDueOccurrence(t, '2026-11-30', cfg)).toBe('2026-11-24');
    expect(latestDueOccurrence(t, '2026-12-01', cfg)).toBe('2026-12-01');
    expect(latestDueOccurrence(t, '2026-12-08', cfg)).toBe('2026-12-08');
    expect(latestDueOccurrence(t, '2026-12-15', cfg)).toBe('2026-12-15');
    expect(latestDueOccurrence(t, '2026-12-22', cfg)).toBe('2026-12-22');
    expect(latestDueOccurrence(t, '2026-12-28', cfg)).toBe('2026-12-22');
    expect(latestDueOccurrence(t, '2026-12-29', cfg)).toBe('2026-12-29'); // ya vencido: continúa cada semana
    expect(latestDueOccurrence(t, '2027-01-05', cfg)).toBe('2027-01-05');
  });

  it('si el sistema estuvo parado, solo cuenta el último aviso debido (sin ráfaga)', () => {
    expect(latestDueOccurrence('2026-12-24', '2026-12-20', cfg)).toBe('2026-12-15');
    expect(latestDueOccurrence('2026-12-24', '2027-02-01', cfg)).toBe('2027-01-26');
  });

  it('la periodicidad es configurable', () => {
    expect(latestDueOccurrence('2026-12-24', '2026-12-04', { leadMonths: 1, repeatDays: 14 })).toBe('2026-11-24');
    expect(latestDueOccurrence('2026-12-24', '2026-12-08', { leadMonths: 1, repeatDays: 14 })).toBe('2026-12-08');
    expect(latestDueOccurrence('2026-12-24', '2026-11-10', { leadMonths: 2, repeatDays: 7 })).toBe('2026-11-07'); // primer aviso 24 oct
  });

  it('tipo de aviso: FIRST, WEEKLY u OVERDUE', () => {
    expect(occurrenceKind('2026-12-24', '2026-11-24', false)).toBe('FIRST');
    expect(occurrenceKind('2026-12-24', '2026-12-01', true)).toBe('WEEKLY');
    expect(occurrenceKind('2026-12-24', '2026-12-01', false)).toBe('FIRST'); // primer aviso real aunque ya hayan pasado fechas
    expect(occurrenceKind('2026-12-24', '2026-12-29', true)).toBe('OVERDUE');
    expect(occurrenceKind('2026-12-24', '2026-12-29', false)).toBe('OVERDUE');
  });

  it('reintentos con retardo creciente y tope de intentos', () => {
    const c = { maxAttempts: 4, retryMinutes: [5, 30, 120] };
    expect(retryDelayMinutes(1, c)).toBe(5);
    expect(retryDelayMinutes(2, c)).toBe(30);
    expect(retryDelayMinutes(3, c)).toBe(120);
    expect(retryDelayMinutes(4, c)).toBeNull();
  });

  it('la clave de idempotencia ignora mayúsculas del correo', () => {
    expect(dedupeKey('FOLLOW_UP', 'abc', ' Ana@IGNIS.com ', '2026-11-24')).toBe('FOLLOW_UP:abc:ana@ignis.com:2026-11-24');
  });
});

describe('Plantilla de correo (unitarias)', () => {
  const base = {
    entityLabel: 'Seguimiento' as const, title: 'Enviar <b>proforma</b> & más', client: 'Cliente "Prueba" SA', installation: 'Matriz', systemType: 'BOMBA CI',
    typeName: 'Cotización', targetDate: '2026-12-24', status: 'PENDIENTE', responsible: 'Ana', url: 'http://app.test/seguimientos/1', daysLeft: 10,
  };
  it('incluye todos los datos pedidos, el enlace y versión de texto plano', () => {
    const m = renderReminderEmail(base);
    for (const s of ['IGNIS', 'Cliente', 'Matriz', 'BOMBA CI', 'Cotización', '24/12/2026', 'PENDIENTE', 'Ana', 'Vence en 10 días', 'http://app.test/seguimientos/1']) expect(m.html).toContain(s.replace(/"/g, '&quot;'));
    expect(m.html).toContain('viewport');
    expect(m.text).toContain('Abrir en el sistema: http://app.test/seguimientos/1');
    expect(m.text).toContain('Vence en 10 días'.toUpperCase());
    expect(m.subject).toBe('[IGNIS] Recordatorio: Enviar <b>proforma</b> & más (Cliente "Prueba" SA) · 24/12/2026');
  });
  it('escapa HTML para evitar inyección', () => {
    const m = renderReminderEmail(base);
    expect(m.html).not.toContain('<b>proforma</b>');
    expect(m.html).toContain('&lt;b&gt;proforma&lt;/b&gt; &amp; más');
  });
  it('indica próximo o vencido', () => {
    expect(urgency(3)).toEqual({ label: 'Vence en 3 días', overdue: false });
    expect(urgency(1).label).toBe('Vence mañana');
    expect(urgency(0).label).toBe('Vence hoy');
    expect(urgency(-1)).toEqual({ label: 'VENCIDO hace 1 día', overdue: true });
    const m = renderReminderEmail({ ...base, daysLeft: -6 });
    expect(m.subject).toContain('VENCIDO');
    expect(m.html).toContain('VENCIDO hace 6 días');
  });
});

describe('Selección del proveedor de correo (unitarias)', () => {
  const keys = ['EMAIL_MODE', 'EMAIL_PROVIDER', 'RESEND_API_KEY', 'BREVO_API_KEY'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { keys.forEach((k) => (saved[k] = process.env[k])); });
  afterEach(() => { keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))); resetEnvCache(); });

  it('en modo test SIEMPRE usa la consola, aunque se configure un proveedor real (nunca envía correos reales)', () => {
    process.env.EMAIL_MODE = 'test'; process.env.EMAIL_PROVIDER = 'resend'; process.env.RESEND_API_KEY = 'x'; resetEnvCache();
    expect(createEmailProvider()).toBeInstanceOf(ConsoleEmailProvider);
  });
  it('en modo live usa el proveedor configurado', () => {
    process.env.EMAIL_MODE = 'live'; process.env.EMAIL_PROVIDER = 'resend'; process.env.RESEND_API_KEY = 'key'; resetEnvCache();
    expect(createEmailProvider()).toBeInstanceOf(ResendEmailProvider);
  });
  it('modo live sin clave o con consola es una configuración inválida (falla al arrancar)', () => {
    process.env.EMAIL_MODE = 'live'; process.env.EMAIL_PROVIDER = 'resend'; delete process.env.RESEND_API_KEY; resetEnvCache();
    expect(() => createEmailProvider()).toThrow(/RESEND_API_KEY/);
    process.env.EMAIL_PROVIDER = 'console'; resetEnvCache();
    expect(() => createEmailProvider()).toThrow(/EMAIL_PROVIDER/);
  });
});
