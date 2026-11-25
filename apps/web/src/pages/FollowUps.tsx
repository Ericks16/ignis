import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, canWrite, dateOnly, PRIORITY_LABEL, type CatalogItem, type FollowUp, type FollowUpStatus, type Page, type Priority } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, Pager } from '../components/ui';
import { FollowUpStatusBadge, PriorityBadge } from '../components/FollowUpBadges';
import { Modal } from '../components/Modal';
import { FollowUpForm } from './FollowUpForm';

export function FollowUps() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ search: '', state: sp.get('state') ?? '', statusId: sp.get('statusId') ?? '', priority: '', typeId: '' });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const statuses = useQuery({ queryKey: ['follow-up-statuses'], queryFn: () => api<FollowUpStatus[]>('/follow-up-statuses') });
  const types = useQuery({ queryKey: ['catalog', 'follow-up-types'], queryFn: () => api<CatalogItem[]>('/catalogs/follow-up-types') });
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const q = useQuery({ queryKey: ['follow-ups', qs.toString()], queryFn: () => api<Page<FollowUp>>(`/follow-ups?${qs}`), placeholderData: (p) => p });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Seguimientos</h1>
        {canWrite(user?.role) && <button className="btn-primary" onClick={() => setCreating(true)}>Nuevo seguimiento</button>}
      </div>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Buscar título, descripción o cliente" aria-label="Buscar seguimientos" value={f.search} onChange={upd('search')} />
        <select className="input w-auto" aria-label="Situación" value={f.state} onChange={upd('state')}>
          <option value="">Todos</option><option value="open">Abiertos</option><option value="overdue">Vencidos</option><option value="upcoming">Vencen en 30 días</option><option value="closed">Cerrados</option>
        </select>
        <select className="input w-auto" aria-label="Estado" value={f.statusId} onChange={upd('statusId')}>
          <option value="">Todos los estados</option>{statuses.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input w-auto" aria-label="Prioridad" value={f.priority} onChange={upd('priority')}>
          <option value="">Toda prioridad</option>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <select className="input w-auto" aria-label="Tipo" value={f.typeId} onChange={upd('typeId')}>
          <option value="">Todos los tipos</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Seguimiento</th><th className="p-3">Cliente</th><th className="p-3">Tipo</th><th className="p-3">Prioridad</th><th className="p-3">Responsable</th><th className="p-3">Fecha objetivo</th><th className="p-3">Estado</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={7}><Empty>Cargando…</Empty></td></tr>}
            {q.isError && <tr><td colSpan={7} className="p-6 text-center text-danger">No se pudo cargar la lista.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={7}><Empty>No hay seguimientos que coincidan.</Empty></td></tr>}
            {q.data?.items.map((x) => (
              <tr key={x.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 font-medium"><Link className="text-teal-700 hover:underline" to={`/seguimientos/${x.id}`}>{x.title}</Link></td>
                <td className="p-3">{x.client.commercialName}</td><td className="p-3">{x.type.name}</td><td className="p-3"><PriorityBadge priority={x.priority} /></td>
                <td className="p-3">{x.responsible?.name ?? '—'}</td><td className="p-3 whitespace-nowrap">{dateOnly(x.targetDate) || '—'}</td>
                <td className="p-3"><FollowUpStatusBadge name={x.status.name} isTerminal={x.status.isTerminal} overdue={x.overdue} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
      {creating && <Modal title="Nuevo seguimiento" onClose={() => setCreating(false)}><FollowUpForm onDone={(x) => { setCreating(false); if (x) nav(`/seguimientos/${x.id}`); }} /></Modal>}
    </div>
  );
}
