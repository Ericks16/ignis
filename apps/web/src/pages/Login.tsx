import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(email, password); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión'); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section aria-hidden className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-500/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-accent/10" />
        <img src="/brand/logo.png" alt="" className="relative h-14 w-auto self-start" />
        <div className="relative flex items-end gap-6">
          <div className="max-w-sm pb-10">
            <h2 className="font-display text-3xl font-bold leading-tight">Cada sistema,<br /><span className="text-accent">protegido y al día.</span></h2>
            <p className="mt-4 text-slate-300">Mantenimientos, seguimientos y recordatorios de tus instalaciones contra incendios en un solo lugar.</p>
          </div>
          <img src="/brand/mascota.png" alt="" className="h-80 w-auto select-none drop-shadow-2xl" />
        </div>
      </section>

      <main className="flex items-center justify-center bg-surface p-6">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_10px_40px_rgba(10,46,58,0.10)]">
          <div className="-mx-8 -mt-8 mb-6 rounded-t-2xl bg-navy-900 px-8 py-5 lg:hidden"><img src="/brand/logo.png" alt="IGNIS Fire Protection" className="h-11 w-auto" /></div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Bienvenido</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">Ingrese con su cuenta de IGNIS</p>
          <label className="label" htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" required autoComplete="username" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="label" htmlFor="password">Contraseña</label>
          <input id="password" type="password" required autoComplete="current-password" className="input mb-4" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
          <p className="mt-6 text-center text-xs text-slate-400">IGNIS Fire Protection · Sistema de gestión de mantenimientos</p>
        </form>
      </main>
    </div>
  );
}
