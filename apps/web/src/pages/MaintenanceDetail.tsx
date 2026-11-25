import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, canWrite, dateOnly, M_OPEN, type Maintenance } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field } from '../components/ui';
import { MaintenanceBadge } from '../components/MaintenanceBadge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { MaintenanceForm } from './MaintenanceForm';
import { ActivityFeed } from '../components/ActivityFeed';
import { NotificationsPanel } from '../components/NotificationBits';

/** Fecha de hoy en America/Guayaquil (AAAA-MM-DD). */
export const todayEC = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

const ACTIONS: Record<string, string> = {
  'maintenance.created': 'Mantenimiento programado', 'maintenance.updated': 'Datos actualizados', 'maintenance.started': 'Trabajo iniciado',
  'maintenance.status_changed': 'Estado cambiado', 'maintenance.completed': 'Trabajo registrado como realizado',
  'maintenance.cancelled': 'Cancelado', 'maintenance.rescheduled': 'Reprogramado',
};

function useRefresh() {
  const qc = useQueryClient();
  return () => ['maintenance', 'maintenances', 'calendar', 'dashboard', 'system', 'systems'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

function Notes({ m, complete, onDone }: { m: Maintenance; complete?: boolean; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [f, setF] = useState({
    executedDate: todayEC(), nextMaintenanceDate: '', description: m.description ?? '', observations: m.observations ?? '',
    recommendations: m.recommendations ?? '', materials: m.materials ?? '', result: m.result ?? '',
  });
  const mut = useMutation({
    mutationFn: () => (complete
      ? api(`/maintenances/${m.id}/complete`, { method: 'POST', body: f })
      : api(`/maintenances/${m.id}`, { method: 'PATCH', body: { description: f.description, observations: f.observations, recommendations: f.recommendations, materials: f.materials, result: f.result } })),
    onSuccess: () => { refresh(); toast('ok', complete ? 'Mantenimiento registrado como realizado' : 'Cambios guardados'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  const area = (k: 'description' | 'observations' | 'recommendations' | 'materials' | 'result', label: string) => (
    <Field label={label}><textarea className="input" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  );
  return (
    <form onSubmit={submit} className="space-y-3">
      {complete && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de ejecución *"><input type="date" required max={todayEC()} className="input" value={f.executedDate} onChange={(e) => setF({ ...f, executedDate: e.target.value })} /></Field>
          <Field label="Próximo mantenimiento" hint="Opcional. Se guarda tal cual; el sistema no calcula periodicidades."><input type="date" min={f.executedDate} className="input" value={f.nextMaintenanceDate} onChange={(e) => setF({ ...f, nextMaintenanceDate: e.target.value })} /></Field>
        </div>
      )}
      {area('description', 'Trabajo realizado / descripción')}{area('observations', 'Observaciones')}{area('recommendations', 'Recomendaciones')}
      {area('materials', 'Materiales utilizados')}{area('result', 'Resultado')}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={mut.isPending}>{complete ? 'Registrar como realizado' : 'Guardar'}</button>
      </div>
    </form>
  );
}

function Reason({ m, mode, onDone }: { m: Maintenance; mode: 'cancel' | 'reschedule'; onDone: (nextId?: string) => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const mut = useMutation({
    mutationFn: () => (mode === 'cancel' ? api<Maintenance>(`/maintenances/${m.id}/cancel`, { method: 'POST', body: { reason } }) : api<Maintenance>(`/maintenances/${m.id}/reschedule`, { method: 'POST', body: { reason, newDate } })),
    onSuccess: (r) => { refresh(); toast('ok', mode === 'cancel' ? 'Mantenimiento cancelado' : 'Mantenimiento reprogramado'); onDone(mode === 'reschedule' ? r.id : undefined); },
    onError: (e: Error) => toast('error', e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
      {mode === 'reschedule' && <Field label="Nueva fecha *"><input type="date" required min={todayEC()} className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></Field>}
      <Field label="Motivo *"><textarea className="input" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => onDone()}>Volver</button>
        <button className={mode === 'cancel' ? 'btn-danger' : 'btn-primary'} disabled={mut.isPending}>{mode === 'cancel' ? 'Cancelar mantenimiento' : 'Reprogramar'}</button>
      </div>
    </form>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return <div><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="whitespace-pre-wrap text-sm">{v || '—'}</dd></div>;
}

export function MaintenanceDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const [modal, setModal] = useState<null | 'edit' | 'complete' | 'notes' | 'cancel' | 'reschedule'>(null);
  const q = useQuery({ queryKey: ['maintenance', id], queryFn: () => api<Maintenance>(`/maintenances/${id}`) });
  const hist = useQuery({ queryKey: ['maintenance', id, 'history'], queryFn: () => api<{ id: string; action: string; actor: string | null; createdAt: string }[]>(`/maintenances/${id}/history`) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) => api(`/maintenances/${id}/${path}`, { method: 'POST', body }),
    onSuccess: () => { refresh(); }, onError: (e: Error) => toast('error', e.message),
  });

  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">No se encontró el mantenimiento. <Link className="underline" to="/mantenimientos">Volver</Link></p>;
  const m = q.data;
  const open = M_OPEN.includes(m.status);
  const writer = canWrite(user?.role);
  const fieldStaff = writer || user?.role === 'TECNICO';
  const s = m.system;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/mantenimientos" className="text-sm text-teal-700 hover:underline">← Mantenimientos</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold text-navy-900">{m.type.name} <MaintenanceBadge status={m.status} overdue={m.overdue} /></h1>
          <p className="text-sm text-slate-500">
            <Link className="text-teal-700 hover:underline" to={`/clientes/${s.installation.client.id}`}>{s.installation.client.commercialName}</Link> · {s.installation.name} ·{' '}
            <Link className="text-teal-700 hover:underline" to={`/sistemas/${s.id}`}>{s.category.name}{s.brand ? ` (${[s.brand, s.model].filter(Boolean).join(' ')})` : ''}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && fieldStaff && m.status !== 'EN_PROCESO' && <button className="btn-secondary" onClick={() => act.mutate({ path: 'start' })}>Iniciar trabajo</button>}
          {open && fieldStaff && <button className="btn-primary" onClick={() => setModal('complete')}>Registrar como realizado</button>}
          {(open || m.status === 'REALIZADO') && fieldStaff && <button className="btn-secondary" onClick={() => setModal('notes')}>Observaciones y resultados</button>}
          {open && writer && <>
            <button className="btn-secondary" onClick={() => setModal('edit')}>Editar / asignar</button>
            {m.status !== 'EN_PROCESO' && <button className="btn-secondary" onClick={() => act.mutate({ path: 'status', body: { status: m.status === 'PENDIENTE' ? 'PROGRAMADO' : 'PENDIENTE' } })}>Marcar {m.status === 'PENDIENTE' ? 'programado' : 'pendiente'}</button>}
            <button className="btn-secondary" onClick={() => setModal('reschedule')}>Reprogramar</button>
            <button className="btn-danger" onClick={() => setModal('cancel')}>Cancelar</button>
          </>}
        </div>
      </div>

      {m.rescheduledFrom && <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-800">Reprogramado desde <Link className="underline" to={`/mantenimientos/${m.rescheduledFrom.id}`}>{dateOnly(m.rescheduledFrom.scheduledDate)}</Link>.</p>}
      {m.rescheduledTo && <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-800">Reprogramado: ver el nuevo mantenimiento del <Link className="underline" to={`/mantenimientos/${m.rescheduledTo.id}`}>{dateOnly(m.rescheduledTo.scheduledDate)}</Link>.</p>}

      <div className="card">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row k="Fecha programada" v={dateOnly(m.scheduledDate)} /><Row k="Fecha de ejecución" v={dateOnly(m.executedDate)} />
          <Row k="Último mantenimiento del sistema" v={dateOnly(s.lastMaintenanceDate)} /><Row k="Próximo mantenimiento (sistema)" v={dateOnly(s.nextMaintenanceDate)} />
          <div className="sm:col-span-2 lg:col-span-4"><Row k="Equipo de trabajo" v={m.technicians.map((t) => t.name).join(', ') || 'Sin asignar'} /></div>
          <div className="sm:col-span-2 lg:col-span-4"><Row k="Descripción del trabajo" v={m.description} /></div>
          <div className="sm:col-span-2"><Row k="Observaciones" v={m.observations} /></div><div className="sm:col-span-2"><Row k="Recomendaciones" v={m.recommendations} /></div>
          <div className="sm:col-span-2"><Row k="Materiales utilizados" v={m.materials} /></div><div className="sm:col-span-2"><Row k="Resultado" v={m.result} /></div>
        </dl>
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">Historial</h2>
        <ol className="space-y-3">
          {hist.data?.map((h) => (
            <li key={h.id} className="flex gap-3 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-600" />
              <div><div className="font-medium">{ACTIONS[h.action] ?? h.action}</div><div className="text-xs text-slate-500">{h.actor ?? 'Sistema'} · {new Date(h.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</div></div></li>
          ))}
        </ol>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-navy-900">Actividades</h2>
        <ActivityFeed scope={{ maintenanceId: id }} />
      </div>

      <NotificationsPanel maintenanceId={id} />

      {modal === 'edit' && <Modal title="Editar mantenimiento" onClose={() => setModal(null)}><MaintenanceForm maintenance={m} onDone={() => setModal(null)} /></Modal>}
      {modal === 'complete' && <Modal title="Registrar trabajo realizado" onClose={() => setModal(null)}><Notes m={m} complete onDone={() => setModal(null)} /></Modal>}
      {modal === 'notes' && <Modal title="Observaciones y resultados" onClose={() => setModal(null)}><Notes m={m} onDone={() => setModal(null)} /></Modal>}
      {modal === 'cancel' && <Modal title="Cancelar mantenimiento" onClose={() => setModal(null)}><Reason m={m} mode="cancel" onDone={() => setModal(null)} /></Modal>}
      {modal === 'reschedule' && <Modal title="Reprogramar mantenimiento" onClose={() => setModal(null)}><Reason m={m} mode="reschedule" onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}
