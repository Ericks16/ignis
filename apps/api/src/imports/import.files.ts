import ExcelJS from 'exceljs';
import { PlannedRow } from './import.planner';

export interface Issue { row: number; client: string; type: 'Error' | 'Advertencia' | 'Omitida'; message: string }

/** Evita inyección de fórmulas al abrir el reporte en Excel: el texto que empieza con = + - @ se guarda como texto literal. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function issuesOf(rows: PlannedRow[]): Issue[] {
  const out: Issue[] = [];
  for (const r of rows) {
    for (const m of r.errors) out.push({ row: r.rowNumber, client: r.clientName, type: 'Error', message: m });
    for (const m of r.warnings) out.push({ row: r.rowNumber, client: r.clientName, type: 'Advertencia', message: m });
    if (r.status === 'SKIPPED' && r.skipReason && r.skipReason !== 'HEADER') out.push({ row: r.rowNumber, client: r.clientName, type: 'Omitida', message: r.summary });
  }
  return out.slice(0, 5000);
}

/** Reporte descargable (archivo NUEVO; nunca se toca el original del usuario). */
export async function buildReport(fileName: string, issues: Issue[], summary: Record<string, unknown> | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IGNIS Maintenance Manager';
  const ws = wb.addWorksheet('Errores y advertencias');
  ws.columns = [{ header: 'Fila del Excel', key: 'row', width: 14 }, { header: 'Cliente', key: 'client', width: 34 }, { header: 'Tipo', key: 'type', width: 14 }, { header: 'Detalle', key: 'message', width: 100 }];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const i of issues) ws.addRow({ row: i.row, client: safeCell(i.client), type: i.type, message: safeCell(i.message) });
  ws.autoFilter = { from: 'A1', to: 'D1' };
  const rs = wb.addWorksheet('Resumen');
  rs.columns = [{ header: 'Concepto', key: 'k', width: 40 }, { header: 'Valor', key: 'v', width: 16 }];
  rs.getRow(1).font = { bold: true };
  rs.addRow({ k: 'Archivo', v: safeCell(fileName) });
  for (const [k, v] of Object.entries(summary ?? {})) if (typeof v === 'number') rs.addRow({ k, v });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface TemplateCatalogs {
  categories: string[]; equipmentTypes: { name: string; code: string | null }[]; followUpTypes: string[]; maintenanceTypes: string[];
}

/** Plantilla oficial: mismas columnas que el Excel de IGNIS más RUC, ciudad y correos; las columnas de dispositivos salen del catálogo. */
export async function buildTemplate(c: TemplateCatalogs): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IGNIS Maintenance Manager';
  const ws = wb.addWorksheet('CARTERA');
  const fixed = ['ESTADO', 'Cliente', 'RUC', 'Ciudad', 'Correo del cliente', 'Instalación / sede', 'Persona a cargo', 'Correo del contacto', 'CENTRAL', 'FECHA MTO', 'Proximo MTO', 'SEGUIMIENTO'];
  const headers = [...fixed, ...c.equipmentTypes.map((t) => t.name)];
  ws.addRow(headers);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = i < fixed.length ? [12, 34, 16, 16, 28, 24, 24, 28, 28, 14, 14, 36][i] : 12; });
  ws.getColumn(10).numFmt = 'yyyy-mm-dd';
  ws.getColumn(11).numFmt = 'yyyy-mm-dd';
  for (let r = 2; r <= 1000; r++) ws.getCell(r, 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"INSTALADO,MTTO"'], showErrorMessage: true, errorTitle: 'Estado', error: 'Use INSTALADO o MTTO' };

  const ins = wb.addWorksheet('INSTRUCCIONES');
  ins.getColumn(1).width = 110;
  [
    'PLANTILLA OFICIAL DE IMPORTACIÓN — IGNIS Maintenance Manager',
    '',
    '1. Una fila por cliente + instalación/sede + sistema (central). No cambie los nombres de las columnas.',
    '2. Obligatorio: Cliente. Si no indica «Instalación / sede» se usará «Principal».',
    '3. ESTADO: INSTALADO o MTTO. Para clientes perdidos, ponga una fila con el texto «CLIENTES PERDIDOS» antes de ellos (se importan como inactivos).',
    '4. Fechas: AAAA-MM-DD (o DD/MM/AAAA). FECHA MTO = último mantenimiento (se guarda como historial). Proximo MTO = fecha del siguiente (si ya pasó, la pantalla de importación le pedirá qué hacer).',
    '5. CENTRAL: una categoría del catálogo (hoja CATÁLOGOS) o el modelo de la central (p. ej. BOSCH FPA 1000).',
    '6. Columnas de dispositivos: cantidad (número entero). Deje vacío o 0 si no hay.',
    '7. RUC: 10 o 13 dígitos. Correos: formato válido. Los contactos no reciben recordatorios hasta que se active en el sistema.',
    '8. La importación nunca borra ni modifica registros existentes: reutiliza clientes/instalaciones/sistemas que ya existan y solo agrega lo que falta.',
    '9. Antes de importar verá una vista previa con errores y advertencias, y deberá confirmar.',
  ].forEach((t, i) => { const r = ins.addRow([t]); if (i === 0) r.font = { bold: true, size: 13 }; r.alignment = { wrapText: true }; });

  const cat = wb.addWorksheet('CATÁLOGOS');
  cat.columns = [{ header: 'Categorías de sistema', width: 40 }, { header: 'Tipos de dispositivo (columnas)', width: 36 }, { header: 'Código', width: 20 }, { header: 'Tipos de seguimiento', width: 30 }, { header: 'Tipos de mantenimiento', width: 28 }];
  cat.getRow(1).font = { bold: true };
  const n = Math.max(c.categories.length, c.equipmentTypes.length, c.followUpTypes.length, c.maintenanceTypes.length);
  for (let i = 0; i < n; i++) cat.addRow([c.categories[i] ?? null, c.equipmentTypes[i]?.name ?? null, c.equipmentTypes[i]?.code ?? null, c.followUpTypes[i] ?? null, c.maintenanceTypes[i] ?? null]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
