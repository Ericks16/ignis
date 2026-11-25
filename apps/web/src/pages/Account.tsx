import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';

/** Cambio de contraseña. Si mustChangePassword es true, es obligatorio antes de usar el sistema. */
export function Account({ forced = false }: { forced?: boolean }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      toast('ok', 'Contraseña actualizada');
      setCurrent(''); setNext('');
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {forced && <div role="alert" className="rounded-md bg-orange-50 px-4 py-3 text-sm text-accent-dark">Debe cambiar su contraseña temporal antes de continuar.</div>}
      <div className="card">
        <h1 className="mb-1 text-xl font-semibold text-navy-900">Mi cuenta</h1>
        <p className="mb-4 text-sm text-slate-500">{user?.email}</p>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="label" htmlFor="c">Contraseña actual</label><input id="c" type="password" autoComplete="current-password" required className="input" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div><label className="label" htmlFor="nw">Nueva contraseña</label><input id="nw" type="password" autoComplete="new-password" required minLength={10} className="input" value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Mínimo 10 caracteres, con mayúscula, minúscula y número.</p></div>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <button className="btn-primary" disabled={busy}>Cambiar contraseña</button>
        </form>
      </div>
    </div>
  );
}
