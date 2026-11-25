import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dateOnly, PRIORITY_LABEL, type CatalogItem, type Client, type FollowUp, type Installation, type InstalledSystem, type Maintenance, type Page, type Priority } from '../lib/api';
import { Field } from '../components/ui';
import { TechnicianPicker } from './MaintenanceForm';
import { useToast } from '../components/Toast';
import { todayEC } from './MaintenanceDetail';

/** Crea o edita un seguimiento. Con clientId fijo (desde el cliente) no se pide el cliente. */
export function FollowUpForm({ clientId: fixedClient, followUp, onDone }: { clientId?: string; followUp?: FollowUp; onDone: (f?: FollowUp) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({
    clientId: fixedClient ?? followUp?.client.id ?? '', installationId: followUp?.installation?.id ?? '', systemId: followUp?.system?.id ?? '',
    maintenanceId: followUp?.maintenance?.id ?? '', title: followUp?.title ?? '', description: followUp?.description ?? '', typeId: followUp?.type.id ?? '',
    priority: (followUp?.priority ?? 'MEDIA') as Priority, responsibleId: followUp?.responsible?.id ?? '', startDate: dateOnly(followUp?.startDate) || todayEC(),
    targetDate: dateOnly(followUp?.targetDate), nextAction: followUp?.nextAction ?? '', observations: followUp?.observations ?? '',
    remindersEnabled: followUp?.remindersEnabled ?? true, technicianIds: followUp?.technicians.map((t) => t.id) ?? ([] as string[]),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const clients = useQuery({ queryKey: ['clients', 'options'], enabled: !fixedClient && !followUp, queryFn: () => api<Page<Client>>('/clients?pageSize=100&status=ACTIVE') });
  const types = useQuery({ queryKey: ['catalog', 'follow-up-types'], queryFn: () => api<CatalogItem[]>('/catalogs/follow-up-types') });
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => api<{ id: string; name: string }[]>('/user-options') });
  const insts = useQuery({ queryKey: ['installations', 'client', f.clientId, 'all'], enabled: !!f.clientId, queryFn: () => api<Page<Installation>>(`/installations?clientId=${f.clientId}&pageSize=100`) });
  const systems = useQuery({ queryKey: ['systems', 'client', f.clientId], enabled: !!f.clientId, queryFn: () => api<Page<InstalledSystem>>(`/systems?clientId=${f.clientId}&pageSize=100`) });
  const maints = useQuery({ queryKey: ['maintenances', 'system', f.systemId], enabled: !!f.systemId, queryFn: () => api<Page<Maintenance>>(`/maintenances?systemId=${f.systemId}&pageSize=50`) });
  const sysOptions = systems.data?.items.filter((s) => !f.installationId || s.installationId === f.installationId) ?? [];

  const m = useMutation({
    mutationFn: () => {
      const { clientId, ...rest } = f;
      return followUp ? api<FollowUp>(`/follow-ups/${followUp.id}`, { method: 'PATCH', body: rest }) : api<FollowUp>('/follow-ups', { method: 'POST', body: { ...rest, clientId } });
    },
    onSuccess: (res) => {
      ['follow-ups', 'follow-up', 'calendar', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast('ok', followUp ? 'Seguimiento actualizado' : 'Seguimiento creado');
      onDone(res);
    },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <form onSubmit={submit} className="space-y-3">
      {!fixedClient && !followUp && (
        <Field label="Cliente *">
          <select className="input" required value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, installationId: '', systemId: '', maintenanceId: '' })}>
            <option value="">Seleccione…</option>{clients.data?.items.map((c) => <option key={c.id} value={c.id}>{c.commercialName}</option>)}
          </select>
        </Field>
      )}
      <Field label="Título *"><input className="input" required minLength={2} maxLength={200} value={f.title} onChange={set('title')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo *">
          <select className="input" required value={f.typeId} onChange={set('typeId')}><option value="">Seleccione…</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </Field>
        <Field label="Prioridad">
          <select className="input" value={f.priority} onChange={set('priority')}>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        </Field>
        <Field label="Fecha de inicio"><input type="date" className="input" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="Fecha objetivo" hint="Base de los recordatorios por correo"><input type="date" className="input" min={f.startDate} value={f.targetDate} onChange={set('targetDate')} /></Field>
      </div>
      {f.clientId && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instalación">
            <select className="input" value={f.installationId} onChange={(e) => setF({ ...f, installationId: e.target.value, systemId: '', maintenanceId: '' })}>
              <option value="">—</option>{insts.data?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label="Sistema">
            <select className="input" value={f.systemId} onChange={(e) => setF({ ...f, systemId: e.target.value, maintenanceId: '' })}>
              <option value="">—</option>{sysOptions.map((s) => <option key={s.id} value={s.id}>{s.category.name} · {s.installation.name}</option>)}
            </select>
          </Field>
          {f.systemId && (
            <Field label="Mantenimiento relacionado">
              <select className="input" value={f.maintenanceId} onChange={set('maintenanceId')}>
                <option value="">—</option>{maints.data?.items.map((mt) => <option key={mt.id} value={mt.id}>{dateOnly(mt.scheduledDate)} · {mt.type.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
      <Field label="Responsable (recibe los recordatorios)">
        <select className="input" value={f.responsibleId} onChange={set('responsibleId')}><option value="">Sin asignar</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </Field>
      <Field label="Técnicos asignados"><TechnicianPicker value={f.technicianIds} onChange={(technicianIds) => setF({ ...f, technicianIds })} /></Field>
      <Field label="Descripción"><textarea className="input" rows={2} value={f.description} onChange={set('description')} /></Field>
      <Field label="Próxima acción"><input className="input" value={f.nextAction} onChange={set('nextAction')} /></Field>
      <Field label="Observaciones"><textarea className="input" rows={2} value={f.observations} onChange={set('observations')} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.remindersEnabled} onChange={(e) => setF({ ...f, remindersEnabled: e.target.checked })} />Enviar recordatorios por correo (cuando se habilite)</label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={() => onDone()}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>{followUp ? 'Guardar cambios' : 'Crear seguimiento'}</button>
      </div>
    </form>
  );
}
