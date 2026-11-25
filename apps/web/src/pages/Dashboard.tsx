import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, ClipboardList, Clock3, Cpu, FileBarChart, Hourglass, MapPin, PauseCircle, PlayCircle, Timer, UserCheck, UserX, Users, Wrench, type LucideIcon } from 'lucide-react';
import { api, dateOnly, type Maintenance } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MaintenanceBadge } from '../components/MaintenanceBadge';

interface Summary {
  generatedAt: string;
  users: { active: number; inactive: number } | null;
  clients: { total: number; active: number; inactive: number; needingAttention: number | null; attention: { clientId: string; name: string; overdueMaintenances: number; overdueFollowUps: number }[] | null };
  installations: number;
  systems: number;
  systemsByCategory: { name: string; count: number }[];
  followUps: { pending: number; inProgress: number; finished: number; open: number; overdue: number; upcoming: number; byStatus: { id: string; name: string; isTerminal: boolean; count: number }[] };
  maintenance: { scheduled: number; upcoming: number; overdue: number; year: number; monthly: { month: number; scheduled: number; done: number }[]; nextVisits: Maintenance[] };
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Tarjeta con cifra; si recibe `to`, es un enlace a la lista ya filtrada. */
function Stat({ label, value, tone, to, icon: Icon }: { label: string; value: number; tone?: 'danger' | 'warn'; to?: string; icon?: LucideIcon }) {
  const hot = (tone === 'danger' || tone === 'warn') && value > 0;
  const color = tone === 'danger' && value > 0 ? 'text-danger' : tone === 'warn' && value > 0 ? 'text-accent-dark' : 'text-navy-900';
  const chip = tone === 'danger' && value > 0 ? 'bg-red-50 text-danger' : tone === 'warn' && value > 0 ? 'bg-orange-50 text-accent' : 'bg-teal-500/10 text-teal-700';
  const strip = tone === 'danger' && value > 0 ? 'bg-danger' : tone === 'warn' && value > 0 ? 'bg-accent' : 'bg-teal-500';
  const body = (
    <>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${hot ? strip : 'bg-transparent group-hover:bg-teal-500'} transition`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className={`mt-2 font-display text-3xl font-bold tabular-nums ${color}`}>{value}</div>
        </div>
        {Icon && <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${chip}`}><Icon size={20} /></span>}
      </div>
    </>
  );
  const cls = 'card group relative block overflow-hidden';
  return to
    ? <Link to={to} className={`${cls} transition hover:-translate-y-0.5 hover:border-teal-600/50 hover:shadow-md`} aria-label={`${label}: ${value}. Ver detalle`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

function Section({ title, children, cols = 4 }: { title: string; children: ReactNode; cols?: 3 | 4 }) {
  return (
    <section aria-label={title}>
      <h2 className="section-title mb-3">{title}</h2>
      <div className={`grid gap-4 sm:grid-cols-2 ${cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{children}</div>
    </section>
  );
}

function Bars({ items, tone }: { items: { key: string; label: string; value: number; dim?: boolean }[]; tone: 'teal' | 'navy' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s.key} className="flex items-center gap-3 text-sm">
          <span className="w-44 shrink-0 truncate" title={s.label}>{s.label}</span>
          <div className="h-3 flex-1 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${s.dim ? "bg-slate-300" : tone === "teal" ? "bg-teal-500" : "bg-navy-800"}`} style={{ width: `${(s.value / max) * 100}%` }} /></div>
          <span className="w-8 text-right font-medium">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

function MonthlyChart({ monthly, year, onYear, years }: { monthly: Summary['maintenance']['monthly']; year: number; onYear: (y: number) => void; years: number[] }) {
  const max = Math.max(1, ...monthly.map((m) => Math.max(m.scheduled, m.done)));
  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy-900">Mantenimientos por mes</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">Año
          <select className="input w-auto py-1" aria-label="Año del resumen mensual" value={year} onChange={(e) => onYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
      </div>
      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-teal-500" />Realizados</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-accent" />Pendientes por realizar</span>
      </div>
      <div className="flex h-40 items-end gap-2" role="img" aria-label={`Mantenimientos realizados y pendientes por mes en ${year}`}>
        {monthly.map((m) => (
          <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <div className="w-1/2 rounded-t bg-teal-500" style={{ height: `${(m.done / max) * 100}%` }} title={`${MONTHS[m.month - 1]}: ${m.done} realizados`} />
              <div className="w-1/2 rounded-t bg-accent" style={{ height: `${(m.scheduled / max) * 100}%` }} title={`${MONTHS[m.month - 1]}: ${m.scheduled} pendientes`} />
            </div>
            <span className="text-xs text-slate-500">{MONTHS[m.month - 1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dashboard: todos los indicadores se calculan con datos reales de la base de datos. */
export function Dashboard() {
  const { user } = useAuth();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const q = useQuery({ queryKey: ['dashboard', year], queryFn: () => api<Summary>(`/dashboard/summary?year=${year}`), placeholderData: (p) => p });
  const d = q.data;
  const years = Array.from({ length: 6 }, (_, i) => thisYear + 1 - i);
  const staff = user?.role !== 'TECNICO';

  return (
    <div className="space-y-6">
      <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl bg-navy-900 px-6 py-5 text-white md:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-teal-500/15" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-40 h-44 w-44 rounded-full bg-accent/15" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-500">{new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guayaquil' })}</p>
          <h1 className="mt-1 font-display text-2xl font-bold md:text-3xl">Hola, {user?.name}</h1>
          <p className="mt-1 text-sm text-slate-300">Panel de operación de IGNIS Fire Protection</p>
        </div>
        <Link className="btn relative bg-white text-navy-900 shadow-sm hover:bg-teal-500 hover:text-white" to="/reportes"><FileBarChart aria-hidden size={16} />Ver reportes y exportar</Link>
      </div>
      {q.isLoading && <p className="text-slate-500">Cargando…</p>}
      {q.isError && <p role="alert" className="text-danger">No se pudo cargar el resumen.</p>}
      {d && (
        <>
          <Section title="Mantenimientos">
            <Stat icon={CalendarClock} label="Mantenimientos programados" value={d.maintenance.scheduled} to="/mantenimientos?due=open" />
            <Stat icon={Timer} label="Mantenimientos próximos (30 días)" value={d.maintenance.upcoming} tone="warn" to="/mantenimientos?due=upcoming" />
            <Stat icon={AlertTriangle} label="Mantenimientos vencidos" value={d.maintenance.overdue} tone="danger" to="/mantenimientos?due=overdue" />
            <Stat icon={Cpu} label="Sistemas activos" value={d.systems} to="/sistemas?status=ACTIVE" />
          </Section>
          <Section title="Seguimientos">
            <Stat icon={Hourglass} label="Seguimientos pendientes" value={d.followUps.pending} to={`/seguimientos?state=open${d.followUps.byStatus.find((s) => s.name === 'PENDIENTE') ? `&statusId=${d.followUps.byStatus.find((s) => s.name === 'PENDIENTE')!.id}` : ''}`} />
            <Stat icon={PlayCircle} label="Seguimientos en proceso" value={d.followUps.inProgress} to={`/seguimientos?${d.followUps.byStatus.find((s) => s.name === 'EN PROCESO') ? `statusId=${d.followUps.byStatus.find((s) => s.name === 'EN PROCESO')!.id}` : ''}`} />
            <Stat icon={CheckCircle2} label="Seguimientos finalizados" value={d.followUps.finished} to="/seguimientos?state=closed" />
            <Stat icon={AlertTriangle} label="Seguimientos vencidos" value={d.followUps.overdue} tone="danger" to="/seguimientos?state=overdue" />
          </Section>
          <Section title="Cartera y seguimientos abiertos">
            {d.clients.needingAttention !== null && <Stat icon={Wrench} label="Clientes que requieren atención" value={d.clients.needingAttention} tone="danger" />}
            <Stat icon={ClipboardList} label="Seguimientos abiertos" value={d.followUps.open} to="/seguimientos?state=open" />
            <Stat icon={Clock3} label="Seguimientos que vencen en 30 días" value={d.followUps.upcoming} tone="warn" to="/seguimientos?state=upcoming" />
            <Stat icon={Building2} label="Total de clientes" value={d.clients.total} to="/clientes" />
            <Stat icon={UserCheck} label="Clientes activos" value={d.clients.active} to="/clientes" />
            <Stat icon={PauseCircle} label="Clientes inactivos" value={d.clients.inactive} to="/clientes" />
            <Stat icon={MapPin} label="Instalaciones activas" value={d.installations} to="/instalaciones" />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <MonthlyChart monthly={d.maintenance.monthly} year={year} onYear={setYear} years={years} />
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold text-navy-900">Próximas visitas</h2>
              {d.maintenance.nextVisits.length === 0 && <p className="text-sm text-slate-500">No hay visitas programadas.</p>}
              <ul className="divide-y">
                {d.maintenance.nextVisits.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <Link className="font-medium text-teal-700 hover:underline" to={`/mantenimientos/${m.id}`}>{dateOnly(m.scheduledDate)} · {m.system.installation.client.commercialName}</Link>
                      <div className="text-xs text-slate-500">{m.type.name} · {m.system.installation.name}</div>
                    </div>
                    <MaintenanceBadge status={m.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold text-navy-900">Seguimientos por estado</h2>
              <Bars tone="teal" items={d.followUps.byStatus.map((s) => ({ key: s.id, label: s.name, value: s.count, dim: s.isTerminal }))} />
            </div>
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold text-navy-900">Sistemas por categoría</h2>
              <Bars tone="navy" items={d.systemsByCategory.map((c) => ({ key: c.name, label: c.name, value: c.count }))} />
            </div>
          </div>

          {staff && d.clients.attention && (
            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-navy-900">Clientes que requieren atención</h2>
                <Link className="text-sm text-teal-700 hover:underline" to="/reportes/maintenance-overdue">Ver mantenimientos vencidos</Link>
              </div>
              {d.clients.attention.length === 0 ? <p className="text-sm text-slate-500">Ningún cliente tiene pendientes vencidos. ¡Todo al día!</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-2">Cliente</th><th className="p-2 text-right">Mantenimientos vencidos</th><th className="p-2 text-right">Seguimientos vencidos</th></tr></thead>
                  <tbody>
                    {d.clients.attention.map((c) => (
                      <tr key={c.clientId} className="border-b last:border-0">
                        <td className="p-2"><Link className="font-medium text-teal-700 hover:underline" to={`/clientes/${c.clientId}`}>{c.name}</Link></td>
                        <td className={`p-2 text-right ${c.overdueMaintenances ? 'font-medium text-danger' : 'text-slate-400'}`}>{c.overdueMaintenances}</td>
                        <td className={`p-2 text-right ${c.overdueFollowUps ? 'font-medium text-danger' : 'text-slate-400'}`}>{c.overdueFollowUps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {d.clients.needingAttention !== null && d.clients.needingAttention > d.clients.attention.length && <p className="mt-2 text-xs text-slate-500">Se muestran los {d.clients.attention.length} más urgentes de {d.clients.needingAttention}.</p>}
            </div>
          )}

          {d.users && (
            <Section title="Usuarios del sistema">
              <Stat icon={Users} label="Usuarios activos" value={d.users.active} to="/usuarios" />
              <Stat icon={UserX} label="Usuarios inactivos" value={d.users.inactive} to="/usuarios" />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
