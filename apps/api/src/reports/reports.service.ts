import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { todayLocal } from '../common/dates';
import { AuthUser } from '../common/decorators';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_ROWS, REPORTS, REPORT_MAP, ReportDef } from './reports.definitions';
import { PDF_MAX_ROWS, toCsv, toPdf, toXlsx } from './reports.export';
import { ReportFilters, ReportQuery } from './reports.types';

const CONTENT: Record<'xlsx' | 'csv' | 'pdf', string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf',
};

const pickFilters = (q: ReportQuery): ReportFilters => ({
  from: q.from, to: q.to, clientId: q.clientId, technicianId: q.technicianId, categoryId: q.categoryId, typeId: q.typeId, statusId: q.statusId, priority: q.priority,
  responsibleId: q.responsibleId, city: q.city, status: q.status, search: q.search, days: q.days,
});

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Reportes disponibles para el rol del usuario. */
  list(actor: AuthUser) {
    return REPORTS.filter((r) => r.roles.includes(actor.role)).map(({ run: _run, roles: _roles, ...meta }) => meta);
  }

  private def(key: string, actor: AuthUser): ReportDef {
    const d = REPORT_MAP.get(key);
    if (!d) throw new NotFoundException('Reporte no encontrado');
    if (!d.roles.includes(actor.role)) throw new ForbiddenException('No tiene permiso para este reporte');
    return d;
  }

  private async execute(d: ReportDef, q: ReportQuery, actor: AuthUser) {
    const out = await d.run(this.prisma, pickFilters(q), { today: todayLocal(), actor });
    return { ...out, truncated: out.rows.length >= MAX_ROWS };
  }

  async run(key: string, q: ReportQuery, actor: AuthUser) {
    const d = this.def(key, actor);
    const out = await this.execute(d, q, actor);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    return {
      report: { key: d.key, title: d.title, description: d.description, filters: d.filters, dateLabel: d.dateLabel ?? null },
      columns: out.columns, rows: out.rows.slice((page - 1) * pageSize, page * pageSize), totals: out.totals ?? null, total: out.rows.length, page, pageSize,
      truncated: out.truncated, note: out.note ?? null, generatedAt: new Date().toISOString(),
    };
  }

  async export(key: string, q: ReportQuery & { format: 'xlsx' | 'csv' | 'pdf' }, actor: AuthUser, ip?: string) {
    const d = this.def(key, actor);
    const out = await this.execute(d, q, actor);
    const filters = await this.describe(d, pickFilters(q));
    const notes = [out.note, out.truncated ? `Se alcanzó el máximo de ${MAX_ROWS} filas; refine los filtros para ver el resto.` : ''].filter(Boolean).join(' ');
    const input = {
      title: d.title, filters, columns: out.columns, rows: out.rows, totals: out.totals, note: notes || undefined, generatedBy: actor.name,
      generatedAt: new Intl.DateTimeFormat('es-EC', { timeZone: loadEnv().APP_TIMEZONE, dateStyle: 'long', timeStyle: 'short' }).format(new Date()),
    };
    const data = q.format === 'csv' ? toCsv(input) : q.format === 'xlsx' ? await toXlsx(input) : await toPdf(input);
    await this.audit.log({ actorId: actor.id, action: 'report.exported', entity: 'Report', entityId: d.key, metadata: { format: q.format, rows: out.rows.length, filters: Object.fromEntries(Object.entries(pickFilters(q)).filter(([, v]) => v !== undefined)) }, ip });
    return { filename: `${d.key}-${todayLocal()}.${q.format}`, contentType: CONTENT[q.format], data, rows: out.rows.length, pdfLimited: q.format === 'pdf' && out.rows.length > PDF_MAX_ROWS };
  }

  /** Describe los filtros aplicados con nombres legibles (para el encabezado del PDF y la hoja «Filtros» del Excel). */
  private async describe(d: ReportDef, f: ReportFilters): Promise<[string, string][]> {
    const out: [string, string][] = [];
    if (f.from || f.to) out.push([d.dateLabel ?? 'Fechas', `${f.from ?? '…'} a ${f.to ?? '…'}`]);
    if (f.clientId) out.push(['Cliente', (await this.prisma.client.findUnique({ where: { id: f.clientId }, select: { commercialName: true } }))?.commercialName ?? f.clientId]);
    if (f.technicianId) out.push(['Técnico', (await this.prisma.technician.findUnique({ where: { id: f.technicianId }, select: { name: true } }))?.name ?? f.technicianId]);
    if (f.categoryId) out.push(['Categoría', (await this.prisma.systemCategory.findUnique({ where: { id: f.categoryId }, select: { name: true } }))?.name ?? f.categoryId]);
    if (f.typeId) {
      const t = d.filters.includes('maintenanceType') ? await this.prisma.maintenanceType.findUnique({ where: { id: f.typeId } })
        : d.filters.includes('followUpType') ? await this.prisma.followUpType.findUnique({ where: { id: f.typeId } }) : await this.prisma.activityType.findUnique({ where: { id: f.typeId } });
      out.push(['Tipo', t?.name ?? f.typeId]);
    }
    if (f.statusId) out.push(['Estado', (await this.prisma.followUpStatus.findUnique({ where: { id: f.statusId } }))?.name ?? f.statusId]);
    if (f.responsibleId) out.push(['Responsable', (await this.prisma.user.findUnique({ where: { id: f.responsibleId }, select: { name: true } }))?.name ?? f.responsibleId]);
    if (f.priority) out.push(['Prioridad', f.priority]);
    if (f.status) out.push(['Estado', f.status]);
    if (f.city) out.push(['Ciudad', f.city]);
    if (f.search) out.push(['Búsqueda', f.search]);
    if (f.days && d.filters.includes('days')) out.push(['Próximos días', String(f.days)]);
    return out;
  }
}
