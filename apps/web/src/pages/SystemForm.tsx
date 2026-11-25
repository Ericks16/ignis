import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dateOnly, OP_LABEL, type CatalogItem, type InstalledSystem, type Installation, type OpStatus, type Page } from '../lib/api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';

type F = {
  installationId: string; categoryId: string; brand: string; model: string; serialNumber: string; installedAt: string; location: string;
  operationalStatus: OpStatus; relation: string; responsibleId: string; lastMaintenanceDate: string; nextMaintenanceDate: string; description: string; notes: string;
};

/** Crea o edita un sistema. Para crear se pasa clientId (elige la instalación); para editar se pasa system. */
export function SystemForm({ clientId, system, onDone }: { clientId?: string; system?: InstalledSystem; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ['catalog', 'system-categories'], queryFn: () => api<CatalogItem[]>('/catalogs/system-categories') });
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => api<{ id: string; name: string }[]>('/user-options') });
  const insts = useQuery({
    queryKey: ['installations', 'client', clientId, 'active'], enabled: !system && !!clientId,
    queryFn: () => api<Page<Installation>>(`/installations?clientId=${clientId}&status=ACTIVE&pageSize=100`),
  });
  const [f, setF] = useState<F>({
    installationId: system?.installationId ?? '', categoryId: system?.categoryId ?? '', brand: system?.brand ?? '', model: system?.model ?? '',
    serialNumber: system?.serialNumber ?? '', installedAt: dateOnly(system?.installedAt), location: system?.location ?? '',
    operationalStatus: system?.operationalStatus ?? 'OPERATIVO', relation: system?.relation ?? '', responsibleId: system?.responsibleId ?? '',
    lastMaintenanceDate: dateOnly(system?.lastMaintenanceDate), nextMaintenanceDate: dateOnly(system?.nextMaintenanceDate),
    description: system?.description ?? '', notes: system?.notes ?? '',
  });
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const m = useMutation({
    mutationFn: () => {
      const { installationId, ...rest } = f;
      const body = { ...rest, relation: f.relation || null };
      return system ? api(`/systems/${system.id}`, { method: 'PATCH', body }) : api('/systems', { method: 'POST', body: { ...body, installationId } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['systems'] }); qc.invalidateQueries({ queryKey: ['system'] }); toast('ok', 'Sistema guardado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <form onSubmit={submit} className="space-y-3">
      {!system && (
        <Field label="Instalación *" hint={insts.data?.items.length === 0 ? 'Este cliente no tiene instalaciones activas; cree una primero.' : undefined}>
          <select className="input" required value={f.installationId} onChange={set('installationId')}>
            <option value="">Seleccione…</option>
            {insts.data?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Tipo de sistema (categoría) *">
        <select className="input" required value={f.categoryId} onChange={set('categoryId')}>
          <option value="">Seleccione…</option>
          {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca"><input className="input" value={f.brand} onChange={set('brand')} /></Field>
        <Field label="Modelo"><input className="input" value={f.model} onChange={set('model')} /></Field>
        <Field label="Número de serie"><input className="input" value={f.serialNumber} onChange={set('serialNumber')} /></Field>
        <Field label="Fecha de instalación"><input type="date" className="input" value={f.installedAt} onChange={set('installedAt')} /></Field>
        <Field label="Estado operativo">
          <select className="input" value={f.operationalStatus} onChange={set('operationalStatus')}>
            {(Object.keys(OP_LABEL) as OpStatus[]).map((s) => <option key={s} value={s}>{OP_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Relación con IGNIS">
          <select className="input" value={f.relation} onChange={set('relation')}>
            <option value="">—</option><option value="INSTALADO">Instalado</option><option value="MTTO">Mantenimiento</option>
          </select>
        </Field>
        <Field label="Último mantenimiento"><input type="date" className="input" value={f.lastMaintenanceDate} onChange={set('lastMaintenanceDate')} /></Field>
        <Field label="Próximo mantenimiento"><input type="date" className="input" value={f.nextMaintenanceDate} onChange={set('nextMaintenanceDate')} /></Field>
      </div>
      <Field label="Ubicación"><input className="input" value={f.location} onChange={set('location')} /></Field>
      <Field label="Responsable">
        <select className="input" value={f.responsibleId} onChange={set('responsibleId')}>
          <option value="">Sin asignar</option>
          {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Descripción"><textarea className="input" rows={2} value={f.description} onChange={set('description')} /></Field>
      <Field label="Observaciones"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar sistema</button>
      </div>
    </form>
  );
}
