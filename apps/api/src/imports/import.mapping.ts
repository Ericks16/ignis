import { z } from 'zod';
import { normalizeName } from '../common/helpers';
import { CellValue, display } from './excel.reader';

/** Texto comparable: sin acentos, minúsculas, solo letras y números separados por un espacio. */
export const norm = (s: string) => normalizeName(s).replace(/[^a-z0-9]+/g, ' ').trim();

export const FIELDS = ['status', 'client', 'installation', 'contact', 'central', 'lastMaintenance', 'nextMaintenance', 'followUp', 'ruc', 'clientEmail', 'contactEmail', 'city'] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  status: 'Estado (INSTALADO / MTTO)', client: 'Cliente *', installation: 'Instalación / sede', contact: 'Persona a cargo', central: 'Central / tipo de sistema',
  lastMaintenance: 'Fecha del último mantenimiento', nextMaintenance: 'Fecha del próximo mantenimiento', followUp: 'Seguimiento (texto)', ruc: 'RUC', clientEmail: 'Correo del cliente',
  contactEmail: 'Correo del contacto', city: 'Ciudad',
};

/** Encabezados que se reconocen automáticamente para cada campo (ya normalizados con `norm`). */
const HEADER_ALIASES: Record<Field, string[]> = {
  status: ['estado', 'relacion'],
  client: ['cliente', 'nombre comercial', 'razon social', 'empresa'],
  installation: ['direccion', 'sede', 'instalacion', 'sucursal', 'instalacion sede', 'ubicacion'],
  contact: ['persona a cargo', 'contacto', 'persona de contacto', 'responsable'],
  central: ['central', 'tipo de central', 'sistema', 'tipo de sistema'],
  lastMaintenance: ['fecha mto', 'fecha mtto', 'fecha mantenimiento', 'ultimo mantenimiento', 'ultimo mto', 'fecha ultimo mantenimiento'],
  nextMaintenance: ['proximo mto', 'prox mto', 'proximo mtto', 'proximo mantenimiento', 'fecha proximo mantenimiento'],
  followUp: ['seguimiento', 'observaciones seguimiento'],
  ruc: ['ruc', 'ruc cedula', 'cedula'],
  clientEmail: ['correo del cliente', 'correo cliente', 'email cliente', 'correo', 'email'],
  contactEmail: ['correo del contacto', 'correo contacto', 'email contacto'],
  city: ['ciudad'],
};

/** Encabezados del Excel de IGNIS (o variantes) que no coinciden con el nombre/código del catálogo. */
const EQUIPMENT_ALIASES: Record<string, string> = {
  dh: 'DH', dt: 'DT', em: 'EM', espansores: 'EXPANSOR', expansores: 'EXPANSOR', mrelay: 'M_RELAY', lamparas: 'LAMPARA', rociadores: 'ROCIADOR',
  'detector humo': 'DH', 'detector de humo': 'DH', 'detector termico': 'DT', 'estacion manual': 'EM', 'luz estrob': 'LUZ_ESTROB', 'luz estroboscopica': 'LUZ_ESTROB',
};

/** Columnas que se ignoran a propósito (totales calculados, etc.). */
const IGNORED_HEADERS = new Set(['cant disp', 'cantidad dispositivos', 'total dispositivos', 'total']);

export interface EquipmentTypeRef { id: string; name: string; code: string | null }

export interface HeaderGuess {
  columns: Partial<Record<Field, number>>;
  equipment: { column: number; header: string; typeId: string }[];
  ignored: { column: number; header: string }[];
  unrecognized: { column: number; header: string }[];
}

/** Sugiere el mapeo de columnas a partir de los encabezados (columnas numeradas desde 1). */
export function guessMapping(headers: CellValue[], types: EquipmentTypeRef[]): HeaderGuess {
  const out: HeaderGuess = { columns: {}, equipment: [], ignored: [], unrecognized: [] };
  const byKey = new Map<string, string>();
  for (const t of types) {
    byKey.set(norm(t.name), t.id);
    if (t.code) byKey.set(norm(t.code.replace(/_/g, ' ')), t.id);
  }
  const byCode = new Map(types.filter((t) => t.code).map((t) => [t.code!, t.id]));
  headers.forEach((h, i) => {
    const text = display(h);
    if (!text) return;
    const n = norm(text);
    const col = i + 1;
    const field = FIELDS.find((f) => !out.columns[f] && HEADER_ALIASES[f].includes(n));
    if (field) { out.columns[field] = col; return; }
    if (IGNORED_HEADERS.has(n)) { out.ignored.push({ column: col, header: text }); return; }
    const typeId = byKey.get(n) ?? (EQUIPMENT_ALIASES[n] ? byCode.get(EQUIPMENT_ALIASES[n]) : undefined);
    if (typeId && !out.equipment.some((e) => e.typeId === typeId)) { out.equipment.push({ column: col, header: text, typeId }); return; }
    out.unrecognized.push({ column: col, header: text });
  });
  return out;
}

/** Fila de encabezados más probable: la que más columnas reconoce entre las primeras 25. */
export function guessHeaderRow(rows: CellValue[][], types: EquipmentTypeRef[]): number {
  let best = 1;
  let bestScore = -1;
  rows.slice(0, 25).forEach((row, i) => {
    const g = guessMapping(row, types);
    const score = Object.keys(g.columns).length * 2 + g.equipment.length;
    if (score > bestScore) { bestScore = score; best = i + 1; }
  });
  return best;
}

// ---- Configuración de la importación (validada con zod; el cuerpo llega del navegador) ----
const col = z.number().int().min(1).max(80);
export const importConfigSchema = z.object({
  sheet: z.string().min(1).max(100),
  headerRow: z.number().int().min(1).max(200),
  columns: z.object({
    status: col.optional(), client: col, installation: col.optional(), contact: col.optional(), central: col.optional(), lastMaintenance: col.optional(),
    nextMaintenance: col.optional(), followUp: col.optional(), ruc: col.optional(), clientEmail: col.optional(), contactEmail: col.optional(), city: col.optional(),
  }).strict(),
  equipment: z.array(z.object({ column: col, typeId: z.string().uuid() })).max(60).default([]),
  options: z.object({
    /** Próximo mantenimiento ya vencido al importar: HISTORICAL = se guarda como dato sin crear mantenimiento ni recordatorios (recomendado); SCHEDULE = crea un mantenimiento vencido que generará avisos; IGNORE = se descarta. */
    overdueNext: z.enum(['HISTORICAL', 'SCHEDULE', 'IGNORE']).default('HISTORICAL'),
    /** Filas sin central: DEFAULT = crea un sistema genérico en la categoría por defecto; SKIP_SYSTEM = no crea sistema (ni fechas). */
    blankCentral: z.enum(['DEFAULT', 'SKIP_SYSTEM']).default('DEFAULT'),
    detectLostSection: z.boolean().default(true),
    importHistory: z.boolean().default(true),
    importFollowUps: z.boolean().default(true),
    defaultCategoryId: z.string().uuid(),
    defaultMaintenanceTypeId: z.string().uuid(),
    followUpTypeId: z.string().uuid(),
  }),
  /** Decisión por valor distinto de «Central» (clave = texto normalizado). */
  centralMap: z.record(z.string(), z.object({ categoryId: z.string().uuid(), brand: z.string().max(80).nullish(), model: z.string().max(120).nullish() })).default({}),
  /** Ajustes por fila de Excel: renombrar el cliente (p. ej. fusionar duplicados) u omitir la fila. */
  overrides: z.record(z.string().regex(/^\d+$/), z.object({ clientName: z.string().min(2).max(150).optional(), skip: z.boolean().optional() })).default({}),
});
export type ImportConfig = z.infer<typeof importConfigSchema>;
