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
    <div className="flex min-h-screen items-center justify-center bg-navy-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-navy-900"><span className="text-accent">IGNIS</span> Maintenance</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Ingrese con su cuenta</p>
        <label className="label" htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" required autoComplete="username" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" type="password" required autoComplete="current-password" className="input mb-4" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
