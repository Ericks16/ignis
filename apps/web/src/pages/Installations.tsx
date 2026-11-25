import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Installation, type Page } from '../lib/api';
import { Empty, Pager, StatusBadge } from '../components/ui';

export function Installations() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}), ...(status ? { status } : {}) });
  const q = useQuery({ queryKey: ['installations', search, status, page], queryFn: () => api<Page<Installation>>(`/installations?${qs}`), placeholderData: (p) => p });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Instalaciones</h1>
      <p className="text-sm text-slate-500">Para crear o editar una instalación, abra el cliente correspondiente.</p>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-sm" placeholder="Buscar por instalación, dirección o cliente" aria-label="Buscar instalaciones" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input w-auto" aria-label="Estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option><option value="ACTIVE">Activas</option><option value="INACTIVE">Inactivas</option>
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Cliente</th><th className="p-3">Instalación</th><th className="p-3">Tipo</th><th className="p-3">Ciudad</th><th className="p-3">Estado</th></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5}><Empty>Cargando…</Empty></td></tr>}
            {q.isError && <tr><td colSpan={5} className="p-6 text-center text-danger">No se pudo cargar la lista.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={5}><Empty>No hay instalaciones que coincidan.</Empty></td></tr>}
            {q.data?.items.map((i) => (
              <tr key={i.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3"><Link className="text-teal-700 hover:underline" to={`/clientes/${i.clientId}`}>{i.client?.commercialName}</Link></td>
                <td className="p-3 font-medium">{i.name}</td><td className="p-3">{i.type ?? '—'}</td><td className="p-3">{i.city ?? '—'}</td>
                <td className="p-3"><StatusBadge status={i.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
    </div>
  );
}
