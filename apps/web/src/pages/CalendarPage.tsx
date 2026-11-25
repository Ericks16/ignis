import { useCallback, useState } from 'react';
import type { DatesSetArg } from '@fullcalendar/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import esLocale from '@fullcalendar/core/locales/es';
import { api, M_LABEL, type CalendarEvent, type CatalogItem, type MStatus } from '../lib/api';

const FOLLOWUP_COLOR = '#6d28d9';

const COLOR: Record<MStatus, string> = {
  PROGRAMADO: '#1d4ed8', PENDIENTE: '#b45309', EN_PROCESO: '#13677a', REALIZADO: '#2e7d32', CANCELADO: '#64748b', REPROGRAMADO: '#7e22ce',
};

/** Calendario de mantenimientos: solo lectura (las fechas se cambian reprogramando, con motivo, desde el detalle). */
export function CalendarPage() {
  const nav = useNavigate();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [f, setF] = useState({ clientId: '', technicianId: '', status: '', typeId: '', categoryId: '' });
  const types = useQuery({ queryKey: ['catalog', 'maintenance-types'], queryFn: () => api<CatalogItem[]>('/catalogs/maintenance-types') });
  const cats = useQuery({ queryKey: ['catalog', 'system-categories'], queryFn: () => api<CatalogItem[]>('/catalogs/system-categories') });
  const techs = useQuery({ queryKey: ['technician-options'], queryFn: () => api<{ id: string; name: string }[]>('/technicians/options') });
  const clients = useQuery({ queryKey: ['clients', 'options'], queryFn: () => api<{ items: { id: string; commercialName: string }[] }>('/clients?pageSize=100&status=ACTIVE') });
  const qs = new URLSearchParams({ ...(range ?? {}), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const events = useQuery({ queryKey: ['calendar', qs.toString()], enabled: !!range, queryFn: () => api<CalendarEvent[]>(`/calendar?${qs}`), placeholderData: (p) => p });
  // Callback estable y sin re-render si el rango no cambió (evita un bucle infinito con FullCalendar).
  const onDates = useCallback((a: DatesSetArg) => {
    const from = a.startStr.slice(0, 10);
    const to = new Date(a.end.getTime() - 86_400_000).toISOString().slice(0, 10);
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);
  const sel = (k: keyof typeof f, label: string, opts: { id: string; name: string }[] | undefined) => (
    <select className="input w-auto" aria-label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
      <option value="">{label}</option>{opts?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Calendario</h1>
      <div className="flex flex-wrap gap-3">
        {sel('clientId', 'Todos los clientes', clients.data?.items.map((c) => ({ id: c.id, name: c.commercialName })))}
        {sel('technicianId', 'Todos los técnicos', techs.data)}
        {sel('typeId', 'Todos los tipos', types.data)}
        {sel('categoryId', 'Todos los sistemas', cats.data)}
        <select className="input w-auto" aria-label="Estado" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Todos los estados</option>{(Object.keys(M_LABEL) as MStatus[]).map((s) => <option key={s} value={s}>{M_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(Object.keys(M_LABEL) as MStatus[]).map((s) => <span key={s} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: COLOR[s] }} />{M_LABEL[s]}</span>)}
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: FOLLOWUP_COLOR }} />Seguimiento (fecha objetivo)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-red-600" />Vencido</span>
      </div>
      <div className="card">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          locales={[esLocale]} locale="es" timeZone="UTC" firstDay={1}
          initialView="dayGridMonth" height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' }}
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista' }}
          datesSet={onDates}
          events={events.data?.map((e) => ({
            id: e.id, title: e.title, start: e.date, allDay: true, backgroundColor: e.kind === 'FOLLOWUP' ? (e.closed ? '#94a3b8' : FOLLOWUP_COLOR) : COLOR[e.status as MStatus], borderColor: e.overdue ? '#dc2626' : e.kind === 'FOLLOWUP' ? FOLLOWUP_COLOR : COLOR[e.status as MStatus],
            classNames: e.overdue ? ['ring-2', 'ring-red-600'] : [], extendedProps: e,
          })) ?? []}
          eventClick={(i) => nav(`${(i.event.extendedProps as CalendarEvent).kind === 'FOLLOWUP' ? '/seguimientos' : '/mantenimientos'}/${i.event.id}`)}
          eventDidMount={(i) => { const p = i.event.extendedProps as CalendarEvent; i.el.title = `${p.client}${p.installation ? ` · ${p.installation}` : ''}\n${p.kind === 'FOLLOWUP' ? 'Seguimiento' : p.category}\n${p.kind === 'FOLLOWUP' ? p.status : M_LABEL[p.status as MStatus]}${p.overdue ? ' (vencido)' : ''}\nTécnicos: ${p.technicians.join(', ') || '—'}`; }}
        />
        {events.isError && <p role="alert" className="mt-2 text-sm text-danger">No se pudo cargar el calendario.</p>}
      </div>
    </div>
  );
}
