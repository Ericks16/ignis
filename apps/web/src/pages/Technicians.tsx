import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, canWrite, dateOnly, type Page, type Technician } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, Field, Pager, StatusBadge } from '../components/ui';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

function TechnicianForm({ tech, onDone }: { tech?: Technician; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => api<{ id: string; name: string }[]>('/user-options') });
  const [f, setF] = useState({
    name: tech?.name ?? '', email: tech?.email ?? '', phone: tech?.phone ?? '', position: tech?.position ?? '', specialty: tech?.specialty ?? '',
    initials: tech?.initials ?? '', hireDate: dateOnly(tech?.hireDate), userId: tech?.userId ?? '', notes: tech?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => (tech ? api(`/technicians/${tech.id}`, { method: 'PATCH', body: f }) : api('/technicians', { method: 'POST', body: f })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['technicians'] }); toast('ok', 'Técnico guardado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nombre *"><input className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Correo"><input type="email" className="input" value={f.email} onChange={set('email')} /></Field>
        <Field label="Teléfono"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Cargo"><input className="input" value={f.position} onChange={set('position')} /></Field>
        <Field label="Especialidad"><input className="input" value={f.specialty} onChange={set('specialty')} /></Field>
        <Field label="Iniciales" hint="Como en las agendas del Excel (JA, MC…)"><input className="input" maxLength={6} pattern="[A-Za-z]{1,6}" value={f.initials} onChange={set('initials')} /></Field>
        <Field label="Fecha de ingreso"><input type="date" className="input" value={f.hireDate} onChange={set('hireDate')} /></Field>
      </div>
      <Field label="Usuario del sistema" hint="Vincúlelo para que el técnico vea sus trabajos asignados al iniciar sesión.">
        <select className="input" value={f.userId} onChange={set('userId')}>
          <option value="">Sin usuario</option>
          {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Observaciones"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar técnico</button>
      </div>
    </form>
  );
}

export function Technicians() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const write = canWrite(user?.role);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ tech?: Technician } | null>(null);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}), ...(status ? { status } : {}) });
  const q = useQuery({ queryKey: ['technicians', search, status, page], queryFn: () => api<Page<Technician>>(`/technicians?${qs}`), placeholderData: (p) => p });
  const toggle = useMutation({
    mutationFn: (t: Technician) => api(`/technicians/${t.id}/${t.status === 'ACTIVE' ? 'deactivate' : 'reactivate'}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['technicians'] }), onError: (e: Error) => toast('error', e.message),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Técnicos y personal</h1>
        {write && <button className="btn-primary" onClick={() => setModal({})}>Nuevo técnico</button>}
      </div>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-sm" placeholder="Buscar por nombre, correo o especialidad" aria-label="Buscar técnicos" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input w-auto" aria-label="Estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option>
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Nombre</th><th className="p-3">Iniciales</th><th className="p-3">Cargo / especialidad</th><th className="p-3">Contacto</th><th className="p-3">Usuario</th><th className="p-3">Estado</th>{write && <th className="p-3 text-right">Acciones</th>}</tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={7}><Empty>Cargando…</Empty></td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={7}><Empty>No hay técnicos que coincidan.</Empty></td></tr>}
            {q.data?.items.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{t.name}</td><td className="p-3">{t.initials ?? '—'}</td>
                <td className="p-3">{[t.position, t.specialty].filter(Boolean).join(' · ') || '—'}</td>
                <td className="p-3">{t.email ?? t.phone ?? '—'}</td><td className="p-3">{t.user?.email ?? '—'}</td>
                <td className="p-3"><StatusBadge status={t.status} /></td>
                {write && <td className="space-x-2 p-3 text-right">
                  <button className="btn-secondary py-1" onClick={() => setModal({ tech: t })}>Editar</button>
                  <button className="btn-secondary py-1" onClick={() => toggle.mutate(t)}>{t.status === 'ACTIVE' ? 'Desactivar' : 'Reactivar'}</button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
      {modal && <Modal title={modal.tech ? 'Editar técnico' : 'Nuevo técnico'} onClose={() => setModal(null)}><TechnicianForm tech={modal.tech} onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}
