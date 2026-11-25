import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Clock3, Info } from 'lucide-react';
import { api } from '../lib/api';

interface AlertItem { kind: 'followup' | 'maintenance'; id: string; title: string; client: string; date: string; daysLeft: number }
interface Alerts { overdue: number; upcoming: number; total: number; items: AlertItem[]; withoutEmailRecipient: number | null }

const when = (d: number) => (d < 0 ? `Vencido hace ${-d} ${-d === 1 ? 'día' : 'días'}` : d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `Vence en ${d} días`);
const fmt = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Campana de alertas dentro del sistema. Muestra lo vencido y lo que vence en 30 días según el alcance del usuario.
 * No depende del correo: aparece aunque el cliente no tenga correo o el envío esté desactivado.
 */
export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alerts>('/alerts'), refetchInterval: 60_000 });
  const d = q.data;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const count = d?.total ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button className="btn-secondary relative px-2.5" aria-label={`Alertas: ${d?.overdue ?? 0} vencidas, ${d?.upcoming ?? 0} por vencer`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell aria-hidden size={18} />
        {count > 0 && <span aria-hidden className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${d!.overdue > 0 ? 'bg-danger' : 'bg-accent'}`}>{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Alertas" className="absolute right-0 z-20 mt-2 w-[22rem] max-w-[92vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 bg-navy-900 px-4 py-3 text-white">
            <div className="font-display text-sm font-semibold">Alertas</div>
            <div className="text-xs text-slate-300">{d ? `${d.overdue} vencidas · ${d.upcoming} por vencer (30 días)` : 'Cargando…'}</div>
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {q.isError && <li className="p-4 text-sm text-danger">No se pudieron cargar las alertas.</li>}
            {d && d.items.length === 0 && <li className="p-4 text-sm text-slate-500">Todo al día. No hay vencimientos próximos.</li>}
            {d?.items.map((i) => (
              <li key={`${i.kind}-${i.id}`}>
                <Link onClick={() => setOpen(false)} to={i.kind === 'followup' ? `/seguimientos/${i.id}` : `/mantenimientos/${i.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <span aria-hidden className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i.daysLeft < 0 ? 'bg-red-50 text-danger' : 'bg-orange-50 text-accent'}`}>{i.daysLeft < 0 ? <AlertTriangle size={16} /> : <Clock3 size={16} />}</span>
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium text-navy-900">{i.title}</span>
                    <span className="block truncate text-xs text-slate-500">{i.kind === 'followup' ? 'Seguimiento' : 'Mantenimiento'} · {i.client}</span>
                    <span className={`block text-xs font-medium ${i.daysLeft < 0 ? 'text-danger' : 'text-accent-dark'}`}>{when(i.daysLeft)} · {fmt(i.date)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {d && d.total > d.items.length && <div className="border-t px-4 py-2 text-xs text-slate-500">Se muestran las {d.items.length} más urgentes de {d.total}.</div>}
          {d?.withoutEmailRecipient ? (
            <div className="flex gap-2 border-t bg-slate-50 px-4 py-3 text-xs text-slate-600"><Info aria-hidden size={14} className="mt-0.5 shrink-0 text-teal-700" />
              <span>{d.withoutEmailRecipient} {d.withoutEmailRecipient === 1 ? 'seguimiento no tiene' : 'seguimientos no tienen'} a quién avisar por correo. Siguen apareciendo aquí; asigne un responsable o agregue un correo interno en Recordatorios.</span></div>
          ) : null}
        </div>
      )}
    </div>
  );
}
