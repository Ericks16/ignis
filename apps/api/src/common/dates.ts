import { BadRequestException } from '@nestjs/common';
import { loadEnv } from '../config/env';

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del negocio (America/Guayaquil por defecto). */
export function todayLocal(now: Date = new Date(), timeZone = loadEnv().APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Convierte 'AAAA-MM-DD' en Date UTC a medianoche (columnas DATE, sin desfase). Rechaza fechas imposibles (30 de febrero). */
export function parseDateOnly(v: string): Date {
  const d = new Date(`${v}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new BadRequestException(`Fecha inválida: ${v}`);
  }
  return d;
}

export const toISODate = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}
