import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, canWrite, type Client, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, Pager, StatusBadge } from '../components/ui';
import { Modal } from '../components/Modal';
import { ClientForm } from './ClientForm';

export function Clients() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}), ...(status ? { status } : {}) });
  const q = useQuery({ queryKey: ['clients', search, status, page], queryFn: () => api<Page<Client>>(`/clients?${qs}`), placeholderData: (p) => p });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Clientes</h1>
        {canWrite(user?.role) && <button className="btn-primary" onClick={() => setCreating(true)}>Nuevo cliente</button>}
      </div>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-sm" placeholder="Buscar por nombre, RUC o correo" aria-label="Buscar clientes" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input w-auto" aria-label="Estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option>
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr><th className="p-3">Cliente</th><th className="p-3">RUC</th><th className="p-3">Ciudad</th><th className="p-3">Instalaciones</th><th className="p-3">Estado</th></tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5}><Empty>Cargando…</Empty></td></tr>}
            {q.isError && <tr><td colSpan={5} className="p-6 text-center text-danger">No se pudo cargar la lista.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={5}><Empty>No hay clientes que coincidan con la búsqueda.</Empty></td></tr>}
            {q.data?.items.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 font-medium"><Link className="text-teal-700 hover:underline" to={`/clientes/${c.id}`}>{c.commercialName}</Link></td>
                <td className="p-3">{c.ruc ?? '—'}</td>
                <td className="p-3">{c.city ?? '—'}</td>
                <td className="p-3">{c._count?.installations ?? 0}</td>
                <td className="p-3"><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
      {creating && (
        <Modal title="Nuevo cliente" onClose={() => setCreating(false)}>
          <ClientForm onDone={(c) => { setCreating(false); if (c) nav(`/clientes/${c.id}`); }} />
        </Modal>
      )}
    </div>
  );
}
