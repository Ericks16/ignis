import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Contact } from '../lib/api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';

export function ContactForm({ clientId, contact, onDone }: { clientId: string; contact?: Contact; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: contact?.name ?? '', position: contact?.position ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '',
    receivesNotifications: contact?.receivesNotifications ?? false,
  });
  const m = useMutation({
    mutationFn: () => (contact ? api(`/contacts/${contact.id}`, { method: 'PATCH', body: f }) : api(`/clients/${clientId}/contacts`, { method: 'POST', body: f })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client'] }); toast('ok', 'Contacto guardado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nombre *"><input className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Cargo"><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Correo"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={f.receivesNotifications} onChange={(e) => setF({ ...f, receivesNotifications: e.target.checked })} />
        <span>Recibe recordatorios automáticos por correo<span className="block text-xs text-slate-500">Desactivado por defecto; requiere un correo válido.</span></span>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar contacto</button>
      </div>
    </form>
  );
}
