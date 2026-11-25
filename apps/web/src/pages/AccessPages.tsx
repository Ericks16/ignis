import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';

const RULE = 'Mínimo 10 caracteres, con mayúscula, minúscula y número.';

function useSubmit<T>(fn: () => Promise<T>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<T | null>(null);
  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { setDone(await fn()); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud'); }
    finally { setBusy(false); }
  };
  return { run, error, busy, done };
}

const Err = ({ msg }: { msg: string }) => msg ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{msg}</p> : null;
const Ok = ({ msg }: { msg: string }) => <p role="status" className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-700">{msg}</p>;
const Back = () => <p className="mt-5 text-center text-sm text-slate-600"><Link to="/" className="font-semibold text-teal-700 hover:underline">Volver a iniciar sesión</Link></p>;

/** Solicitud de acceso: crea una cuenta inactiva que un administrador debe aprobar. */
export function Register() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const s = useSubmit(() => api<{ message: string }>('/auth/register', { method: 'POST', body: { name, email, password } }));
  return (
    <AuthLayout title="Solicitar acceso" subtitle="Un administrador revisará su solicitud">
      {s.done ? <><Ok msg={s.done.message} /><Back /></> : (
        <form onSubmit={s.run}>
          <label className="label" htmlFor="name">Nombre completo</label>
          <input id="name" required minLength={2} maxLength={120} autoComplete="name" className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="label" htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" required autoComplete="username" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="label" htmlFor="password">Contraseña</label>
          <input id="password" type="password" required minLength={10} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mb-4 mt-1 text-xs text-slate-500">{RULE}</p>
          <Err msg={s.error} />
          <button className="btn-primary w-full py-2.5" disabled={s.busy}>{s.busy ? 'Enviando…' : 'Enviar solicitud'}</button>
          <Back />
        </form>
      )}
    </AuthLayout>
  );
}

/** «Olvidé mi contraseña»: envía un enlace de un solo uso al correo. */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const s = useSubmit(() => api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }));
  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Le enviaremos un enlace para elegir una nueva">
      {s.done ? <><Ok msg={s.done.message} /><Back /></> : (
        <form onSubmit={s.run}>
          <label className="label" htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" required autoComplete="username" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Err msg={s.error} />
          <button className="btn-primary w-full py-2.5" disabled={s.busy}>{s.busy ? 'Enviando…' : 'Enviar enlace'}</button>
          <Back />
        </form>
      )}
    </AuthLayout>
  );
}

/** Destino del enlace del correo: elige la nueva contraseña. */
export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const token = sp.get('token') ?? '';
  const [password, setPassword] = useState(''); const [again, setAgain] = useState('');
  const s = useSubmit(async () => {
    if (password !== again) throw new Error('Las contraseñas no coinciden');
    await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
    return true;
  });
  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elija una contraseña segura">
      {!token ? <><Err msg="El enlace está incompleto. Solicite uno nuevo." /><Back /></> : s.done ? (
        <><Ok msg="Contraseña actualizada. Ya puede iniciar sesión." /><button className="btn-primary w-full py-2.5" onClick={() => nav('/')}>Ir a iniciar sesión</button></>
      ) : (
        <form onSubmit={s.run}>
          <label className="label" htmlFor="np">Nueva contraseña</label>
          <input id="np" type="password" required minLength={10} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mb-4 mt-1 text-xs text-slate-500">{RULE}</p>
          <label className="label" htmlFor="np2">Repita la contraseña</label>
          <input id="np2" type="password" required autoComplete="new-password" className="input mb-4" value={again} onChange={(e) => setAgain(e.target.value)} />
          <Err msg={s.error} />
          <button className="btn-primary w-full py-2.5" disabled={s.busy}>{s.busy ? 'Guardando…' : 'Guardar contraseña'}</button>
          <Back />
        </form>
      )}
    </AuthLayout>
  );
}
