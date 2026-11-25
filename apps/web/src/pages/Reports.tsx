import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type CatalogItem, type FollowUpStatus, type Page, type Client } from '../lib/api';
import { Empty, Pager } from '../components/ui';

type FilterKey = 'dateRange' | 'client' | 'technician' | 'category' | 'maintenanceType' | 'followUpType' | 'followUpStatus' | 'priority' | 'responsible' | 'city' | 'entityStatus' | 'search' | 'days' | 'maintenanceStatus' | 'activityType';
interface Meta { key: string; title: string; description: string; group: string; filters: FilterKey[]; dateLabel?: string }
interface Column { key: string; label: string; type: 'text' | 'number' | 'date' | 'datetime' }
type Cell = string | number | null;
interface Result { report: Meta; columns: Column[]; rows: Record<string, Cell>[]; totals: Record<string, Cell> | null; total: number; page: number; pageSize: number; truncated: boolean; note: string | null }

const GROUP_ORDER = ['Mantenimientos', 'Seguimientos', 'Clientes y sistemas', 'Actividades'];
const FILTER_PARAMS = ['from', 'to', 'clientId', 'technicianId', 'categoryId', 'typeId', 'statusId', 'priority', 'responsibleId', 'city', 'status', 'search', 'days'];

/** Catálogo de reportes disponibles para el rol del usuario. */
export function ReportsHome() {
  const q = useQuery({ queryKey: ['reports'], queryFn: () => api<Meta[]>('/reports') });
  const groups = useMemo(() => GROUP_ORDER.map((g) => [g, q.data?.filter((r) => r.group === g) ?? []] as const).filter(([, l]) => l.length), [q.data]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Reportes</h1>
        <p className="text-sm text-slate-500">Elija un reporte, filtre y exporte a Excel, CSV o PDF. Solo verá la información a la que su rol tiene acceso.</p>
      </div>
      {q.isLoading && <p className="text-slate-500">Cargando…</p>}
      {groups.map(([g, list]) => (
        <section key={g}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r) => (
              <Link key={r.key} to={`/reportes/${r.key}`} className="card block transition hover:border-teal-600 hover:shadow">
                <div className="font-medium text-navy-900">{r.title}</div>
                <p className="mt-1 text-sm text-slate-500">{r.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Opt({ items }: { items?: { id: string; name: string }[] }) {
  return <>{items?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</>;
}

const cellClass = (c: Column, v: Cell) => {
  if (v === 'Vencido' || (typeof v === 'string' && v.startsWith('Vencido'))) return 'font-medium text-danger';
  if (v === 'Próximo' || v === 'Por vencer') return 'font-medium text-accent-dark';
  return c.type === 'number' ? 'text-right tabular-nums' : '';
};

export function ReportDetail() {
  const { key = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1) || 1;
  const filters = useMemo(() => Object.fromEntries(FILTER_PARAMS.map((k) => [k, sp.get(k) ?? '']).filter(([, v]) => v)), [sp]);
  const qs = new URLSearchParams(filters).toString();

  const metaQ = useQuery({ queryKey: ['reports'], queryFn: () => api<Meta[]>('/reports') });
  const meta = metaQ.data?.find((r) => r.key === key);
  const has = (k: FilterKey) => !!meta?.filters.includes(k);
  const clients = useQuery({ queryKey: ['clients', 'report-options'], enabled: has('client'), queryFn: () => api<Page<Client>>('/clients?pageSize=100') });
  const techs = useQuery({ queryKey: ['technician-options'], enabled: has('technician'), queryFn: () => api<{ id: string; name: string }[]>('/technicians/options') });
  const cats = useQuery({ queryKey: ['catalog', 'system-categories'], enabled: has('category'), queryFn: () => api<CatalogItem[]>('/catalogs/system-categories') });
  const mTypes = useQuery({ queryKey: ['catalog', 'maintenance-types'], enabled: has('maintenanceType'), queryFn: () => api<CatalogItem[]>('/catalogs/maintenance-types') });
  const fTypes = useQuery({ queryKey: ['catalog', 'follow-up-types'], enabled: has('followUpType'), queryFn: () => api<CatalogItem[]>('/catalogs/follow-up-types') });
  const aTypes = useQuery({ queryKey: ['catalog', 'activity-types'], enabled: has('activityType'), queryFn: () => api<CatalogItem[]>('/catalogs/activity-types') });
  const statuses = useQuery({ queryKey: ['follow-up-statuses'], enabled: has('followUpStatus'), queryFn: () => api<FollowUpStatus[]>('/follow-up-statuses') });
  const users = useQuery({ queryKey: ['user-options'], enabled: has('responsible'), queryFn: () => api<{ id: string; name: string }[]>('/user-options') });

  const result = useQuery({
    queryKey: ['report', key, qs, page], enabled: !!meta, retry: false, placeholderData: (p) => p,
    queryFn: () => api<Result>(`/reports/${key}?${qs}&page=${page}&pageSize=50`),
  });

  const set = (name: string, value: string) => { const n = new URLSearchParams(sp); if (value) n.set(name, value); else n.delete(name); n.delete('page'); setSp(n, { replace: true }); };
  const field = (label: string, el: React.ReactNode) => <label className="block text-sm"><span className="label">{label}</span>{el}</label>;
  const sel = (name: string, label: string, options: React.ReactNode, all = 'Todos') =>
    field(label, <select className="input" value={sp.get(name) ?? ''} onChange={(e) => set(name, e.target.value)}><option value="">{all}</option>{options}</select>);
  const exportUrl = (format: string) => `/api/reports/${key}/export?format=${format}${qs ? `&${qs}` : ''}`;

  if (metaQ.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (!meta) return <p role="alert" className="text-danger">Este reporte no existe o su rol no tiene acceso. <Link className="underline" to="/reportes">Volver a reportes</Link></p>;
  const r = result.data;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/reportes" className="text-sm text-teal-700 hover:underline">← Reportes</Link>
        <h1 className="mt-1 text-2xl font-semibold text-navy-900">{meta.title}</h1>
        <p className="text-sm text-slate-500">{meta.description}</p>
      </div>

      <div className="card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {has('dateRange') && <>{field(`${meta.dateLabel ?? 'Fecha'} desde`, <input type="date" className="input" value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />)}
            {field(`${meta.dateLabel ?? 'Fecha'} hasta`, <input type="date" className="input" min={sp.get('from') ?? undefined} value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />)}</>}
          {has('days') && field('Próximos días', <input type="number" min={1} max={365} className="input" placeholder="30" value={sp.get('days') ?? ''} onChange={(e) => set('days', e.target.value)} />)}
          {has('client') && sel('clientId', 'Cliente', clients.data?.items.map((c) => <option key={c.id} value={c.id}>{c.commercialName}</option>), 'Todos los clientes')}
          {has('technician') && sel('technicianId', 'Técnico', <Opt items={techs.data} />, 'Todos los técnicos')}
          {has('category') && sel('categoryId', 'Tipo de sistema', <Opt items={cats.data} />, 'Todos')}
          {has('maintenanceType') && sel('typeId', 'Tipo de mantenimiento', <Opt items={mTypes.data} />)}
          {has('followUpType') && sel('typeId', 'Tipo de seguimiento', <Opt items={fTypes.data} />)}
          {has('activityType') && sel('typeId', 'Tipo de actividad', <Opt items={aTypes.data} />)}
          {has('followUpStatus') && sel('statusId', 'Estado', <Opt items={statuses.data} />)}
          {has('maintenanceStatus') && sel('status', 'Estado', <><option value="PROGRAMADO">Programado</option><option value="PENDIENTE">Pendiente</option><option value="EN_PROCESO">En proceso</option></>)}
          {has('entityStatus') && sel('status', 'Estado', <><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></>)}
          {has('priority') && sel('priority', 'Prioridad', <><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></>, 'Todas')}
          {has('responsible') && sel('responsibleId', 'Responsable', <Opt items={users.data} />)}
          {has('city') && field('Ciudad', <input className="input" value={sp.get('city') ?? ''} onChange={(e) => set('city', e.target.value)} />)}
          {has('search') && field('Buscar', <input className="input" placeholder="Texto" value={sp.get('search') ?? ''} onChange={(e) => set('search', e.target.value)} />)}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button className="btn-secondary" onClick={() => setSp(new URLSearchParams(), { replace: true })} disabled={!qs}>Limpiar filtros</button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Exportar con estos filtros:</span>
            <a className="btn-secondary" href={exportUrl('xlsx')}>Excel</a><a className="btn-secondary" href={exportUrl('csv')}>CSV</a><a className="btn-secondary" href={exportUrl('pdf')}>PDF</a>
          </div>
        </div>
      </div>

      {result.isError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{(result.error as Error).message}</p>}
      {r?.truncated && <p role="status" className="rounded-md bg-orange-50 px-3 py-2 text-sm text-accent-dark">Se alcanzó el máximo de filas del reporte: refine los filtros para ver el resto.</p>}
      <div className="card overflow-x-auto p-0">
        {result.isLoading && <Empty>Cargando…</Empty>}
        {r && (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr>{r.columns.map((c) => <th key={c.key} className={`whitespace-nowrap p-3 ${c.type === 'number' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
            <tbody>
              {r.rows.length === 0 && <tr><td colSpan={r.columns.length}><Empty>No hay datos para los filtros seleccionados.</Empty></td></tr>}
              {r.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  {r.columns.map((c) => <td key={c.key} className={`p-3 ${cellClass(c, row[c.key])} ${c.type === 'date' || c.type === 'datetime' ? 'whitespace-nowrap' : ''}`}>{row[c.key] === null || row[c.key] === undefined ? '—' : c.type === 'number' ? Number(row[c.key]).toLocaleString('es-EC') : String(row[c.key])}</td>)}
                </tr>
              ))}
            </tbody>
            {r.totals && <tfoot><tr className="border-t-2 bg-slate-50 font-semibold">{r.columns.map((c) => <td key={c.key} className={`p-3 ${c.type === 'number' ? 'text-right tabular-nums' : ''}`}>{r.totals![c.key] === undefined || r.totals![c.key] === null ? '' : String(r.totals![c.key])}</td>)}</tr></tfoot>}
          </table>
        )}
      </div>
      {r && <Pager page={r.page} total={r.total} pageSize={r.pageSize} onPage={(p) => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n, { replace: true }); }} />}
    </div>
  );
}
