import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AuthLayout } from '../components/AuthLayout';

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
    <AuthLayout title="Bienvenido" subtitle="Ingrese con su cuenta de IGNIS">
      <form onSubmit={submit}>
        <label className="label" htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" required autoComplete="username" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" type="password" required autoComplete="current-password" className="input mb-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="mb-4 text-right"><Link to="/olvide" className="text-sm text-teal-700 hover:underline">¿Olvidó su contraseña?</Link></div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">¿No tiene cuenta? <Link to="/registro" className="font-semibold text-teal-700 hover:underline">Solicitar acceso</Link></p>
    </AuthLayout>
  );
}
