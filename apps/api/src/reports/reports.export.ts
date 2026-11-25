import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { safeCell } from '../imports/import.files';
import { Cell, ReportColumn, Row } from './reports.types';

export interface ExportInput { title: string; filters: [string, string][]; columns: ReportColumn[]; rows: Row[]; totals?: Row; generatedAt: string; generatedBy: string; note?: string }

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: Cell, type: ReportColumn['type']): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return type === 'number' ? v.toLocaleString('es-EC') : String(v);
  return v;
};

// ---------- CSV (UTF-8 con BOM para que Excel respete tildes y eñes) ----------
export function toCsv({ columns, rows, totals }: ExportInput): Buffer {
  const esc = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // evita ejecutar fórmulas al abrir en Excel
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const line = (r: Row) => columns.map((c) => (typeof r[c.key] === 'number' ? String(r[c.key]) : esc(String(r[c.key] ?? '')))).join(',');
  const out = [columns.map((c) => esc(c.label)).join(','), ...rows.map(line), ...(totals ? [line(totals)] : [])];
  return Buffer.from('﻿' + out.join('\r\n') + '\r\n', 'utf8');
}

// ---------- Excel ----------
export async function toXlsx(inp: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IGNIS Maintenance Manager';
  wb.created = new Date();
  const ws = wb.addWorksheet(inp.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Reporte');
  ws.columns = inp.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(c.label.length + 3, c.width ?? 14) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  const toCell = (c: ReportColumn, v: Cell): ExcelJS.CellValue => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (c.type === 'date' && isoDate.test(v)) return new Date(`${v}T00:00:00Z`);
    return safeCell(v);
  };
  const add = (r: Row) => ws.addRow(inp.columns.map((c) => toCell(c, r[c.key])));
  inp.rows.forEach(add);
  inp.columns.forEach((c, i) => { if (c.type === 'date') ws.getColumn(i + 1).numFmt = 'yyyy-mm-dd'; });
  if (inp.totals) { const t = add(inp.totals); t.font = { bold: true }; t.border = { top: { style: 'thin' } }; }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (inp.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: inp.columns.length } };

  const info = wb.addWorksheet('Filtros');
  info.columns = [{ width: 28 }, { width: 60 }];
  const rowsInfo: [string, string][] = [['Reporte', inp.title], ['Generado', inp.generatedAt], ['Generado por', inp.generatedBy], ['Filas', String(inp.rows.length)], ...inp.filters, ...(inp.note ? ([['Nota', inp.note]] as [string, string][]) : [])];
  rowsInfo.forEach(([k, v]) => { const r = info.addRow([k, safeCell(v)]); r.getCell(1).font = { bold: true }; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- PDF (tabla horizontal A4 con encabezado repetido y paginación) ----------
export const PDF_MAX_ROWS = 3000;

export function toPdf(inp: ExportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true, info: { Title: inp.title, Author: 'IGNIS Maintenance Manager' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const usable = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - 38;
    const fontSize = inp.columns.length > 10 ? 6.5 : inp.columns.length > 7 ? 7.2 : 8.2;
    const lineH = fontSize * 1.25;

    // Anchos proporcionales al contenido (con topes), para que las columnas largas tengan más espacio.
    const sample = inp.rows.slice(0, 200);
    const weights = inp.columns.map((c) => {
      const avg = sample.length ? sample.reduce((a, r) => a + text(r[c.key], c.type).length, 0) / sample.length : 8;
      return Math.min(32, Math.max(7, c.label.length * 0.8, avg));
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * usable);

    doc.fillColor('#0b2545').font('Helvetica-Bold').fontSize(15).text('IGNIS', left, 28, { continued: true }).fillColor('#64748b').font('Helvetica').fontSize(9).text('  Maintenance Manager');
    doc.moveDown(0.3).fillColor('#0b2545').font('Helvetica-Bold').fontSize(13).text(inp.title);
    const meta = [`Generado el ${inp.generatedAt} por ${inp.generatedBy}`, ...inp.filters.map(([k, v]) => `${k}: ${v}`)].join('   ·   ');
    doc.moveDown(0.2).fillColor('#475569').font('Helvetica').fontSize(8).text(meta, { width: usable });
    doc.moveDown(0.6);

    let y = doc.y;
    const header = () => {
      doc.font('Helvetica-Bold').fontSize(fontSize);
      const h = Math.max(...inp.columns.map((c, i) => doc.heightOfString(c.label, { width: widths[i] - 6 }))) + 6;
      doc.rect(left, y, usable, h).fill('#0b2545');
      let x = left;
      inp.columns.forEach((c, i) => { doc.fillColor('#ffffff').text(c.label, x + 3, y + 3, { width: widths[i] - 6 }); x += widths[i]; });
      y += h;
    };
    const drawRow = (r: Row, i: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const cells = inp.columns.map((c) => text(r[c.key], c.type));
      const h = Math.min(lineH * 3, Math.max(...cells.map((t, k) => doc.heightOfString(t, { width: widths[k] - 6 })))) + 6;
      if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top; header(); }
      if (i % 2 === 1 && !bold) doc.rect(left, y, usable, h).fill('#f1f5f9');
      let x = left;
      cells.forEach((t, k) => {
        const right = inp.columns[k].type === 'number';
        doc.fillColor('#0f172a').text(t, x + 3, y + 3, { width: widths[k] - 6, height: lineH * 3, ellipsis: true, align: right ? 'right' : 'left' });
        x += widths[k];
      });
      y += h;
    };
    header();
    const shown = inp.rows.slice(0, PDF_MAX_ROWS);
    shown.forEach((r, i) => drawRow(r, i));
    if (inp.totals) drawRow(inp.totals, 0, true);
    if (!shown.length) { doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('No hay datos para los filtros seleccionados.', left, y + 8); }
    const notes = [inp.note, inp.rows.length > PDF_MAX_ROWS ? `El PDF muestra las primeras ${PDF_MAX_ROWS} de ${inp.rows.length} filas; use Excel para el reporte completo.` : ''].filter(Boolean);
    if (notes.length) { y += 8; doc.fillColor('#b45309').font('Helvetica-Oblique').fontSize(8).text(notes.join(' '), left, y, { width: usable }); }

    // Pie con número de página (se escribe fuera del margen inferior: se desactiva temporalmente para no generar páginas nuevas).
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      const mb = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(`IGNIS Maintenance Manager · ${inp.title} · Página ${p + 1} de ${range.count}`, left, doc.page.height - 22, { width: usable, align: 'center', lineBreak: false });
      doc.page.margins.bottom = mb;
    }
    doc.end();
  });
}
