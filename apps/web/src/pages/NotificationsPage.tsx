import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, canWrite, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, Pager } from '../components/ui';
import { useToast } from '../components/Toast';
import { fmtDateTime, N_KIND, N_STATUS, NotificationStatusBadge, type NotificationRow, type NStatus } from '../components/NotificationBits';

/** Historial de notificaciones: qué se envió, a quién, cuándo y con qué resultado. */
export function NotificationsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ status: '', kind: '', search: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const q = useQuery({ queryKey: ['notifications', qs.toString()], queryFn: () => api<Page<NotificationRow>>(`/notifications?${qs}`), placeholderData: (p) => p });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/retry`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast('ok', 'Reintento programado: se enviará en la próxima ejecución'); },
    onError: (e: Error) => toast('error', e.message),
  });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const target = (n: NotificationRow) => n.followUp
    ? <Link className="text-teal-700 hover:underline" to={`/seguimientos/${n.followUp.id}`}>{n.followUp.title}</Link>
    : n.maintenance && <Link className="text-teal-700 hover:underline" to={`/mantenimientos/${n.maintenance.id}`}>Mantenimiento {n.maintenance.type.name} · {n.maintenance.scheduledDate.slice(0, 10)}</Link>;
  const client = (n: NotificationRow) => n.followUp?.client.commercialName ?? n.maintenance?.system.installation.client.commercialName ?? '—';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Notificaciones</h1>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Buscar por destinatario" aria-label="Buscar por destinatario" value={f.search} onChange={upd('search')} />
        <select className="input w-auto" aria-label="Estado" value={f.status} onChange={upd('status')}>
          <option value="">Todos los estados</option>{(Object.keys(N_STATUS) as NStatus[]).map((s) => <option key={s} value={s}>{N_STATUS[s].label}</option>)}
        </select>
        <select className="input w-auto" aria-label="Tipo" value={f.kind} onChange={upd('kind')}>
          <option value="">Todos los tipos</option>{Object.entries(N_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">Desde<input type="date" className="input w-auto" value={f.from} onChange={upd('from')} /></label>
        <label className="flex items-center gap-2 text-sm text-slate-600">Hasta<input type="date" className="input w-auto" min={f.from} value={f.to} onChange={upd('to')} /></label>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Aviso del</th><th className="p-3">Cliente</th><th className="p-3">Origen</th><th className="p-3">Destinatario</th><th className="p-3">Tipo</th><th className="p-3">Estado</th><th className="p-3">Intentos</th><th className="p-3">Enviado</th>{canWrite(user?.role) && <th className="p-3" />}</tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={9}><Empty>Cargando…</Empty></td></tr>}
            {q.isError && <tr><td colSpan={9} className="p-6 text-center text-danger">No se pudo cargar el historial.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={9}><Empty>No hay notificaciones que coincidan.</Empty></td></tr>}
            {q.data?.items.map((n) => (
              <tr key={n.id} className="border-b last:border-0 align-top">
                <td className="p-3 whitespace-nowrap">{n.occurrenceDate.slice(0, 10)}</td><td className="p-3">{client(n)}</td><td className="p-3">{target(n)}</td>
                <td className="p-3">{n.recipientEmail}</td><td className="p-3">{N_KIND[n.kind]}</td>
                <td className="p-3"><NotificationStatusBadge n={n} />{n.lastError && <div className="mt-1 max-w-xs text-xs text-danger">{n.lastError}</div>}{n.nextAttemptAt && n.status === 'FAILED' && <div className="mt-1 text-xs text-slate-500">Próximo intento: {fmtDateTime(n.nextAttemptAt)}</div>}</td>
                <td className="p-3">{n.attempt}</td><td className="p-3 whitespace-nowrap">{n.sentAt ? <>{fmtDateTime(n.sentAt)}{n.provider === 'console' && <div className="text-xs text-slate-500">modo prueba (no enviado)</div>}</> : '—'}</td>
                {canWrite(user?.role) && <td className="p-3 text-right">{n.status === 'FAILED' && !n.nextAttemptAt && <button className="btn-secondary py-1" onClick={() => retry.mutate(n.id)}>Reintentar</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
    </div>
  );
}
