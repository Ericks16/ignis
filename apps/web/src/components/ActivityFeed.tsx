import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, canWrite, type Activity, type CatalogItem, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, Field, Pager } from './ui';
import { Modal } from './Modal';
import { useToast } from './Toast';

const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });
/** Valor para <input type="datetime-local"> en hora de Guayaquil. */
const localInput = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }).format(d).replace(' ', 'T');

interface Scope { clientId?: string; followUpId?: string; maintenanceId?: string }

function ActivityForm({ scope, activity, onDone }: { scope: Scope; activity?: Activity; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['catalog', 'activity-types'], queryFn: () => api<CatalogItem[]>('/catalogs/activity-types') });
  const [f, setF] = useState({ typeId: activity?.type.id ?? '', description: activity?.description ?? '', occurredAt: localInput(activity ? new Date(activity.occurredAt) : new Date()) });
  const m = useMutation({
    mutationFn: () => {
      const occurredAt = new Date(`${f.occurredAt}:00-05:00`).toISOString();
      return activity
        ? api(`/activities/${activity.id}`, { method: 'PATCH', body: { typeId: f.typeId, description: f.description, occurredAt } })
        : api('/activities', { method: 'POST', body: { ...scope, typeId: f.typeId, description: f.description, occurredAt } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); toast('ok', 'Actividad guardada'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Tipo de actividad *">
        <select className="input" required value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
          <option value="">Seleccione…</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha y hora *"><input type="datetime-local" required className="input" max={localInput(new Date())} value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} /></Field>
      <Field label="Descripción *"><textarea className="input" required minLength={2} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar actividad</button>
      </div>
    </form>
  );
}

/** Línea de tiempo de actividades (más reciente primero), con alta y edición según el rol. */
export function ActivityFeed({ scope, canAdd = true, showClient = false, filters = {} }: { scope: Scope; canAdd?: boolean; showClient?: boolean; filters?: Record<string, string> }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ activity?: Activity } | null>(null);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(scope as Record<string, string>), ...filters });
  const q = useQuery({ queryKey: ['activities', qs.toString()], queryFn: () => api<Page<Activity>>(`/activities?${qs}`), placeholderData: (p) => p });
  const mayAdd = canAdd && (canWrite(user?.role) || (user?.role === 'TECNICO' && (scope.followUpId || scope.maintenanceId)));
  const mayEdit = (a: Activity) => canWrite(user?.role) || (user?.role === 'TECNICO' && a.user?.id === user.id);
  return (
    <div className="space-y-3">
      {mayAdd && <div className="text-right"><button className="btn-primary" onClick={() => setModal({})}>Registrar actividad</button></div>}
      <div className="card">
        {q.isLoading && <Empty>Cargando…</Empty>}
        {q.data?.items.length === 0 && <Empty>No hay actividades registradas.</Empty>}
        <ol className="space-y-4">
          {q.data?.items.map((a) => (
            <li key={a.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.type.name}</span>
                  {showClient && a.client && <Link className="text-teal-700 hover:underline" to={`/clientes/${a.client.id}`}>{a.client.commercialName}</Link>}
                  {a.followUp && <Link className="text-xs text-teal-700 hover:underline" to={`/seguimientos/${a.followUp.id}`}>↳ {a.followUp.title}</Link>}
                  {a.maintenance && <Link className="text-xs text-teal-700 hover:underline" to={`/mantenimientos/${a.maintenance.id}`}>↳ Mantenimiento {a.maintenance.scheduledDate.slice(0, 10)}</Link>}
                </div>
                <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>
                <div className="text-xs text-slate-500">{a.user?.name ?? 'Sistema'} · {fmt(a.occurredAt)}{mayEdit(a) && <button className="ml-2 text-teal-700 hover:underline" onClick={() => setModal({ activity: a })}>Editar</button>}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {q.data && q.data.total > q.data.pageSize && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
      {modal && <Modal title={modal.activity ? 'Editar actividad' : 'Registrar actividad'} onClose={() => setModal(null)}><ActivityForm scope={scope} activity={modal.activity} onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}
