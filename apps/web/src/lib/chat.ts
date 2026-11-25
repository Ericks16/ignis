import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, type Role } from './api';

export interface ChatMessage { id: string; room: string; body: string; createdAt: string; user: { id: string; name: string; role: Role } }
export type ChatStatus = 'connecting' | 'online' | 'offline';

/**
 * En producción el WebSocket va directo a la API (Vercel no reenvía WebSockets); en desarrollo, al mismo origen vía proxy de Vite.
 * La autenticación usa un ticket de un solo uso pedido con la sesión (la cookie no viaja a otro dominio).
 */
const WS_URL: string | undefined = import.meta.env.VITE_WS_URL || undefined;

export function useChat(room: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    setMessages([]); setError(''); setLoading(true); setStatus('connecting');

    api<{ items: ChatMessage[] }>(`/chat/messages?room=${encodeURIComponent(room)}`)
      .then((r) => { if (!cancelled) setMessages(r.items); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const connect = async () => {
      if (cancelled) return;
      setStatus('connecting');
      try {
        const { ticket } = await api<{ ticket: string }>('/chat/ticket', { method: 'POST' });
        if (cancelled) return;
        const socket = io(WS_URL, { auth: { ticket }, transports: ['websocket'], reconnection: false });
        socketRef.current = socket;
        socket.on('connect', () => {
          socket.emit('join', { room }, (ack: { ok: boolean; error?: string }) => {
            if (cancelled) return;
            if (ack.ok) { attempt = 0; setStatus('online'); } else { setError(ack.error ?? 'No se pudo entrar a la sala'); setStatus('offline'); }
          });
        });
        socket.on('message', (m: ChatMessage) => { if (m.room === room) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])); });
        const lost = () => {
          if (cancelled) return;
          setStatus('offline');
          // El ticket es de un solo uso: para reconectar se pide uno nuevo (con espera creciente, máx. 15 s).
          retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
        };
        socket.on('disconnect', lost);
        socket.on('connect_error', lost);
      } catch {
        if (!cancelled) { setStatus('offline'); retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++)); }
      }
    };
    void connect();

    return () => { cancelled = true; clearTimeout(retry); socketRef.current?.removeAllListeners(); socketRef.current?.close(); socketRef.current = null; };
  }, [room]);

  const send = useCallback((body: string) => new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const s = socketRef.current;
    if (!s || !s.connected) return resolve({ ok: false, error: 'Sin conexión con el chat. Reintentando…' });
    s.timeout(8000).emit('send', { room, body }, (err: Error | null, ack?: { ok: boolean; error?: string }) => resolve(err || !ack ? { ok: false, error: 'El servidor no respondió' } : ack));
  }), [room]);

  return { messages, status, loading, error, send };
}
