import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquare, Send, Users, Wrench, ClipboardList } from 'lucide-react';
import { useChat, type ChatStatus } from '../lib/chat';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/api';

const UUID = /^[0-9a-f-]{36}$/;

function describeRoom(room: string) {
  if (room === 'general') return { title: 'Chat general', hint: 'Todo el personal de IGNIS', Icon: Users, back: null as string | null };
  const [kind, id] = room.split(':');
  if (kind === 'followup' && UUID.test(id ?? '')) return { title: 'Chat del seguimiento', hint: 'Solo quienes pueden ver este seguimiento', Icon: ClipboardList, back: `/seguimientos/${id}` };
  if (kind === 'maintenance' && UUID.test(id ?? '')) return { title: 'Chat del mantenimiento', hint: 'Solo quienes pueden ver este mantenimiento', Icon: Wrench, back: `/mantenimientos/${id}` };
  return { title: 'Chat general', hint: 'Todo el personal de IGNIS', Icon: Users, back: null };
}

const STATUS: Record<ChatStatus, { label: string; dot: string }> = {
  online: { label: 'En línea', dot: 'bg-teal-500' },
  connecting: { label: 'Conectando…', dot: 'bg-accent animate-pulse' },
  offline: { label: 'Sin conexión, reintentando…', dot: 'bg-danger' },
};

const time = (iso: string) => new Date(iso).toLocaleString('es-EC', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', timeZone: 'America/Guayaquil' });

/** Chat interno en tiempo real (WebSocket): sala general y una sala por seguimiento o mantenimiento. */
export function ChatPage() {
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const requested = sp.get('room') ?? 'general';
  const room = /^(general|(followup|maintenance):[0-9a-f-]{36})$/.test(requested) ? requested : 'general';
  const info = describeRoom(room);
  const { messages, status, loading, error, send } = useChat(room);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true); setSendError('');
    const r = await send(body);
    setBusy(false);
    if (r.ok) setText(''); else setSendError(r.error ?? 'No se pudo enviar');
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-[420px] max-w-4xl flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700"><info.Icon size={22} /></span>
          <div>
            <h1 className="font-display text-2xl font-bold text-navy-900">{info.title}</h1>
            <p className="text-sm text-slate-500">{info.hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-slate-600"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${STATUS[status].dot}`} /><span role="status">{STATUS[status].label}</span></span>
          {info.back ? <Link to={info.back} className="btn-secondary py-1.5">Volver al detalle</Link> : null}
          {room !== 'general' ? <Link to="/chat" className="btn-secondary py-1.5">Chat general</Link> : null}
        </div>
      </div>

      <div className="card flex min-h-0 flex-1 flex-col p-0">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-label="Mensajes">
          {loading && <p className="text-center text-sm text-slate-500">Cargando mensajes…</p>}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          {!loading && !error && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-500">
              <MessageSquare aria-hidden size={36} className="text-slate-300" />
              <p>Aún no hay mensajes. ¡Escriba el primero!</p>
            </div>
          )}
          {messages.map((m) => {
            const mine = m.user.id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? 'rounded-br-sm bg-navy-900 text-white' : 'rounded-bl-sm bg-slate-100 text-slate-800'}`}>
                  <div className={`mb-0.5 flex items-center gap-2 text-xs ${mine ? 'text-teal-500' : 'text-slate-500'}`}>
                    <span className="font-semibold">{mine ? 'Usted' : m.user.name}</span>
                    <span>{ROLE_LABEL[m.user.role]}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className={`mt-1 text-right text-[11px] ${mine ? 'text-slate-400' : 'text-slate-400'}`}>{time(m.createdAt)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
        <form onSubmit={submit} className="border-t border-slate-200 p-3">
          {sendError && <p role="alert" className="mb-2 text-sm text-danger">{sendError}</p>}
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="chat-input">Mensaje</label>
            <textarea id="chat-input" rows={1} maxLength={1000} className="input max-h-32 resize-none" placeholder="Escriba un mensaje…" value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            <button className="btn-primary h-10" disabled={busy || !text.trim() || status !== 'online'}><Send aria-hidden size={16} />Enviar</button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Enter envía · Mayús+Enter salto de línea · {text.length}/1000</p>
        </form>
      </div>
    </div>
  );
}
