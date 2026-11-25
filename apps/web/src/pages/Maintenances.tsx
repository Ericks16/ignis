import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, dateOnly, M_LABEL, type CatalogItem, type Maintenance, type MStatus, type Page } from '../lib/api';
import { Empty, Pager } from '../components/ui';
import { MaintenanceBadge } from '../components/MaintenanceBadge';

export function Maintenances() {
  const [sp] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [due, setDue] = useState(sp.get('due') ?? '');
  const [typeId, setTypeId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [page, setPage] = useState(1);
  const types = useQuery({ queryKey: ['catalog', 'maintenance-types'], queryFn: () => api<CatalogItem[]>('/catalogs/maintenance-types') });
  const techs = useQuery({ queryKey: ['technician-options'], queryFn: () => api<{ id: string; name: string }[]>('/technicians/options') });
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}), ...(status ? { status } : {}), ...(due ? { due } : {}), ...(typeId ? { typeId } : {}), ...(technicianId ? { technicianId } : {}) });
  const q = useQuery({ queryKey: ['maintenances', qs.toString()], queryFn: () => api<Page<Maintenance>>(`/maintenances?${qs}`), placeholderData: (p) => p });
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Mantenimientos</h1>
      <p className="text-sm text-slate-500">Para programar uno nuevo, abra el sistema correspondiente y use «Programar mantenimiento».</p>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Buscar cliente, instalación o trabajo" aria-label="Buscar mantenimientos" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
        <select className="input w-auto" aria-label="Vencimiento" value={due} onChange={(e) => reset(setDue)(e.target.value)}>
          <option value="">Todas las fechas</option><option value="open">Abiertos</option><option value="overdue">Vencidos</option><option value="upcoming">Próximos (30 días)</option>
        </select>
        <select className="input w-auto" aria-label="Estado" value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
          <option value="">Todos los estados</option>
          {(Object.keys(M_LABEL) as MStatus[]).map((s) => <option key={s} value={s}>{M_LABEL[s]}</option>)}
        </select>
        <select className="input w-auto" aria-label="Tipo" value={typeId} onChange={(e) => reset(setTypeId)(e.target.value)}>
          <option value="">Todos los tipos</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="input w-auto" aria-label="Técnico" value={technicianId} onChange={(e) => reset(setTechnicianId)(e.target.value)}>
          <option value="">Todos los técnicos</option>{techs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Fecha</th><th className="p-3">Cliente / instalación</th><th className="p-3">Sistema</th><th className="p-3">Tipo</th><th className="p-3">Técnicos</th><th className="p-3">Estado</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={6}><Empty>Cargando…</Empty></td></tr>}
            {q.isError && <tr><td colSpan={6} className="p-6 text-center text-danger">No se pudo cargar la lista.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={6}><Empty>No hay mantenimientos que coincidan.</Empty></td></tr>}
            {q.data?.items.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 whitespace-nowrap"><Link className="font-medium text-teal-700 hover:underline" to={`/mantenimientos/${m.id}`}>{dateOnly(m.scheduledDate)}</Link></td>
                <td className="p-3">{m.system.installation.client.commercialName}<div className="text-xs text-slate-500">{m.system.installation.name}</div></td>
                <td className="p-3">{m.system.category.name}</td><td className="p-3">{m.type.name}</td>
                <td className="p-3">{m.technicians.map((t) => t.initials ?? t.name).join(', ') || '—'}</td>
                <td className="p-3"><MaintenanceBadge status={m.status} overdue={m.overdue} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
    </div>
  );
}
