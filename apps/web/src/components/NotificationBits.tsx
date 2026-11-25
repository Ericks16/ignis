import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Page } from '../lib/api';
import { Empty } from './ui';

export type NStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export interface NotificationRow {
  id: string; entityType: 'FOLLOW_UP' | 'MAINTENANCE'; recipientEmail: string; recipientName: string | null; kind: 'FIRST' | 'WEEKLY' | 'OVERDUE';
  occurrenceDate: string; status: NStatus; attempt: number; nextAttemptAt: string | null; subject: string | null; lastError: string | null; provider: string | null;
  sentAt: string | null; createdAt: string;
  followUp: { id: string; title: string; client: { commercialName: string } } | null;
  maintenance: { id: string; scheduledDate: string; type: { name: string }; system: { installation: { client: { commercialName: string } } } } | null;
}

export const N_STATUS: Record<NStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  SENDING: { label: 'Enviando', cls: 'bg-sky-100 text-sky-800' },
  SENT: { label: 'Enviado', cls: 'bg-green-100 text-ok' },
  FAILED: { label: 'Fallido', cls: 'bg-red-100 text-danger' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-slate-200 text-slate-600' },
};
export const N_KIND = { FIRST: 'Primer aviso', WEEKLY: 'Recordatorio', OVERDUE: 'Vencido' } as const;
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });

export function NotificationStatusBadge({ n }: { n: NotificationRow }) {
  const s = N_STATUS[n.status];
  const retrying = n.status === 'FAILED' && n.nextAttemptAt;
  return <span className={`badge ${s.cls}`}>{retrying ? 'Fallido · reintentará' : s.label}</span>;
}

/** Historial de recordatorios de un seguimiento o mantenimiento (solo roles con acceso a notificaciones). */
export function NotificationsPanel({ followUpId, maintenanceId }: { followUpId?: string; maintenanceId?: string }) {
  const qs = new URLSearchParams({ pageSize: '50', ...(followUpId ? { followUpId } : {}), ...(maintenanceId ? { maintenanceId } : {}) });
  const q = useQuery({ queryKey: ['notifications', qs.toString()], queryFn: () => api<Page<NotificationRow>>(`/notifications?${qs}`), retry: false });
  if (q.isError) return null; // el rol no tiene acceso
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy-900">Recordatorios por correo</h2>
        <Link className="text-sm text-teal-700 hover:underline" to="/notificaciones">Ver todos</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        {q.isLoading && <Empty>Cargando…</Empty>}
        {q.data?.items.length === 0 && <Empty>Aún no se ha enviado ningún recordatorio. El primero sale un mes antes de la fecha objetivo.</Empty>}
        {!!q.data?.items.length && (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Aviso del</th><th className="p-3">Destinatario</th><th className="p-3">Tipo</th><th className="p-3">Estado</th><th className="p-3">Enviado</th></tr></thead>
            <tbody>
              {q.data.items.map((n) => (
                <tr key={n.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{n.occurrenceDate.slice(0, 10)}</td><td className="p-3">{n.recipientEmail}</td><td className="p-3">{N_KIND[n.kind]}</td>
                  <td className="p-3"><NotificationStatusBadge n={n} />{n.lastError && <div className="mt-1 text-xs text-danger">{n.lastError}</div>}</td>
                  <td className="p-3 whitespace-nowrap">{n.sentAt ? fmtDateTime(n.sentAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
