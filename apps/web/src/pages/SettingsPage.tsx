import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field } from '../components/ui';
import { fmtDateTime } from '../components/NotificationBits';
import { useToast } from '../components/Toast';

interface Config { leadMonths: number; repeatDays: number; maxAttempts: number; retryMinutes: number[]; sendHourLocal: number; internalRecipients: string[]; includeClientContacts: boolean }
interface Status { emailMode: 'test' | 'live'; provider: string; cronEnabled: boolean; recipientsRestricted: boolean; timezone: string }
interface Run { id: string; trigger: string; startedAt: string; finishedAt: string | null; status: 'RUNNING' | 'OK' | 'ERROR'; summary: Record<string, number | boolean> | null; error: string | null }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ConfigForm({ cfg, admin }: { cfg: Config; admin: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ leadMonths: String(cfg.leadMonths), repeatDays: String(cfg.repeatDays), maxAttempts: String(cfg.maxAttempts), sendHourLocal: String(cfg.sendHourLocal), retryMinutes: cfg.retryMinutes.join(', '), includeClientContacts: cfg.includeClientContacts });
  const [emails, setEmails] = useState<string[]>(cfg.internalRecipients);
  const [draft, setDraft] = useState('');
  const m = useMutation({
    mutationFn: () => api('/settings/reminders', { method: 'PUT', body: {
      leadMonths: Number(f.leadMonths), repeatDays: Number(f.repeatDays), maxAttempts: Number(f.maxAttempts), sendHourLocal: Number(f.sendHourLocal),
      retryMinutes: f.retryMinutes.split(',').map((x) => Number(x.trim())).filter((x) => x > 0), internalRecipients: emails, includeClientContacts: f.includeClientContacts,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reminder-settings'] }); toast('ok', 'Configuración guardada'); },
    onError: (e: Error) => toast('error', e.message),
  });
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) return toast('error', 'Ingrese un correo válido');
    if (!emails.includes(v)) setEmails([...emails, v]);
    setDraft('');
  };
  const set = (k: 'leadMonths' | 'repeatDays' | 'maxAttempts' | 'sendHourLocal' | 'retryMinutes') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-navy-900">Política de recordatorios</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Primer aviso (meses antes)" hint="Mes calendario: 31 mar → 28 feb"><input type="number" min={1} max={12} className="input" disabled={!admin} value={f.leadMonths} onChange={set('leadMonths')} /></Field>
        <Field label="Repetir cada (días)" hint="Continúa también después de vencer"><input type="number" min={1} max={60} className="input" disabled={!admin} value={f.repeatDays} onChange={set('repeatDays')} /></Field>
        <Field label="Hora de envío (Guayaquil)"><input type="number" min={0} max={23} className="input" disabled={!admin} value={f.sendHourLocal} onChange={set('sendHourLocal')} /></Field>
        <Field label="Intentos máximos por envío"><input type="number" min={1} max={10} className="input" disabled={!admin} value={f.maxAttempts} onChange={set('maxAttempts')} /></Field>
      </div>
      <Field label="Espera entre reintentos (minutos)" hint="Separados por coma. Ej.: 5, 30, 120, 720"><input className="input max-w-md" disabled={!admin} value={f.retryMinutes} onChange={set('retryMinutes')} /></Field>
      <div>
        <span className="label">Correos internos (reciben todos los recordatorios)</span>
        <div className="mb-2 flex flex-wrap gap-2">
          {emails.length === 0 && <span className="text-sm text-slate-500">Ninguno. Solo recibirá el responsable de cada seguimiento.</span>}
          {emails.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-800">{e}{admin && <button type="button" aria-label={`Quitar ${e}`} className="text-teal-700" onClick={() => setEmails(emails.filter((x) => x !== e))}>×</button>}</span>
          ))}
        </div>
        {admin && <div className="flex max-w-md gap-2"><input type="email" className="input" placeholder="administracion@empresa.com" aria-label="Nuevo correo interno" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /><button type="button" className="btn-secondary" onClick={add}>Agregar</button></div>}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" disabled={!admin} checked={f.includeClientContacts} onChange={(e) => setF({ ...f, includeClientContacts: e.target.checked })} />
        <span>Enviar también a los contactos del cliente marcados con «recibe recordatorios»<span className="block text-xs text-slate-500">Apagado por defecto: el correo contiene información interna y los avisos de «vencido».</span></span>
      </label>
      <p className="text-xs text-slate-500">Además de estos correos, siempre recibe el responsable del seguimiento (o del sistema, en mantenimientos).</p>
      {admin && <div className="flex justify-end"><button className="btn-primary" disabled={m.isPending}>Guardar configuración</button></div>}
    </form>
  );
}

/** Configuración de recordatorios, estado del correo/scheduler y registro de ejecuciones. */
export function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const admin = user?.role === 'ADMIN';
  const cfg = useQuery({ queryKey: ['reminder-settings'], queryFn: () => api<Config>('/settings/reminders') });
  const status = useQuery({ queryKey: ['reminder-settings', 'status'], queryFn: () => api<Status>('/settings/reminders/status') });
  const runs = useQuery({ queryKey: ['notifications', 'runs'], queryFn: () => api<Run[]>('/notifications/runs') });
  const runNow = useMutation({
    mutationFn: () => api<Record<string, number>>('/notifications/run', { method: 'POST' }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast('ok', `Ejecución completa: ${r.created} generados, ${r.sent} enviados, ${r.failed} con error`); },
    onError: (e: Error) => toast('error', e.message),
  });
  const s = status.data;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Configuración de recordatorios</h1>
      {s && s.emailMode === 'test' && <div role="status" className="rounded-md bg-orange-50 px-4 py-3 text-sm text-accent-dark"><b>Modo de prueba:</b> el sistema registra los recordatorios pero NO envía correos reales. Para activar los envíos configure <code>EMAIL_MODE=live</code> y un proveedor en el servidor.</div>}
      {s && s.emailMode === 'live' && <div role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-ok">Envío real activo con <b>{s.provider}</b>{s.recipientsRestricted ? ' · restringido a la lista de destinatarios permitidos (piloto)' : ''}.</div>}
      {s && !s.cronEnabled && <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-danger">El cron externo está deshabilitado (falta <code>CRON_SECRET</code>): los recordatorios solo saldrán al ejecutarlos manualmente.</div>}
      {cfg.data && <ConfigForm cfg={cfg.data} admin={admin} />}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy-900">Ejecuciones del programador</h2>
          {admin && <button className="btn-primary" disabled={runNow.isPending} onClick={() => runNow.mutate()}>{runNow.isPending ? 'Ejecutando…' : 'Ejecutar ahora'}</button>}
        </div>
        <p className="mb-3 text-sm text-slate-500">El cron externo llama al sistema una vez al día. «Ejecutar ahora» genera y envía lo pendiente sin esperar al cron; es seguro repetirlo porque no duplica envíos.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-2">Inicio</th><th className="p-2">Origen</th><th className="p-2">Resultado</th><th className="p-2">Generados</th><th className="p-2">Enviados</th><th className="p-2">Con error</th><th className="p-2">Cancelados</th></tr></thead>
            <tbody>
              {runs.data?.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Aún no hay ejecuciones.</td></tr>}
              {runs.data?.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-2 whitespace-nowrap">{fmtDateTime(r.startedAt)}</td><td className="p-2">{r.trigger === 'cron' ? 'Cron' : r.trigger === 'manual' ? 'Manual' : r.trigger}</td>
                  <td className="p-2"><span className={`badge ${r.status === 'OK' ? 'bg-green-100 text-ok' : r.status === 'ERROR' ? 'bg-red-100 text-danger' : 'bg-amber-100 text-amber-800'}`}>{r.status === 'OK' ? 'Correcta' : r.status === 'ERROR' ? 'Con error' : 'En curso'}</span>{r.error && <div className="text-xs text-danger">{r.error}</div>}</td>
                  <td className="p-2">{String(r.summary?.created ?? '—')}</td><td className="p-2">{String(r.summary?.sent ?? '—')}</td><td className="p-2">{String(r.summary?.failed ?? '—')}</td>
                  <td className="p-2">{r.summary ? Number(r.summary.cancelledIneligible ?? 0) + Number(r.summary.cancelledAtSend ?? 0) + Number(r.summary.superseded ?? 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
