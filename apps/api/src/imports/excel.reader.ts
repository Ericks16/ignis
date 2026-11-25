import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export type CellValue = string | number | Date | null;
export interface SheetGrid { name: string; rows: CellValue[][]; rowCount: number; colCount: number }
export interface SheetInfo { name: string; rows: number; cols: number }

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_COLS = 80;

/** Valida firma ZIP ("PK") y tamaño; un .xlsx es un ZIP. No confía en la extensión ni en el MIME enviados por el navegador. */
export function assertXlsxBuffer(buf: Buffer, originalName: string) {
  if (!/\.xlsx$/i.test(originalName)) throw new BadRequestException('Solo se admiten archivos .xlsx');
  if (buf.length === 0) throw new BadRequestException('El archivo está vacío');
  if (buf.length > MAX_FILE_BYTES) throw new BadRequestException('El archivo supera el máximo de 10 MB');
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) throw new BadRequestException('El archivo no es un libro de Excel (.xlsx) válido');
  assertZipSafe(buf);
}

/** Límites del contenido descomprimido de un .xlsx (un archivo pequeño puede declarar gigabytes al descomprimirse). */
export const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2000;

/**
 * Inspecciona el directorio central del ZIP SIN descomprimir nada y rechaza archivos con demasiadas entradas o con un
 * tamaño descomprimido declarado excesivo (protege la memoria del servidor antes de que ExcelJS lo abra).
 */
export function assertZipSafe(buf: Buffer) {
  const bad = () => new BadRequestException('El archivo no es un libro de Excel (.xlsx) válido');
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad();
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (entries > MAX_ZIP_ENTRIES) throw new BadRequestException('El archivo contiene demasiados elementos internos');
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) throw bad();
    const size = buf.readUInt32LE(offset + 24);
    total += size;
    if (size === 0xffffffff || total > MAX_UNCOMPRESSED_BYTES) throw new BadRequestException('El archivo es demasiado grande al descomprimirse');
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
}

export async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    // El archivo se lee en memoria; nunca se escribe ni se modifica el original.
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo: está dañado o no es un .xlsx válido');
  }
  return wb;
}

/** Resuelve el valor visible de una celda (fórmulas → resultado, texto enriquecido → texto, hipervínculos → texto). */
export function cellValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim() || null;
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  const o = v as unknown as Record<string, unknown>;
  if ('result' in o) return cellValue(o.result as ExcelJS.CellValue);
  if ('formula' in o || 'sharedFormula' in o) return null; // fórmula sin resultado guardado (p. ej. con #REF)
  if (Array.isArray(o.richText)) return cellValue((o.richText as { text: string }[]).map((r) => r.text).join(''));
  if (typeof o.text === 'string') return cellValue(o.text);
  if ('error' in o) return null;
  return null;
}

export function sheetInfos(wb: ExcelJS.Workbook): SheetInfo[] {
  return wb.worksheets.map((ws) => ({ name: ws.name, rows: Math.min(ws.rowCount, MAX_ROWS), cols: Math.min(ws.columnCount, MAX_COLS) }));
}

/** Matriz rectangular con los valores de la hoja (fila 1 = índice 0). */
export function readSheet(wb: ExcelJS.Workbook, name: string, maxRows = MAX_ROWS): SheetGrid {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new BadRequestException(`No existe la hoja «${name}»`);
  if (ws.rowCount > MAX_ROWS) throw new BadRequestException(`La hoja «${name}» tiene más de ${MAX_ROWS} filas; divídala en archivos más pequeños`);
  const rowCount = Math.min(ws.rowCount, maxRows);
  const colCount = Math.min(ws.columnCount, MAX_COLS);
  const rows: CellValue[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const out: CellValue[] = [];
    for (let c = 1; c <= colCount; c++) out.push(cellValue(row.getCell(c).value));
    rows.push(out);
  }
  return { name, rows, rowCount: ws.rowCount, colCount };
}

/** Texto de una celda para mostrar (las fechas se muestran AAAA-MM-DD). */
export function display(v: CellValue): string {
  if (v === null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
