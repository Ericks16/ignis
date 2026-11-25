import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Installation } from '../lib/api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';

const TYPES = ['Matriz', 'Sucursal', 'Planta', 'Bodega', 'Local comercial', 'Oficina', 'Edificio'];
type F = Record<'name' | 'type' | 'address' | 'city' | 'province' | 'contactName' | 'contactPhone' | 'notes', string>;

export function InstallationForm({ clientId, installation, onDone }: { clientId: string; installation?: Installation; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<F>({
    name: installation?.name ?? '', type: installation?.type ?? '', address: installation?.address ?? '', city: installation?.city ?? '',
    province: installation?.province ?? '', contactName: installation?.contactName ?? '', contactPhone: installation?.contactPhone ?? '',
    notes: installation?.notes ?? '',
  });
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () =>
      installation
        ? api(`/installations/${installation.id}`, { method: 'PATCH', body: f })
        : api('/installations', { method: 'POST', body: { ...f, clientId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installations'] });
      qc.invalidateQueries({ queryKey: ['client'] });
      toast('ok', installation ? 'Instalación actualizada' : 'Instalación creada');
      onDone();
    },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nombre de la instalación *"><input className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
      <Field label="Tipo">
        <input className="input" list="inst-types" value={f.type} onChange={set('type')} />
        <datalist id="inst-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <Field label="Dirección"><input className="input" value={f.address} onChange={set('address')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ciudad"><input className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="Provincia"><input className="input" value={f.province} onChange={set('province')} /></Field>
        <Field label="Contacto"><input className="input" value={f.contactName} onChange={set('contactName')} /></Field>
        <Field label="Teléfono"><input className="input" value={f.contactPhone} onChange={set('contactPhone')} /></Field>
      </div>
      <Field label="Observaciones"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>{installation ? 'Guardar cambios' : 'Crear instalación'}</button>
      </div>
    </form>
  );
}
