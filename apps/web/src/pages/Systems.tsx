import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, dateOnly, OP_LABEL, type CatalogItem, type InstalledSystem, type Page } from '../lib/api';
import { Empty, Pager, StatusBadge } from '../components/ui';

export function Systems() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sp] = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [page, setPage] = useState(1);
  const cats = useQuery({ queryKey: ['catalog', 'system-categories'], queryFn: () => api<CatalogItem[]>('/catalogs/system-categories') });
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}), ...(categoryId ? { categoryId } : {}), ...(status ? { status } : {}) });
  const q = useQuery({ queryKey: ['systems', search, categoryId, status, page], queryFn: () => api<Page<InstalledSystem>>(`/systems?${qs}`), placeholderData: (p) => p });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Sistemas</h1>
      <p className="text-sm text-slate-500">Para registrar un sistema nuevo, abra el cliente y use la pestaña Sistemas.</p>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-sm" placeholder="Buscar por marca, modelo, serie, instalación o cliente" aria-label="Buscar sistemas" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input w-auto" aria-label="Categoría" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">Todas las categorías</option>
          {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" aria-label="Estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option>
        </select>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr><th className="p-3">Cliente / instalación</th><th className="p-3">Categoría</th><th className="p-3">Marca / modelo</th><th className="p-3">Estado operativo</th><th className="p-3">Próx. mantenimiento</th><th className="p-3">Estado</th></tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={6}><Empty>Cargando…</Empty></td></tr>}
            {q.isError && <tr><td colSpan={6} className="p-6 text-center text-danger">No se pudo cargar la lista.</td></tr>}
            {q.data?.items.length === 0 && <tr><td colSpan={6}><Empty>No hay sistemas que coincidan.</Empty></td></tr>}
            {q.data?.items.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3"><Link className="font-medium text-teal-700 hover:underline" to={`/sistemas/${s.id}`}>{s.installation.client.commercialName}</Link><div className="text-xs text-slate-500">{s.installation.name}</div></td>
                <td className="p-3">{s.category.name}</td>
                <td className="p-3">{[s.brand, s.model].filter(Boolean).join(' ') || '—'}</td>
                <td className="p-3">{OP_LABEL[s.operationalStatus]}</td>
                <td className="p-3">{dateOnly(s.nextMaintenanceDate) || '—'}</td>
                <td className="p-3"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />}
    </div>
  );
}
