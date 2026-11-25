import { PRIORITY_LABEL, type Priority } from '../lib/api';

const STATUS_COLOR: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  'EN PROCESO': 'bg-teal-100 text-teal-800',
  'ESPERANDO CLIENTE': 'bg-sky-100 text-sky-800',
  'ESPERANDO REPUESTOS': 'bg-sky-100 text-sky-800',
  PROGRAMADO: 'bg-blue-100 text-blue-800',
  FINALIZADO: 'bg-green-100 text-ok',
  CANCELADO: 'bg-slate-200 text-slate-600',
};

export function FollowUpStatusBadge({ name, isTerminal, overdue }: { name: string; isTerminal?: boolean; overdue?: boolean }) {
  const color = STATUS_COLOR[name] ?? (isTerminal ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-800');
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`badge ${color}`}>{name}</span>
      {overdue && <span className="badge bg-red-100 text-danger">Vencido</span>}
    </span>
  );
}

const PRIORITY_COLOR: Record<Priority, string> = { BAJA: 'bg-slate-100 text-slate-600', MEDIA: 'bg-blue-50 text-blue-700', ALTA: 'bg-orange-100 text-accent-dark', URGENTE: 'bg-red-100 text-danger' };
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge ${PRIORITY_COLOR[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}
