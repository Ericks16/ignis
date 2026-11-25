import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ROLE_LABEL, type Role, type UserRow } from '../lib/api';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

interface Page { items: UserRow[]; total: number; page: number; pageSize: number }
const ROLES = Object.keys(ROLE_LABEL) as Role[];
const PASS_HINT = 'Mínimo 10 caracteres, con mayúscula, minúscula y número';

function CreateForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', role: 'CONSULTA' as Role, password: '' });
  const m = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: f }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('ok', 'Usuario creado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><label className="label" htmlFor="n">Nombre</label><input id="n" className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><label className="label" htmlFor="e">Correo</label><input id="e" type="email" className="input" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><label className="label" htmlFor="r">Rol</label>
        <select id="r" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
      <div><label className="label" htmlFor="p">Contraseña temporal</label><input id="p" type="password" className="input" required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><p className="mt-1 text-xs text-slate-500">{PASS_HINT}. El usuario deberá cambiarla al ingresar.</p></div>
      <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button><button className="btn-primary" disabled={m.isPending}>Crear usuario</button></div>
    </form>
  );
}

function ResetForm({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/users/${user.id}/reset-password`, { method: 'POST', body: { password } }),
    onSuccess: () => { toast('ok', 'Contraseña restablecida'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
      <p className="text-sm text-slate-600">Nueva contraseña temporal para <b>{user.name}</b>. Se cerrarán sus sesiones activas.</p>
      <input type="password" aria-label="Nueva contraseña temporal" className="input" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
      <p className="text-xs text-slate-500">{PASS_HINT}</p>
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button><button className="btn-primary" disabled={m.isPending}>Restablecer</button></div>
    </form>
  );
}

export function Users() {
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const q = useQuery({
    queryKey: ['users', search, page],
    queryFn: () => api<Page>(`/users?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('ok', 'Usuario actualizado'); },
    onError: (e: Error) => toast('error', e.message),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Usuarios</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>Nuevo usuario</button>
      </div>
      <input className="input max-w-sm" placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Nombre</th><th className="p-3">Correo</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Cargando…</td></tr>}
            {q.isError && <tr><td colSpan={5} className="p-6 text-center text-danger">No se pudo cargar la lista.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No hay usuarios que coincidan.</td></tr>}
            {q.data?.items.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <select aria-label={`Rol de ${u.name}`} className="input w-auto py-1" value={u.role} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="p-3"><span className={`badge ${u.active ? 'bg-green-100 text-ok' : 'bg-slate-200 text-slate-600'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                <td className="space-x-2 p-3 text-right">
                  <button className="btn-secondary py-1" onClick={() => setResetting(u)}>Restablecer clave</button>
                  <button className="btn-secondary py-1" onClick={() => patch.mutate({ id: u.id, body: { active: !u.active } })}>{u.active ? 'Desactivar' : 'Reactivar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{q.data?.total ?? 0} usuarios</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages}</span>
          <button className="btn-secondary py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      </div>
      {creating && <Modal title="Nuevo usuario" onClose={() => setCreating(false)}><CreateForm onDone={() => setCreating(false)} /></Modal>}
      {resetting && <Modal title="Restablecer contraseña" onClose={() => setResetting(null)}><ResetForm user={resetting} onDone={() => setResetting(null)} /></Modal>}
    </div>
  );
}
