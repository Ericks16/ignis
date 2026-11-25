import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, canWrite, dateOnly, type FollowUp, type FollowUpHistoryItem, type FollowUpStatus } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ActivityFeed } from '../components/ActivityFeed';
import { FollowUpStatusBadge, PriorityBadge } from '../components/FollowUpBadges';
import { Empty, Field } from '../components/ui';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { FollowUpForm } from './FollowUpForm';
import { NotificationsPanel } from '../components/NotificationBits';

const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });

function StatusForm({ f, onDone }: { f: FollowUp; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const statuses = useQuery({ queryKey: ['follow-up-statuses'], queryFn: () => api<FollowUpStatus[]>('/follow-up-statuses') });
  const [statusId, setStatusId] = useState('');
  const [comment, setComment] = useState('');
  const target = statuses.data?.find((s) => s.id === statusId);
  const m = useMutation({
    mutationFn: () => api(`/follow-ups/${f.id}/status`, { method: 'POST', body: { statusId, comment } }),
    onSuccess: () => { ['follow-up', 'follow-ups', 'activities', 'calendar', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast('ok', 'Estado actualizado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  // Desde un estado cerrado solo se reabre hacia uno abierto.
  const options = statuses.data?.filter((s) => s.id !== f.status.id && !(f.status.isTerminal && s.isTerminal));
  const needsComment = f.status.isTerminal || target?.name === 'CANCELADO';
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-600">Estado actual: <b>{f.status.name}</b></p>
      <Field label="Nuevo estado *">
        <select className="input" required value={statusId} onChange={(e) => setStatusId(e.target.value)}>
          <option value="">Seleccione…</option>{options?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isTerminal ? ' (cierra el seguimiento)' : ''}</option>)}
        </select>
      </Field>
      {target?.isTerminal && <p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-accent-dark">Al cerrar el seguimiento se detienen sus recordatorios automáticos y queda registrado quién lo cerró y cuándo.</p>}
      <Field label={needsComment ? 'Motivo *' : 'Observaciones'}><textarea className="input" required={needsComment} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className={target?.isTerminal ? 'btn-danger' : 'btn-primary'} disabled={m.isPending || !statusId}>Cambiar estado</button>
      </div>
    </form>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return <div><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="whitespace-pre-wrap text-sm">{v || '—'}</dd></div>;
}

export function FollowUpDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const write = canWrite(user?.role);
  const [modal, setModal] = useState<null | 'edit' | 'status'>(null);
  const q = useQuery({ queryKey: ['follow-up', id], queryFn: () => api<FollowUp>(`/follow-ups/${id}`) });
  const hist = useQuery({ queryKey: ['follow-up', id, 'history'], queryFn: () => api<FollowUpHistoryItem[]>(`/follow-ups/${id}/history`) });
  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">No se encontró el seguimiento. <Link className="underline" to="/seguimientos">Volver</Link></p>;
  const f = q.data;
  const closed = f.status.isTerminal;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/seguimientos" className="text-sm text-teal-700 hover:underline">← Seguimientos</Link>
          <h1 className="mt-1 text-2xl font-semibold text-navy-900">{f.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <FollowUpStatusBadge name={f.status.name} isTerminal={closed} overdue={f.overdue} /><PriorityBadge priority={f.priority} />
            <Link className="text-teal-700 hover:underline" to={`/clientes/${f.client.id}`}>{f.client.commercialName}</Link>
          </div>
        </div>
        {write && (
          <div className="flex gap-2">
            {!closed && <button className="btn-secondary" onClick={() => setModal('edit')}>Editar</button>}
            <button className={closed ? 'btn-secondary' : 'btn-primary'} onClick={() => setModal('status')}>{closed ? 'Reabrir' : 'Cambiar estado'}</button>
          </div>
        )}
      </div>

      {closed && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-ok">Seguimiento cerrado{f.completedAt ? ` el ${fmt(f.completedAt)}` : ''}{f.completedBy ? ` por ${f.completedBy.name}` : ''}. No genera recordatorios.</p>}

      <div className="card">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row k="Tipo" v={f.type.name} /><Row k="Responsable" v={f.responsible?.name} />
          <Row k="Fecha de inicio" v={dateOnly(f.startDate)} /><Row k="Fecha objetivo" v={dateOnly(f.targetDate)} />
          <Row k="Instalación" v={f.installation?.name} />
          <Row k="Sistema" v={f.system && <Link className="text-teal-700 hover:underline" to={`/sistemas/${f.system.id}`}>{f.system.category.name}{f.system.brand ? ` (${f.system.brand})` : ''}</Link>} />
          <Row k="Mantenimiento" v={f.maintenance && <Link className="text-teal-700 hover:underline" to={`/mantenimientos/${f.maintenance.id}`}>{dateOnly(f.maintenance.scheduledDate)} · {f.maintenance.type.name}</Link>} />
          <Row k="Recordatorios por correo" v={f.remindersEnabled ? 'Activados' : 'Desactivados'} />
          <div className="sm:col-span-2 lg:col-span-4"><Row k="Técnicos asignados" v={f.technicians.map((t) => t.name).join(', ')} /></div>
          <div className="sm:col-span-2 lg:col-span-4"><Row k="Descripción" v={f.description} /></div>
          <div className="sm:col-span-2"><Row k="Próxima acción" v={f.nextAction} /></div><div className="sm:col-span-2"><Row k="Observaciones" v={f.observations} /></div>
        </dl>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-navy-900">Historial de estados</h2>
          <div className="card">
            {hist.data?.length === 0 && <Empty>Sin cambios registrados.</Empty>}
            <ol className="space-y-3">
              {hist.data?.map((h) => (
                <li key={h.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600" />
                  <div><div className="font-medium">{h.fromName ? `${h.fromName} → ${h.toName}` : h.toName}</div>
                    {h.comment && <div className="text-slate-700">{h.comment}</div>}
                    <div className="text-xs text-slate-500">{h.by ?? 'Sistema'} · {fmt(h.createdAt)}</div></div></li>
              ))}
            </ol>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold text-navy-900">Actividades</h2>
          <ActivityFeed scope={{ followUpId: id }} />
        </div>
      </div>

      <NotificationsPanel followUpId={id} />

      {modal === 'edit' && <Modal title="Editar seguimiento" onClose={() => setModal(null)}><FollowUpForm followUp={f} onDone={() => setModal(null)} /></Modal>}
      {modal === 'status' && <Modal title={closed ? 'Reabrir seguimiento' : 'Cambiar estado'} onClose={() => setModal(null)}><StatusForm f={f} onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}
