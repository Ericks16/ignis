import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type CatalogItem } from '../lib/api';
import { ActivityFeed } from '../components/ActivityFeed';

/** Historial cronológico de actividades, consultable por tipo, texto y fechas. */
export function ActivitiesPage() {
  const [f, setF] = useState({ search: '', typeId: '', from: '', to: '' });
  const types = useQuery({ queryKey: ['catalog', 'activity-types'], queryFn: () => api<CatalogItem[]>('/catalogs/activity-types') });
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Actividades</h1>
      <p className="text-sm text-slate-500">Para registrar una actividad, abra el cliente, el seguimiento o el mantenimiento correspondiente.</p>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Buscar en la descripción" aria-label="Buscar actividades" value={f.search} onChange={upd('search')} />
        <select className="input w-auto" aria-label="Tipo de actividad" value={f.typeId} onChange={upd('typeId')}>
          <option value="">Todos los tipos</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">Desde<input type="date" className="input w-auto" value={f.from} onChange={upd('from')} /></label>
        <label className="flex items-center gap-2 text-sm text-slate-600">Hasta<input type="date" className="input w-auto" min={f.from} value={f.to} onChange={upd('to')} /></label>
      </div>
      <ActivityFeed key={JSON.stringify(filters)} scope={{}} canAdd={false} showClient filters={filters} />
    </div>
  );
}
