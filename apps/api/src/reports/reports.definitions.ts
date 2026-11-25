import { BadRequestException } from '@nestjs/common';
import { MaintenanceStatus, Prisma, Role } from '@prisma/client';
import { addDays, parseDateOnly, toISODate } from '../common/dates';
import { activityScope, followUpScope, maintenanceScope } from '../common/scopes';
import { loadEnv } from '../config/env';
import { OPEN } from '../maintenance/maintenance.rules';
import { PrismaService } from '../prisma/prisma.service';
import { Cell, ReportColumn, ReportContext, ReportFilters, ReportMeta, ReportOutput, Row } from './reports.types';

export interface ReportDef extends ReportMeta { run: (db: PrismaService, f: ReportFilters, ctx: ReportContext) => Promise<ReportOutput> }

/** Tope de filas por reporte (protege al servidor; las exportaciones avisan si se alcanza). */
export const MAX_ROWS = 20_000;

const ALL = [Role.ADMIN, Role.OPERATIVO, Role.CONSULTA, Role.TECNICO];
const STAFF = [Role.ADMIN, Role.OPERATIVO, Role.CONSULTA];

const iso = (d?: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const dtLocal = (d?: Date | null): string | null =>
  d ? new Intl.DateTimeFormat('sv-SE', { timeZone: loadEnv().APP_TIMEZONE, dateStyle: 'short', timeStyle: 'short' }).format(d) : null;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const M_LABEL: Record<MaintenanceStatus, string> = {
  PROGRAMADO: 'Programado', PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', REPROGRAMADO: 'Reprogramado',
};
const PRIORITY: Record<string, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
const REL: Record<string, string> = { INSTALADO: 'Instalado', MTTO: 'Mantenimiento' };
const OP: Record<string, string> = { OPERATIVO: 'Operativo', CON_FALLAS: 'Con fallas', FUERA_DE_SERVICIO: 'Fuera de servicio' };
const ENTITY: Record<string, string> = { ACTIVE: 'Activo', INACTIVE: 'Inactivo' };

const col = (key: string, label: string, type: ReportColumn['type'] = 'text', width?: number): ReportColumn => ({ key, label, type, width });

function dateRange(f: ReportFilters) {
  const gte = f.from ? parseDateOnly(f.from) : undefined;
  const lte = f.to ? parseDateOnly(f.to) : undefined;
  if (gte && lte && lte < gte) throw new BadRequestException('La fecha «hasta» no puede ser anterior a «desde»');
  return { gte, lte, any: !!(gte || lte) };
}
const between = (r: { gte?: Date; lte?: Date }) => ({ ...(r.gte ? { gte: r.gte } : {}), ...(r.lte ? { lte: r.lte } : {}) });

function sumTotals(rows: Row[], keys: string[], labelKey: string): Row {
  const t: Row = { [labelKey]: 'TOTAL' };
  for (const k of keys) t[k] = rows.reduce((a, r) => a + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  return t;
}

// ================= Mantenimientos =================
const MAINT_INCLUDE = {
  type: { select: { name: true } },
  technicians: { select: { technician: { select: { name: true } } } },
  system: { select: { brand: true, model: true, category: { select: { name: true } }, installation: { select: { name: true, client: { select: { commercialName: true } } } } } },
} satisfies Prisma.MaintenanceInclude;
type MaintRow = Prisma.MaintenanceGetPayload<{ include: typeof MAINT_INCLUDE }>;

function maintWhere(f: ReportFilters, ctx: ReportContext, dateField: 'scheduledDate' | 'executedDate', extra: Prisma.MaintenanceWhereInput[]): Prisma.MaintenanceWhereInput {
  const r = dateRange(f);
  const and: Prisma.MaintenanceWhereInput[] = [maintenanceScope(ctx.actor), ...extra];
  if (r.any) and.push({ [dateField]: between(r) });
  if (f.clientId) and.push({ system: { installation: { clientId: f.clientId } } });
  if (f.categoryId) and.push({ system: { categoryId: f.categoryId } });
  if (f.typeId) and.push({ typeId: f.typeId });
  if (f.technicianId) and.push({ technicians: { some: { technicianId: f.technicianId } } });
  return { AND: and };
}

const MAINT_COLS = {
  scheduled: col('scheduled', 'Fecha programada', 'date'), executed: col('executed', 'Fecha de ejecución', 'date'), client: col('client', 'Cliente', 'text', 28),
  installation: col('installation', 'Instalación', 'text', 22), category: col('category', 'Sistema', 'text', 24), model: col('model', 'Marca / modelo', 'text', 20),
  type: col('type', 'Tipo', 'text', 14), technicians: col('technicians', 'Técnicos', 'text', 24), status: col('status', 'Estado', 'text', 12),
  situation: col('situation', 'Situación', 'text', 12), daysLate: col('daysLate', 'Días de atraso', 'number'), daysLeft: col('daysLeft', 'Días restantes', 'number'),
  next: col('next', 'Próximo mantenimiento', 'date'), result: col('result', 'Resultado', 'text', 30), description: col('description', 'Trabajo', 'text', 30),
};

function maintRow(m: MaintRow, today: string): Row {
  const sched = toISODate(m.scheduledDate);
  const open = OPEN.includes(m.status);
  const late = open && sched < today ? daysBetween(sched, today) : null;
  return {
    scheduled: sched, executed: iso(m.executedDate), client: m.system.installation.client.commercialName, installation: m.system.installation.name, category: m.system.category.name,
    model: [m.system.brand, m.system.model].filter(Boolean).join(' ') || null, type: m.type.name, technicians: m.technicians.map((t) => t.technician.name).join(', ') || null,
    status: M_LABEL[m.status], situation: !open ? null : late !== null ? 'Vencido' : daysBetween(today, sched) <= 30 ? 'Próximo' : 'Programado',
    daysLate: late, daysLeft: open && late === null ? daysBetween(today, sched) : null, next: iso(m.nextMaintenanceDate), result: m.result, description: m.description,
  };
}

async function maintReport(db: PrismaService, f: ReportFilters, ctx: ReportContext, o: { where: Prisma.MaintenanceWhereInput[]; dateField: 'scheduledDate' | 'executedDate'; order: 'asc' | 'desc'; cols: (keyof typeof MAINT_COLS)[] }): Promise<ReportOutput> {
  const rows = await db.maintenance.findMany({ where: maintWhere(f, ctx, o.dateField, o.where), include: MAINT_INCLUDE, orderBy: [{ [o.dateField]: o.order }, { createdAt: 'asc' }], take: MAX_ROWS });
  return { columns: o.cols.map((k) => MAINT_COLS[k]), rows: rows.map((m) => maintRow(m, ctx.today)) };
}

// ================= Seguimientos =================
const FU_INCLUDE = {
  client: { select: { commercialName: true } }, installation: { select: { name: true } }, type: { select: { name: true } }, status: { select: { name: true, isTerminal: true } },
  responsible: { select: { name: true } }, completedBy: { select: { name: true } },
} satisfies Prisma.FollowUpInclude;
type FuRow = Prisma.FollowUpGetPayload<{ include: typeof FU_INCLUDE }>;

function fuWhere(f: ReportFilters, ctx: ReportContext, dateField: 'targetDate' | 'completedAt', extra: Prisma.FollowUpWhereInput[]): Prisma.FollowUpWhereInput {
  const and: Prisma.FollowUpWhereInput[] = [followUpScope(ctx.actor), ...extra];
  if (dateField === 'completedAt') {
    // La fecha de finalización es un instante: se compara contra el día completo en la zona horaria del negocio.
    const gte = f.from ? new Date(`${f.from}T00:00:00-05:00`) : undefined;
    const lte = f.to ? new Date(`${f.to}T23:59:59.999-05:00`) : undefined;
    if (gte && lte && lte < gte) throw new BadRequestException('La fecha «hasta» no puede ser anterior a «desde»');
    if (gte || lte) and.push({ completedAt: between({ gte, lte }) });
  } else {
    const r = dateRange(f);
    if (r.any) and.push({ targetDate: between(r) });
  }
  if (f.clientId) and.push({ clientId: f.clientId });
  if (f.typeId) and.push({ typeId: f.typeId });
  if (f.statusId) and.push({ statusId: f.statusId });
  if (f.priority) and.push({ priority: f.priority as 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE' });
  if (f.responsibleId) and.push({ responsibleId: f.responsibleId });
  if (f.technicianId) and.push({ technicians: { some: { technicianId: f.technicianId } } });
  if (f.search) and.push({ OR: [{ title: { contains: f.search, mode: 'insensitive' } }, { client: { commercialName: { contains: f.search, mode: 'insensitive' } } }] });
  return { AND: and };
}

const FU_COLS = {
  title: col('title', 'Seguimiento', 'text', 34), client: col('client', 'Cliente', 'text', 26), installation: col('installation', 'Instalación', 'text', 20), type: col('type', 'Tipo', 'text', 18),
  status: col('status', 'Estado', 'text', 18), priority: col('priority', 'Prioridad', 'text', 10), responsible: col('responsible', 'Responsable', 'text', 18), start: col('start', 'Inicio', 'date'),
  target: col('target', 'Fecha objetivo', 'date'), situation: col('situation', 'Situación', 'text', 12), daysLate: col('daysLate', 'Días de atraso', 'number'), nextAction: col('nextAction', 'Próxima acción', 'text', 28),
  completedAt: col('completedAt', 'Finalizado el', 'datetime'), completedBy: col('completedBy', 'Finalizado por', 'text', 18), daysOpen: col('daysOpen', 'Días en gestión', 'number'),
};

function fuRow(r: FuRow, today: string): Row {
  const target = r.targetDate ? toISODate(r.targetDate) : null;
  const open = !r.status.isTerminal;
  const late = open && target && target < today ? daysBetween(target, today) : null;
  const startIso = toISODate(r.startDate);
  const endIso = r.completedAt ? r.completedAt.toISOString().slice(0, 10) : today;
  return {
    title: r.title, client: r.client.commercialName, installation: r.installation?.name ?? null, type: r.type.name, status: r.status.name, priority: PRIORITY[r.priority],
    responsible: r.responsible?.name ?? null, start: startIso, target, situation: !open ? null : late !== null ? 'Vencido' : !target ? 'Sin fecha' : daysBetween(today, target) <= 30 ? 'Por vencer' : 'En plazo',
    daysLate: late, nextAction: r.nextAction, completedAt: dtLocal(r.completedAt), completedBy: r.completedBy?.name ?? null, daysOpen: Math.max(0, daysBetween(startIso, endIso)),
  };
}

async function fuReport(db: PrismaService, f: ReportFilters, ctx: ReportContext, o: { where: Prisma.FollowUpWhereInput[]; dateField: 'targetDate' | 'completedAt'; cols: (keyof typeof FU_COLS)[]; order: Prisma.FollowUpOrderByWithRelationInput[] }): Promise<ReportOutput> {
  const rows = await db.followUp.findMany({ where: fuWhere(f, ctx, o.dateField, o.where), include: FU_INCLUDE, orderBy: o.order, take: MAX_ROWS });
  return { columns: o.cols.map((k) => FU_COLS[k]), rows: rows.map((r) => fuRow(r, ctx.today)) };
}

const todayD = (ctx: ReportContext) => parseDateOnly(ctx.today);

// ================= Definiciones =================
export const REPORTS: ReportDef[] = [
  {
    key: 'clients', title: 'Clientes', group: 'Clientes y sistemas', description: 'Cartera de clientes con sus instalaciones, sistemas y pendientes.', filters: ['entityStatus', 'city', 'search'], roles: STAFF,
    async run(db, f, ctx) {
      const clients = await db.client.findMany({
        where: { ...(f.status === 'ACTIVE' || f.status === 'INACTIVE' ? { status: f.status } : {}), ...(f.city ? { city: { equals: f.city, mode: 'insensitive' } } : {}),
          ...(f.search ? { OR: [{ commercialName: { contains: f.search, mode: 'insensitive' } }, { ruc: { contains: f.search } }, { email: { contains: f.search, mode: 'insensitive' } }] } : {}) },
        orderBy: { commercialName: 'asc' }, take: MAX_ROWS,
        include: { installations: { select: { systems: { select: { id: true, status: true } } } }, contacts: { where: { active: true }, select: { id: true } } },
      });
      const open = await db.followUp.groupBy({ by: ['clientId'], where: { status: { isTerminal: false } }, _count: { _all: true } });
      const overdueM = await db.maintenance.findMany({ where: { status: { in: OPEN }, scheduledDate: { lt: todayD(ctx) } }, select: { system: { select: { installation: { select: { clientId: true } } } } } });
      const od = new Map<string, number>();
      for (const m of overdueM) od.set(m.system.installation.clientId, (od.get(m.system.installation.clientId) ?? 0) + 1);
      return {
        columns: [col('name', 'Cliente', 'text', 30), col('ruc', 'RUC'), col('city', 'Ciudad'), col('province', 'Provincia'), col('phone', 'Teléfono'), col('email', 'Correo', 'text', 26), col('status', 'Estado'),
          col('installations', 'Instalaciones', 'number'), col('systems', 'Sistemas activos', 'number'), col('contacts', 'Contactos', 'number'), col('overdue', 'Mantenimientos vencidos', 'number'), col('openFollowUps', 'Seguimientos abiertos', 'number'), col('created', 'Creado', 'date')],
        rows: clients.map((c) => ({
          name: c.commercialName, ruc: c.ruc, city: c.city, province: c.province, phone: c.phone, email: c.email, status: ENTITY[c.status], installations: c.installations.length,
          systems: c.installations.reduce((a, i) => a + i.systems.filter((s) => s.status === 'ACTIVE').length, 0), contacts: c.contacts.length, overdue: od.get(c.id) ?? 0,
          openFollowUps: open.find((o) => o.clientId === c.id)?._count._all ?? 0, created: iso(c.createdAt),
        })),
      };
    },
  },
  {
    key: 'systems', title: 'Sistemas instalados', group: 'Clientes y sistemas', description: 'Todos los sistemas registrados con su estado, fechas de mantenimiento y dispositivos.', filters: ['client', 'category', 'entityStatus', 'search'], roles: STAFF,
    async run(db, f) {
      const rows = await db.installedSystem.findMany({
        where: { AND: [f.clientId ? { installation: { clientId: f.clientId } } : {}, f.categoryId ? { categoryId: f.categoryId } : {}, f.status === 'ACTIVE' || f.status === 'INACTIVE' ? { status: f.status } : {},
          f.search ? { OR: [{ brand: { contains: f.search, mode: 'insensitive' } }, { model: { contains: f.search, mode: 'insensitive' } }, { serialNumber: { contains: f.search, mode: 'insensitive' } }, { installation: { client: { commercialName: { contains: f.search, mode: 'insensitive' } } } }] } : {}] },
        orderBy: [{ installation: { client: { commercialName: 'asc' } } }, { installation: { name: 'asc' } }], take: MAX_ROWS,
        include: { category: { select: { name: true } }, responsible: { select: { name: true } }, installation: { select: { name: true, client: { select: { commercialName: true } } } }, equipment: { where: { active: true }, select: { quantity: true } } },
      });
      return {
        columns: [col('client', 'Cliente', 'text', 28), col('installation', 'Instalación', 'text', 22), col('category', 'Categoría', 'text', 24), col('brand', 'Marca'), col('model', 'Modelo', 'text', 18), col('serial', 'N.º de serie'),
          col('operational', 'Estado operativo'), col('relation', 'Relación'), col('installed', 'Instalado', 'date'), col('last', 'Último mantenimiento', 'date'), col('next', 'Próximo mantenimiento', 'date'),
          col('responsible', 'Responsable'), col('devices', 'Dispositivos', 'number'), col('status', 'Estado')],
        rows: rows.map((s) => ({
          client: s.installation.client.commercialName, installation: s.installation.name, category: s.category.name, brand: s.brand, model: s.model, serial: s.serialNumber, operational: OP[s.operationalStatus],
          relation: s.relation ? REL[s.relation] : null, installed: iso(s.installedAt), last: iso(s.lastMaintenanceDate), next: iso(s.nextMaintenanceDate), responsible: s.responsible?.name ?? null,
          devices: s.equipment.reduce((a, e) => a + e.quantity, 0), status: ENTITY[s.status],
        })),
      };
    },
  },
  {
    key: 'systems-by-category', title: 'Sistemas por categoría', group: 'Clientes y sistemas', description: 'Cantidad de sistemas por categoría y cuántos clientes los tienen.', filters: ['client'], roles: STAFF,
    async run(db, f) {
      const cats = await db.systemCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      const systems = await db.installedSystem.findMany({ where: f.clientId ? { installation: { clientId: f.clientId } } : {}, select: { categoryId: true, status: true, installation: { select: { clientId: true } } } });
      const rows: Row[] = cats.map((c) => {
        const mine = systems.filter((s) => s.categoryId === c.id);
        return { category: c.name, active: mine.filter((s) => s.status === 'ACTIVE').length, inactive: mine.filter((s) => s.status === 'INACTIVE').length, total: mine.length, clients: new Set(mine.map((s) => s.installation.clientId)).size };
      });
      return { columns: [col('category', 'Categoría', 'text', 34), col('active', 'Activos', 'number'), col('inactive', 'Inactivos', 'number'), col('total', 'Total', 'number'), col('clients', 'Clientes distintos', 'number')], rows, totals: { ...sumTotals(rows, ['active', 'inactive', 'total'], 'category'), clients: new Set(systems.map((s) => s.installation.clientId)).size } };
    },
  },
  {
    key: 'maintenance-done', title: 'Mantenimientos realizados', group: 'Mantenimientos', description: 'Trabajos ejecutados, con su resultado y el próximo mantenimiento definido.', filters: ['dateRange', 'client', 'technician', 'category', 'maintenanceType'], dateLabel: 'Fecha de ejecución', roles: ALL,
    run: (db, f, ctx) => maintReport(db, f, ctx, { where: [{ status: 'REALIZADO' }], dateField: 'executedDate', order: 'desc', cols: ['executed', 'client', 'installation', 'category', 'type', 'technicians', 'description', 'result', 'next'] }),
  },
  {
    key: 'maintenance-pending', title: 'Mantenimientos pendientes', group: 'Mantenimientos', description: 'Todo lo que aún no se ha realizado (programado, pendiente o en proceso), con su situación.', filters: ['dateRange', 'client', 'technician', 'category', 'maintenanceType', 'maintenanceStatus'], dateLabel: 'Fecha programada', roles: ALL,
    run: (db, f, ctx) => maintReport(db, f, ctx, {
      where: [{ status: f.status && ['PROGRAMADO', 'PENDIENTE', 'EN_PROCESO'].includes(f.status) ? (f.status as MaintenanceStatus) : { in: OPEN } }], dateField: 'scheduledDate', order: 'asc',
      cols: ['scheduled', 'client', 'installation', 'category', 'type', 'technicians', 'status', 'situation'],
    }),
  },
  {
    key: 'maintenance-overdue', title: 'Mantenimientos vencidos', group: 'Mantenimientos', description: 'Mantenimientos abiertos cuya fecha programada ya pasó.', filters: ['dateRange', 'client', 'technician', 'category', 'maintenanceType'], dateLabel: 'Fecha programada', roles: ALL,
    run: (db, f, ctx) => maintReport(db, f, ctx, { where: [{ status: { in: OPEN }, scheduledDate: { lt: todayD(ctx) } }], dateField: 'scheduledDate', order: 'asc', cols: ['scheduled', 'daysLate', 'client', 'installation', 'category', 'type', 'technicians', 'status'] }),
  },
  {
    key: 'maintenance-upcoming', title: 'Próximos mantenimientos', group: 'Mantenimientos', description: 'Mantenimientos abiertos que vencen en los próximos días (por defecto, 30).', filters: ['days', 'client', 'technician', 'category', 'maintenanceType'], roles: ALL,
    run: (db, f, ctx) => maintReport(db, { ...f, from: undefined, to: undefined }, ctx, {
      where: [{ status: { in: OPEN }, scheduledDate: { gte: todayD(ctx), lte: parseDateOnly(addDays(ctx.today, f.days ?? 30)) } }], dateField: 'scheduledDate', order: 'asc', cols: ['scheduled', 'daysLeft', 'client', 'installation', 'category', 'type', 'technicians', 'status'],
    }),
  },
  {
    key: 'maintenance-by-technician', title: 'Mantenimientos por técnico', group: 'Mantenimientos', description: 'Carga de trabajo de cada técnico: asignados, realizados, pendientes y vencidos.', filters: ['dateRange', 'technician', 'client', 'category', 'maintenanceType'], dateLabel: 'Fecha programada', roles: ALL,
    async run(db, f, ctx) {
      const own = ctx.actor.role === Role.TECNICO ? { userId: ctx.actor.id } : {};
      const techs = await db.technician.findMany({ where: { ...own, ...(f.technicianId ? { id: f.technicianId } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true, initials: true } });
      const links = await db.maintenanceTechnician.findMany({
        where: { technicianId: { in: techs.map((t) => t.id) }, maintenance: maintWhere({ ...f, technicianId: undefined }, ctx, 'scheduledDate', []) },
        select: { technicianId: true, maintenance: { select: { status: true, scheduledDate: true } } },
      });
      const rows: Row[] = techs.map((t) => {
        const mine = links.filter((l) => l.technicianId === t.id).map((l) => l.maintenance);
        const open = mine.filter((m) => OPEN.includes(m.status));
        return {
          technician: t.name, initials: t.initials, assigned: mine.length, done: mine.filter((m) => m.status === 'REALIZADO').length, inProcess: mine.filter((m) => m.status === 'EN_PROCESO').length,
          pending: open.filter((m) => m.status !== 'EN_PROCESO').length, overdue: open.filter((m) => toISODate(m.scheduledDate) < ctx.today).length,
          cancelled: mine.filter((m) => m.status === 'CANCELADO' || m.status === 'REPROGRAMADO').length,
        };
      });
      return {
        columns: [col('technician', 'Técnico', 'text', 28), col('initials', 'Iniciales'), col('assigned', 'Asignados', 'number'), col('done', 'Realizados', 'number'), col('inProcess', 'En proceso', 'number'),
          col('pending', 'Pendientes', 'number'), col('overdue', 'Vencidos', 'number'), col('cancelled', 'Cancelados / reprogramados', 'number')],
        rows, totals: sumTotals(rows, ['assigned', 'done', 'inProcess', 'pending', 'overdue', 'cancelled'], 'technician'),
      };
    },
  },
  {
    key: 'maintenance-by-client', title: 'Mantenimientos por cliente', group: 'Mantenimientos', description: 'Resumen por cliente: total, realizados, pendientes, vencidos y fechas clave.', filters: ['dateRange', 'client', 'category', 'maintenanceType'], dateLabel: 'Fecha programada', roles: STAFF,
    async run(db, f, ctx) {
      const list = await db.maintenance.findMany({
        where: maintWhere({ ...f, technicianId: undefined }, ctx, 'scheduledDate', []),
        select: { status: true, scheduledDate: true, executedDate: true, system: { select: { installation: { select: { client: { select: { id: true, commercialName: true } } } } } } }, take: MAX_ROWS * 2,
      });
      const by = new Map<string, { name: string; items: typeof list }>();
      for (const m of list) {
        const c = m.system.installation.client;
        if (!by.has(c.id)) by.set(c.id, { name: c.commercialName, items: [] });
        by.get(c.id)!.items.push(m);
      }
      const rows: Row[] = [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(({ name, items }) => {
        const open = items.filter((m) => OPEN.includes(m.status));
        const done = items.filter((m) => m.status === 'REALIZADO' && m.executedDate).map((m) => toISODate(m.executedDate!)).sort();
        const nextOpen = open.map((m) => toISODate(m.scheduledDate)).filter((d) => d >= ctx.today).sort();
        return {
          client: name, total: items.length, done: items.filter((m) => m.status === 'REALIZADO').length, pending: open.length, overdue: open.filter((m) => toISODate(m.scheduledDate) < ctx.today).length,
          cancelled: items.filter((m) => m.status === 'CANCELADO' || m.status === 'REPROGRAMADO').length, lastDone: done.at(-1) ?? null, nextScheduled: nextOpen[0] ?? null,
        };
      });
      return {
        columns: [col('client', 'Cliente', 'text', 32), col('total', 'Total', 'number'), col('done', 'Realizados', 'number'), col('pending', 'Pendientes', 'number'), col('overdue', 'Vencidos', 'number'),
          col('cancelled', 'Cancelados / reprogramados', 'number'), col('lastDone', 'Último realizado', 'date'), col('nextScheduled', 'Próximo programado', 'date')],
        rows, totals: sumTotals(rows, ['total', 'done', 'pending', 'overdue', 'cancelled'], 'client'),
      };
    },
  },
  {
    key: 'followups-pending', title: 'Seguimientos pendientes', group: 'Seguimientos', description: 'Seguimientos abiertos (sin finalizar ni cancelar) con su situación.', filters: ['dateRange', 'client', 'technician', 'followUpType', 'followUpStatus', 'priority', 'responsible', 'search'], dateLabel: 'Fecha objetivo', roles: ALL,
    run: (db, f, ctx) => fuReport(db, f, ctx, { where: [{ status: { isTerminal: false } }], dateField: 'targetDate', order: [{ targetDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], cols: ['title', 'client', 'installation', 'type', 'status', 'priority', 'responsible', 'start', 'target', 'situation', 'nextAction'] }),
  },
  {
    key: 'followups-done', title: 'Seguimientos finalizados', group: 'Seguimientos', description: 'Seguimientos cerrados como FINALIZADO, con quién y cuándo los cerró.', filters: ['dateRange', 'client', 'technician', 'followUpType', 'priority', 'responsible', 'search'], dateLabel: 'Fecha de finalización', roles: ALL,
    run: (db, f, ctx) => fuReport(db, { ...f, statusId: undefined }, ctx, { where: [{ status: { name: 'FINALIZADO' } }], dateField: 'completedAt', order: [{ completedAt: 'desc' }], cols: ['title', 'client', 'type', 'priority', 'responsible', 'start', 'completedAt', 'completedBy', 'daysOpen'] }),
  },
  {
    key: 'followups-overdue', title: 'Seguimientos vencidos', group: 'Seguimientos', description: 'Seguimientos abiertos cuya fecha objetivo ya pasó.', filters: ['dateRange', 'client', 'technician', 'followUpType', 'followUpStatus', 'priority', 'responsible', 'search'], dateLabel: 'Fecha objetivo', roles: ALL,
    run: (db, f, ctx) => fuReport(db, f, ctx, { where: [{ status: { isTerminal: false }, targetDate: { lt: todayD(ctx) } }], dateField: 'targetDate', order: [{ targetDate: 'asc' }], cols: ['title', 'client', 'type', 'status', 'priority', 'responsible', 'target', 'daysLate', 'nextAction'] }),
  },
  {
    key: 'activities-by-technician', title: 'Actividades por técnico', group: 'Actividades', description: 'Historial de actividades registradas, con quién las realizó.', filters: ['dateRange', 'technician', 'client', 'activityType'], dateLabel: 'Fecha de la actividad', roles: ALL,
    async run(db, f, ctx) {
      const and: Prisma.ActivityWhereInput[] = [activityScope(ctx.actor)];
      const gte = f.from ? new Date(`${f.from}T00:00:00-05:00`) : undefined;
      const lte = f.to ? new Date(`${f.to}T23:59:59.999-05:00`) : undefined;
      if (gte && lte && lte < gte) throw new BadRequestException('La fecha «hasta» no puede ser anterior a «desde»');
      if (gte || lte) and.push({ occurredAt: between({ gte, lte }) });
      if (f.clientId) and.push({ clientId: f.clientId });
      if (f.typeId) and.push({ typeId: f.typeId });
      if (f.technicianId) and.push({ user: { technician: { is: { id: f.technicianId } } } });
      const acts = await db.activity.findMany({
        where: { AND: and }, orderBy: { occurredAt: 'desc' }, take: MAX_ROWS,
        include: { type: { select: { name: true } }, user: { select: { name: true } }, client: { select: { commercialName: true } }, followUp: { select: { title: true } }, maintenance: { select: { scheduledDate: true } } },
      });
      return {
        columns: [col('when', 'Fecha y hora', 'datetime'), col('user', 'Registrada por', 'text', 20), col('type', 'Tipo', 'text', 24), col('client', 'Cliente', 'text', 26), col('followUp', 'Seguimiento', 'text', 28), col('maintenance', 'Mantenimiento', 'date'), col('description', 'Descripción', 'text', 50)],
        rows: acts.map((a) => ({ when: dtLocal(a.occurredAt), user: a.user?.name ?? 'Sistema', type: a.type.name, client: a.client?.commercialName ?? null, followUp: a.followUp?.title ?? null, maintenance: iso(a.maintenance?.scheduledDate), description: a.description })),
      };
    },
  },
];

export const REPORT_MAP = new Map(REPORTS.map((r) => [r.key, r]));
export type { Cell };
