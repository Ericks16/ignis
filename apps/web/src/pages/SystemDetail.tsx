import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, canWrite, dateOnly, OP_LABEL, type CatalogItem, type Equipment, type InstalledSystem, type Maintenance, type OpStatus, type Page } from '../lib/api';
import { MaintenanceBadge } from '../components/MaintenanceBadge';
import { MaintenanceForm } from './MaintenanceForm';
import { useAuth } from '../lib/auth';
import { Empty, Field, StatusBadge } from '../components/ui';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { SystemForm } from './SystemForm';

function EquipmentForm({ systemId, equipment, onDone }: { systemId: string; equipment?: Equipment; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['catalog', 'equipment-types'], queryFn: () => api<CatalogItem[]>('/catalogs/equipment-types') });
  const [f, setF] = useState({ typeId: equipment?.typeId ?? '', quantity: String(equipment?.quantity ?? 1), label: equipment?.label ?? '', status: (equipment?.status ?? 'OPERATIVO') as OpStatus, notes: equipment?.notes ?? '' });
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, quantity: Number(f.quantity) };
      return equipment ? api(`/equipment/${equipment.id}`, { method: 'PATCH', body }) : api(`/systems/${systemId}/equipment`, { method: 'POST', body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['system'] }); qc.invalidateQueries({ queryKey: ['systems'] }); toast('ok', 'Dispositivo guardado'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Tipo de dispositivo *">
        <select className="input" required value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
          <option value="">Seleccione…</option>
          {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad *"><input type="number" min={1} max={100000} step={1} required className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Estado">
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OpStatus })}>
            {(Object.keys(OP_LABEL) as OpStatus[]).map((s) => <option key={s} value={s}>{OP_LABEL[s]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Zona / referencia" hint="Ej.: Piso 1, Bodega"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <Field label="Observaciones"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button className="btn-primary" disabled={m.isPending}>Guardar dispositivo</button>
      </div>
    </form>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return <div><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="text-sm">{v || '—'}</dd></div>;
}

export function SystemDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const write = canWrite(user?.role);
  const [modal, setModal] = useState<null | 'edit' | 'equipment' | 'maintenance'>(null);
  const maints = useQuery({ queryKey: ['maintenances', 'system', id], queryFn: () => api<Page<Maintenance>>(`/maintenances?systemId=${id}&pageSize=50`) });
  const [editEq, setEditEq] = useState<Equipment | undefined>();
  const q = useQuery({ queryKey: ['system', id], queryFn: () => api<InstalledSystem>(`/systems/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['system'] }); qc.invalidateQueries({ queryKey: ['systems'] }); };
  const setStatus = useMutation({
    mutationFn: (a: 'deactivate' | 'reactivate') => api(`/systems/${id}/${a}`, { method: 'POST' }),
    onSuccess: () => { refresh(); toast('ok', 'Estado actualizado'); }, onError: (e: Error) => toast('error', e.message),
  });
  const toggleEq = useMutation({
    mutationFn: (e: Equipment) => api(`/equipment/${e.id}`, { method: 'PATCH', body: { active: !e.active } }),
    onSuccess: refresh, onError: (e: Error) => toast('error', e.message),
  });

  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">No se encontró el sistema. <Link className="underline" to="/sistemas">Volver</Link></p>;
  const s = q.data;
  const total = s.equipment?.filter((e) => e.active).reduce((a, e) => a + e.quantity, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/clientes/${s.installation.clientId}`} className="text-sm text-teal-700 hover:underline">← {s.installation.client.commercialName}</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold text-navy-900">{s.category.name} <StatusBadge status={s.status} /></h1>
          <p className="text-sm text-slate-500">{s.installation.name}{s.brand || s.model ? ` · ${[s.brand, s.model].filter(Boolean).join(' ')}` : ''}</p>
        </div>
        {write && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setModal('edit')}>Editar</button>
            {s.status === 'ACTIVE'
              ? <button className="btn-secondary" onClick={() => setStatus.mutate('deactivate')}>Desactivar</button>
              : <button className="btn-primary" onClick={() => setStatus.mutate('reactivate')}>Reactivar</button>}
          </div>
        )}
      </div>

      <div className="card">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row k="Estado operativo" v={OP_LABEL[s.operationalStatus]} /><Row k="Relación" v={s.relation === 'MTTO' ? 'Mantenimiento' : s.relation === 'INSTALADO' ? 'Instalado' : null} />
          <Row k="N.º de serie" v={s.serialNumber} /><Row k="Instalación" v={dateOnly(s.installedAt)} />
          <Row k="Último mantenimiento" v={dateOnly(s.lastMaintenanceDate)} /><Row k="Próximo mantenimiento" v={dateOnly(s.nextMaintenanceDate)} />
          <Row k="Responsable" v={s.responsible?.name} /><Row k="Ubicación" v={s.location} />
          <div className="sm:col-span-2 lg:col-span-4"><Row k="Descripción" v={s.description} /></div>
          <div className="sm:col-span-2 lg:col-span-4"><Row k="Observaciones" v={s.notes} /></div>
        </dl>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy-900">Dispositivos <span className="text-sm font-normal text-slate-500">({total} en total)</span></h2>
        {write && s.status === 'ACTIVE' && <button className="btn-primary" onClick={() => { setEditEq(undefined); setModal('equipment'); }}>Agregar dispositivo</button>}
      </div>
      <div className="card overflow-x-auto p-0">
        {s.equipment?.length === 0 ? <Empty>Este sistema aún no tiene dispositivos registrados.</Empty> : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Dispositivo</th><th className="p-3">Cantidad</th><th className="p-3">Zona</th><th className="p-3">Estado</th>{write && <th className="p-3 text-right">Acciones</th>}</tr></thead>
            <tbody>
              {s.equipment?.map((e) => (
                <tr key={e.id} className={`border-b last:border-0 ${e.active ? '' : 'text-slate-400 line-through'}`}>
                  <td className="p-3 font-medium">{e.type.name}</td><td className="p-3">{e.quantity}</td><td className="p-3">{e.label ?? '—'}</td><td className="p-3">{OP_LABEL[e.status]}</td>
                  {write && (
                    <td className="space-x-2 p-3 text-right no-underline">
                      <button className="btn-secondary py-1" onClick={() => { setEditEq(e); setModal('equipment'); }}>Editar</button>
                      <button className="btn-secondary py-1" onClick={() => toggleEq.mutate(e)}>{e.active ? 'Quitar' : 'Restaurar'}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy-900">Mantenimientos</h2>
        {write && s.status === 'ACTIVE' && <button className="btn-primary" onClick={() => setModal('maintenance')}>Programar mantenimiento</button>}
      </div>
      <div className="card overflow-x-auto p-0">
        {maints.data?.items.length === 0 && <Empty>Este sistema aún no tiene mantenimientos.</Empty>}
        {!!maints.data?.items.length && (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Programado</th><th className="p-3">Ejecutado</th><th className="p-3">Tipo</th><th className="p-3">Técnicos</th><th className="p-3">Estado</th></tr></thead>
            <tbody>
              {maints.data.items.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-3"><Link className="font-medium text-teal-700 hover:underline" to={`/mantenimientos/${m.id}`}>{dateOnly(m.scheduledDate)}</Link></td>
                  <td className="p-3">{dateOnly(m.executedDate) || '—'}</td><td className="p-3">{m.type.name}</td>
                  <td className="p-3">{m.technicians.map((t) => t.name).join(', ') || '—'}</td><td className="p-3"><MaintenanceBadge status={m.status} overdue={m.overdue} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === 'maintenance' && <Modal title="Programar mantenimiento" onClose={() => setModal(null)}><MaintenanceForm systemId={id} onDone={() => setModal(null)} /></Modal>}
      {modal === 'edit' && <Modal title="Editar sistema" onClose={() => setModal(null)}><SystemForm system={s} onDone={() => setModal(null)} /></Modal>}
      {modal === 'equipment' && <Modal title={editEq ? 'Editar dispositivo' : 'Nuevo dispositivo'} onClose={() => setModal(null)}><EquipmentForm systemId={id} equipment={editEq} onDone={() => setModal(null)} /></Modal>}
    </div>
  );
}
