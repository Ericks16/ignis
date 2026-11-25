import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Client } from '../lib/api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';

type F = Record<'commercialName' | 'legalName' | 'ruc' | 'address' | 'city' | 'province' | 'phone' | 'email' | 'notes', string>;

export function ClientForm({ client, onDone }: { client?: Client; onDone: (c?: Client) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<F>({
    commercialName: client?.commercialName ?? '', legalName: client?.legalName ?? '', ruc: client?.ruc ?? '',
    address: client?.address ?? '', city: client?.city ?? '', province: client?.province ?? '',
    phone: client?.phone ?? '', email: client?.email ?? '', notes: client?.notes ?? '',
  });
  const [dup, setDup] = useState('');
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const m = useMutation({
    mutationFn: (allowDuplicate: boolean) =>
      client
        ? api<Client>(`/clients/${client.id}`, { method: 'PATCH', body: { ...f, allowDuplicate } })
        : api<Client>('/clients', { method: 'POST', body: { ...f, allowDuplicate } }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client'] });
      toast('ok', client ? 'Cliente actualizado' : 'Cliente creado');
      onDone(c);
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.status === 409 && /equivalente/.test(e.message)) setDup(e.message);
      else toast('error', e.message);
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setDup(''); m.mutate(false); };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nombre comercial *"><input className="input" required minLength={2} value={f.commercialName} onChange={set('commercialName')} /></Field>
      <Field label="Razón social"><input className="input" value={f.legalName} onChange={set('legalName')} /></Field>
      <Field label="RUC / cédula" hint="10 o 13 dígitos">
        <input className="input" inputMode="numeric" pattern="(\d{10}|\d{13})?" title="10 o 13 dígitos" value={f.ruc} onChange={set('ruc')} />
      </Field>
      <Field label="Dirección"><input className="input" value={f.address} onChange={set('address')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ciudad"><input className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="Provincia"><input className="input" value={f.province} onChange={set('province')} /></Field>
        <Field label="Teléfono"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Correo"><input type="email" className="input" value={f.email} onChange={set('email')} /></Field>
      </div>
      <Field label="Observaciones"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field>
      {dup && (
        <div role="alert" className="rounded-md bg-orange-50 p-3 text-sm text-accent-dark">
          {dup}
          <button type="button" className="btn-secondary ml-2 py-1" onClick={() => { setDup(''); m.mutate(true); }}>Guardar de todos modos</button>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={() => onDone()}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>{client ? 'Guardar cambios' : 'Crear cliente'}</button>
      </div>
    </form>
  );
}
