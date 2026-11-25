import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dateOnly, type CatalogItem, type Maintenance } from '../lib/api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';

export function TechnicianPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const techs = useQuery({ queryKey: ['technician-options'], queryFn: () => api<{ id: string; name: string; initials: string | null }[]>('/technicians/options') });
  if (techs.data?.length === 0) return <p className="text-sm text-slate-500">No hay técnicos activos. Regístrelos en la sección Técnicos.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {techs.data?.map((t) => {
        const on = value.includes(t.id);
        return (
          <label key={t.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white'}`}>
            <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])} />
            {t.name}
          </label>
        );
      })}
    </div>
  );
}

/** Programa un mantenimiento (con systemId) o edita uno existente. */
export function MaintenanceForm({ systemId, maintenance, onDone }: { systemId?: string; maintenance?: Maintenance; onDone: (m?: Maintenance) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['catalog', 'maintenance-types'], queryFn: () => api<CatalogItem[]>('/catalogs/maintenance-types') });
  const [f, setF] = useState({
    typeId: maintenance?.type.id ?? '', scheduledDate: dateOnly(maintenance?.scheduledDate), description: maintenance?.description ?? '',
    technicianIds: maintenance?.technicians.map((t) => t.id) ?? ([] as string[]),
  });
  const m = useMutation({
    mutationFn: () => (maintenance ? api<Maintenance>(`/maintenances/${maintenance.id}`, { method: 'PATCH', body: f }) : api<Maintenance>('/maintenances', { method: 'POST', body: { ...f, systemId } })),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['maintenances'] }); qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['calendar'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast('ok', maintenance ? 'Mantenimiento actualizado' : 'Mantenimiento programado'); onDone(res); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Tipo de mantenimiento *">
        <select className="input" required value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
          <option value="">Seleccione…</option>
          {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha programada *"><input type="date" required className="input" value={f.scheduledDate} onChange={(e) => setF({ ...f, scheduledDate: e.target.value })} /></Field>
      <Field label="Técnicos asignados"><TechnicianPicker value={f.technicianIds} onChange={(technicianIds) => setF({ ...f, technicianIds })} /></Field>
      <Field label="Descripción del trabajo"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={() => onDone()}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>{maintenance ? 'Guardar cambios' : 'Programar'}</button>
      </div>
    </form>
  );
}
