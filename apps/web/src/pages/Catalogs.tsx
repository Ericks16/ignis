import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CatalogItem, type FollowUpStatus } from '../lib/api';
import { Empty, Field } from '../components/ui';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

type Kind = 'system-categories' | 'equipment-types' | 'maintenance-types' | 'follow-up-types' | 'activity-types';
type Tab = Kind | 'follow-up-statuses';
const TITLES: Record<Tab, string> = {
  'system-categories': 'Categorías de sistema', 'equipment-types': 'Tipos de dispositivo', 'maintenance-types': 'Tipos de mantenimiento',
  'follow-up-statuses': 'Estados de seguimiento', 'follow-up-types': 'Tipos de seguimiento', 'activity-types': 'Tipos de actividad',
};

function ItemForm({ kind, item, onDone }: { kind: Kind; item?: CatalogItem; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: item?.name ?? '', description: item?.description ?? '', code: item?.code ?? '', sortOrder: String(item?.sortOrder ?? 0) });
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: f.name, description: f.description };
      if (kind === 'equipment-types') body.code = f.code;
      else if (kind === 'system-categories') body.sortOrder = Number(f.sortOrder);
      return item ? api(`/catalogs/${kind}/${item.id}`, { method: 'PATCH', body }) : api(`/catalogs/${kind}`, { method: 'POST', body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); toast('ok', 'Guardado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nombre *"><input className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Descripción"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {kind === 'equipment-types' && <Field label="Código" hint="Opcional. Mayúsculas, números y guion bajo (se usa al importar el Excel)."><input className="input" pattern="[A-Z0-9_]{1,30}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>}
      {kind === 'system-categories' && <Field label="Orden"><input type="number" min={0} max={1000} className="input" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar</button>
      </div>
    </form>
  );
}

function GenericCatalog({ kind }: { kind: Kind }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: CatalogItem } | null>(null);
  const q = useQuery({ queryKey: ['catalog', kind, 'all'], queryFn: () => api<CatalogItem[]>(`/catalogs/${kind}?includeInactive=true`) });
  const toggle = useMutation({
    mutationFn: (i: CatalogItem) => api(`/catalogs/${kind}/${i.id}`, { method: 'PATCH', body: { active: !i.active } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); },
    onError: (e: Error) => toast('error', e.message),
  });
  return (
    <div className="space-y-3">
      <div className="text-right"><button className="btn-primary" onClick={() => setModal({})}>Agregar</button></div>
      <div className="card overflow-x-auto p-0">
        {q.isLoading && <Empty>Cargando…</Empty>}
        {q.data && (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Nombre</th><th className="p-3">{kind === 'equipment-types' ? 'Código' : kind === 'system-categories' ? 'Orden' : ''}</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
            <tbody>
              {q.data.map((i) => (
                <tr key={i.id} className={`border-b last:border-0 ${i.active ? '' : 'text-slate-400'}`}>
                  <td className="p-3 font-medium">{i.name}{i.description && <div className="text-xs font-normal text-slate-500">{i.description}</div>}</td>
                  <td className="p-3">{kind === 'equipment-types' ? (i.code ?? '—') : kind === 'system-categories' ? i.sortOrder : ''}</td>
                  <td className="p-3">{i.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="space-x-2 p-3 text-right">
                    <button className="btn-secondary py-1" onClick={() => setModal({ item: i })}>Editar</button>
                    <button className="btn-secondary py-1" onClick={() => toggle.mutate(i)}>{i.active ? 'Desactivar' : 'Reactivar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-slate-500">Los elementos desactivados dejan de ofrecerse en formularios nuevos, pero se conservan en los registros existentes.</p>
      {modal && <Modal title={modal.item ? 'Editar elemento' : `Nuevo: ${TITLES[kind]}`} onClose={() => setModal(null)}><ItemForm kind={kind} item={modal.item} onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}

function StatusForm({ status, onDone }: { status?: FollowUpStatus; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: status?.name ?? '', isTerminal: false, sortOrder: String(status?.sortOrder ?? 50) });
  const m = useMutation({
    mutationFn: () => (status
      ? api(`/follow-up-statuses/${status.id}`, { method: 'PATCH', body: { ...(status.isSystem ? {} : { name: f.name }), sortOrder: Number(f.sortOrder) } })
      : api('/follow-up-statuses', { method: 'POST', body: { name: f.name, isTerminal: f.isTerminal, sortOrder: Number(f.sortOrder) } })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-statuses'] }); toast('ok', 'Estado guardado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
      <Field label="Nombre *"><input className="input" required minLength={2} maxLength={60} disabled={status?.isSystem} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Orden"><input type="number" min={0} max={1000} className="input" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>
      {!status && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.isTerminal} onChange={(e) => setF({ ...f, isTerminal: e.target.checked })} />
          <span>Estado final (cierra el seguimiento y detiene sus recordatorios)<span className="block text-xs text-slate-500">No se puede cambiar después de crearlo.</span></span>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar</button>
      </div>
    </form>
  );
}

/** Administración controlada de los estados: los 7 iniciales son de sistema y no se pueden renombrar ni desactivar. */
function StatusAdmin() {
  const toast = useToast();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ status?: FollowUpStatus } | null>(null);
  const q = useQuery({ queryKey: ['follow-up-statuses', 'all'], queryFn: () => api<FollowUpStatus[]>('/follow-up-statuses?includeInactive=true') });
  const toggle = useMutation({
    mutationFn: (s: FollowUpStatus) => api(`/follow-up-statuses/${s.id}`, { method: 'PATCH', body: { active: !s.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-up-statuses'] }), onError: (e: Error) => toast('error', e.message),
  });
  return (
    <div className="space-y-3">
      <div className="text-right"><button className="btn-primary" onClick={() => setModal({})}>Agregar estado</button></div>
      <div className="card overflow-x-auto p-0">
        {q.isLoading && <Empty>Cargando…</Empty>}
        {q.data && (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Estado</th><th className="p-3">Orden</th><th className="p-3">Tipo</th><th className="p-3">Situación</th><th className="p-3 text-right">Acciones</th></tr></thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id} className={`border-b last:border-0 ${s.active ? '' : 'text-slate-400'}`}>
                  <td className="p-3 font-medium">{s.name}</td><td className="p-3">{s.sortOrder}</td>
                  <td className="p-3">{s.isTerminal ? 'Final (cierra)' : 'Abierto'}{s.isSystem && <span className="badge ml-2 bg-slate-100 text-slate-600">Sistema</span>}</td>
                  <td className="p-3">{s.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="space-x-2 p-3 text-right">
                    <button className="btn-secondary py-1" onClick={() => setModal({ status: s })}>Editar</button>
                    {!s.isSystem && <button className="btn-secondary py-1" onClick={() => toggle.mutate(s)}>{s.active ? 'Desactivar' : 'Reactivar'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-slate-500">Los estados de sistema (incluidos FINALIZADO y CANCELADO) son fijos para garantizar que los recordatorios se detengan correctamente.</p>
      {modal && <Modal title={modal.status ? 'Editar estado' : 'Nuevo estado de seguimiento'} onClose={() => setModal(null)}><StatusForm status={modal.status} onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}

/** Administración de catálogos (solo Administrador). */
export function Catalogs() {
  const [tab, setTab] = useState<Tab>('system-categories');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Catálogos</h1>
      <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
        {(Object.keys(TITLES) as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`whitespace-nowrap px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-accent font-medium text-navy-900' : 'text-slate-500 hover:text-slate-800'}`}>{TITLES[k]}</button>
        ))}
      </div>
      {tab === 'follow-up-statuses' ? <StatusAdmin /> : <GenericCatalog key={tab} kind={tab} />}
    </div>
  );
}
