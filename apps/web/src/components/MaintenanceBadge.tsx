import { M_LABEL, type MStatus } from '../lib/api';

const COLORS: Record<MStatus, string> = {
  PROGRAMADO: 'bg-blue-100 text-blue-800',
  PENDIENTE: 'bg-amber-100 text-amber-800',
  EN_PROCESO: 'bg-teal-100 text-teal-800',
  REALIZADO: 'bg-green-100 text-ok',
  CANCELADO: 'bg-slate-200 text-slate-600',
  REPROGRAMADO: 'bg-purple-100 text-purple-800',
};

/** Estado del mantenimiento con indicador visual de vencido. */
export function MaintenanceBadge({ status, overdue }: { status: MStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`badge ${COLORS[status]}`}>{M_LABEL[status]}</span>
      {overdue && <span className="badge bg-red-100 text-danger">Vencido</span>}
    </span>
  );
}
