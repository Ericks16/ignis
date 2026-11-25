import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, canWrite, dateOnly, type FollowUp, type Client, type Contact, type HistoryItem, type Installation, type InstalledSystem, type Page } from '../lib/api';
import { SystemForm } from './SystemForm';
import { ActivityFeed } from '../components/ActivityFeed';
import { FollowUpStatusBadge } from '../components/FollowUpBadges';
import { FollowUpForm } from './FollowUpForm';
import { useAuth } from '../lib/auth';
import { Empty, StatusBadge } from '../components/ui';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ClientForm } from './ClientForm';
import { ContactForm } from './ContactForm';
import { InstallationForm } from './InstallationForm';

const ACTIONS: Record<string, string> = {
  'client.created': 'Cliente creado', 'client.updated': 'Datos del cliente actualizados', 'client.deactivated': 'Cliente desactivado',
  'client.reactivated': 'Cliente reactivado', 'contact.created': 'Contacto agregado', 'contact.updated': 'Contacto actualizado',
  'installation.created': 'Instalación creada', 'installation.updated': 'Instalación actualizada',
  'installation.deactivated': 'Instalación desactivada', 'installation.reactivated': 'Instalación reactivada',
};
type Tab = 'datos' | 'contactos' | 'instalaciones' | 'sistemas' | 'seguimientos' | 'actividades' | 'historial';

function Row({ k, v }: { k: string; v?: string | null }) {
  return <div><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="text-sm">{v || '—'}</dd></div>;
}

export function ClientDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const write = canWrite(user?.role);
  const [tab, setTab] = useState<Tab>('datos');
  const [modal, setModal] = useState<null | 'edit' | 'contact' | 'installation' | 'deactivate' | 'system' | 'followup'>(null);
  const followUps = useQuery({ queryKey: ['follow-ups', 'client', id], queryFn: () => api<Page<FollowUp>>(`/follow-ups?clientId=${id}&pageSize=100`), enabled: tab === 'seguimientos' });
  const systems = useQuery({ queryKey: ['systems', 'client', id], queryFn: () => api<Page<InstalledSystem>>(`/systems?clientId=${id}&pageSize=100`), enabled: tab === 'sistemas' });
  const [editContact, setEditContact] = useState<Contact | undefined>();
  const [editInst, setEditInst] = useState<Installation | undefined>();

  const client = useQuery({ queryKey: ['client', id], queryFn: () => api<Client>(`/clients/${id}`) });
  const installations = useQuery({ queryKey: ['installations', 'client', id], queryFn: () => api<Page<Installation>>(`/installations?clientId=${id}&pageSize=100`), enabled: tab === 'instalaciones' });
  const history = useQuery({ queryKey: ['client', id, 'history'], queryFn: () => api<HistoryItem[]>(`/clients/${id}/history`), enabled: tab === 'historial' });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['client'] }); qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['installations'] }); };
  const setStatus = useMutation({
    mutationFn: (action: 'deactivate' | 'reactivate') => api(`/clients/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => { refresh(); setModal(null); toast('ok', 'Estado del cliente actualizado'); },
    onError: (e: Error) => toast('error', e.message),
  });
  const instStatus = useMutation({
    mutationFn: ({ iid, action }: { iid: string; action: 'deactivate' | 'reactivate' }) => api(`/installations/${iid}/${action}`, { method: 'POST' }),
    onSuccess: () => { refresh(); toast('ok', 'Instalación actualizada'); },
    onError: (e: Error) => toast('error', e.message),
  });
  const toggleContact = useMutation({
    mutationFn: (c: Contact) => api(`/contacts/${c.id}`, { method: 'PATCH', body: { active: !c.active } }),
    onSuccess: () => { refresh(); },
    onError: (e: Error) => toast('error', e.message),
  });

  if (client.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (client.isError || !client.data) return <p role="alert" className="text-danger">No se encontró el cliente. <Link className="underline" to="/clientes">Volver</Link></p>;
  const c = client.data;
  const tabs: [Tab, string][] = [['datos', 'Datos'], ['contactos', `Contactos (${c.contacts?.length ?? 0})`], ['instalaciones', `Instalaciones (${c._count?.installations ?? 0})`], ['sistemas', 'Sistemas'], ['seguimientos', 'Seguimientos'], ['actividades', 'Actividades'], ['historial', 'Historial']];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/clientes" className="text-sm text-teal-700 hover:underline">← Clientes</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold text-navy-900">{c.commercialName} <StatusBadge status={c.status} /></h1>
          {c.legalName && <p className="text-sm text-slate-500">{c.legalName}</p>}
        </div>
        {write && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setModal('edit')}>Editar</button>
            {c.status === 'ACTIVE'
              ? <button className="btn-secondary" onClick={() => setModal('deactivate')}>Desactivar</button>
              : <button className="btn-primary" onClick={() => setStatus.mutate('reactivate')}>Reactivar</button>}
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`whitespace-nowrap px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-accent font-medium text-navy-900' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'datos' && (
        <div className="card">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row k="RUC / cédula" v={c.ruc} /><Row k="Teléfono" v={c.phone} /><Row k="Correo" v={c.email} />
            <Row k="Dirección" v={c.address} /><Row k="Ciudad" v={c.city} /><Row k="Provincia" v={c.province} />
            <div className="sm:col-span-2 lg:col-span-3"><Row k="Observaciones" v={c.notes} /></div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">Los mantenimientos, seguimientos y actividades de este cliente aparecerán aquí al habilitarse esos módulos.</p>
        </div>
      )}

      {tab === 'contactos' && (
        <div className="space-y-3">
          {write && <div className="text-right"><button className="btn-primary" onClick={() => { setEditContact(undefined); setModal('contact'); }}>Agregar contacto</button></div>}
          <div className="card overflow-x-auto p-0">
            {c.contacts?.length === 0 ? <Empty>Este cliente aún no tiene contactos.</Empty> : (
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Nombre</th><th className="p-3">Cargo</th><th className="p-3">Teléfono</th><th className="p-3">Correo</th><th className="p-3">Recordatorios</th>{write && <th className="p-3 text-right">Acciones</th>}</tr></thead>
                <tbody>
                  {c.contacts?.map((ct) => (
                    <tr key={ct.id} className={`border-b last:border-0 ${ct.active ? '' : 'text-slate-400'}`}>
                      <td className="p-3 font-medium">{ct.name}</td><td className="p-3">{ct.position ?? '—'}</td><td className="p-3">{ct.phone ?? '—'}</td><td className="p-3">{ct.email ?? '—'}</td>
                      <td className="p-3">{ct.receivesNotifications ? 'Sí' : 'No'}</td>
                      {write && (
                        <td className="space-x-2 p-3 text-right">
                          <button className="btn-secondary py-1" onClick={() => { setEditContact(ct); setModal('contact'); }}>Editar</button>
                          <button className="btn-secondary py-1" onClick={() => toggleContact.mutate(ct)}>{ct.active ? 'Desactivar' : 'Reactivar'}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'instalaciones' && (
        <div className="space-y-3">
          {write && c.status === 'ACTIVE' && <div className="text-right"><button className="btn-primary" onClick={() => { setEditInst(undefined); setModal('installation'); }}>Agregar instalación</button></div>}
          <div className="card overflow-x-auto p-0">
            {installations.isLoading && <Empty>Cargando…</Empty>}
            {installations.data?.items.length === 0 && <Empty>Este cliente aún no tiene instalaciones.</Empty>}
            {!!installations.data?.items.length && (
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Nombre</th><th className="p-3">Tipo</th><th className="p-3">Dirección</th><th className="p-3">Ciudad</th><th className="p-3">Estado</th>{write && <th className="p-3 text-right">Acciones</th>}</tr></thead>
                <tbody>
                  {installations.data.items.map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{i.name}</td><td className="p-3">{i.type ?? '—'}</td><td className="p-3">{i.address ?? '—'}</td><td className="p-3">{i.city ?? '—'}</td>
                      <td className="p-3"><StatusBadge status={i.status} /></td>
                      {write && (
                        <td className="space-x-2 p-3 text-right">
                          <button className="btn-secondary py-1" onClick={() => { setEditInst(i); setModal('installation'); }}>Editar</button>
                          <button className="btn-secondary py-1" onClick={() => instStatus.mutate({ iid: i.id, action: i.status === 'ACTIVE' ? 'deactivate' : 'reactivate' })}>{i.status === 'ACTIVE' ? 'Desactivar' : 'Reactivar'}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'sistemas' && (
        <div className="space-y-3">
          {write && c.status === 'ACTIVE' && <div className="text-right"><button className="btn-primary" onClick={() => setModal('system')}>Agregar sistema</button></div>}
          <div className="card overflow-x-auto p-0">
            {systems.isLoading && <Empty>Cargando…</Empty>}
            {systems.data?.items.length === 0 && <Empty>Este cliente aún no tiene sistemas registrados.</Empty>}
            {!!systems.data?.items.length && (
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Categoría</th><th className="p-3">Instalación</th><th className="p-3">Marca / modelo</th><th className="p-3">Próx. mantenimiento</th><th className="p-3">Estado</th></tr></thead>
                <tbody>
                  {systems.data.items.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="p-3 font-medium"><Link className="text-teal-700 hover:underline" to={`/sistemas/${s.id}`}>{s.category.name}</Link></td>
                      <td className="p-3">{s.installation.name}</td><td className="p-3">{[s.brand, s.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="p-3">{s.nextMaintenanceDate?.slice(0, 10) ?? '—'}</td><td className="p-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'seguimientos' && (
        <div className="space-y-3">
          {write && c.status === 'ACTIVE' && <div className="text-right"><button className="btn-primary" onClick={() => setModal('followup')}>Nuevo seguimiento</button></div>}
          <div className="card overflow-x-auto p-0">
            {followUps.isLoading && <Empty>Cargando…</Empty>}
            {followUps.data?.items.length === 0 && <Empty>Este cliente aún no tiene seguimientos.</Empty>}
            {!!followUps.data?.items.length && (
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Seguimiento</th><th className="p-3">Tipo</th><th className="p-3">Fecha objetivo</th><th className="p-3">Estado</th></tr></thead>
                <tbody>
                  {followUps.data.items.map((x) => (
                    <tr key={x.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="p-3 font-medium"><Link className="text-teal-700 hover:underline" to={`/seguimientos/${x.id}`}>{x.title}</Link></td>
                      <td className="p-3">{x.type.name}</td><td className="p-3">{dateOnly(x.targetDate) || '—'}</td>
                      <td className="p-3"><FollowUpStatusBadge name={x.status.name} isTerminal={x.status.isTerminal} overdue={x.overdue} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'actividades' && <ActivityFeed scope={{ clientId: id }} />}

      {tab === 'historial' && (
        <div className="card">
          {history.isLoading && <Empty>Cargando…</Empty>}
          {history.data?.length === 0 && <Empty>Sin movimientos registrados.</Empty>}
          <ol className="space-y-3">
            {history.data?.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-600" />
                <div><div className="font-medium">{ACTIONS[h.action] ?? h.action}</div>
                  <div className="text-xs text-slate-500">{h.actor ?? 'Sistema'} · {new Date(h.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</div></div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {modal === 'edit' && <Modal title="Editar cliente" onClose={() => setModal(null)}><ClientForm client={c} onDone={() => setModal(null)} /></Modal>}
      {modal === 'contact' && <Modal title={editContact ? 'Editar contacto' : 'Nuevo contacto'} onClose={() => setModal(null)}><ContactForm clientId={id} contact={editContact} onDone={() => setModal(null)} /></Modal>}
      {modal === 'installation' && <Modal title={editInst ? 'Editar instalación' : 'Nueva instalación'} onClose={() => setModal(null)}><InstallationForm clientId={id} installation={editInst} onDone={() => setModal(null)} /></Modal>}
      {modal === 'system' && <Modal title="Nuevo sistema" onClose={() => setModal(null)}><SystemForm clientId={id} onDone={() => setModal(null)} /></Modal>}
      {modal === 'followup' && <Modal title="Nuevo seguimiento" onClose={() => setModal(null)}><FollowUpForm clientId={id} onDone={() => setModal(null)} /></Modal>}
      {modal === 'deactivate' && (
        <Modal title="Desactivar cliente" onClose={() => setModal(null)}>
          <p className="mb-4 text-sm text-slate-600">El cliente dejará de aparecer como activo y no se podrán agregar instalaciones. Su historial se conserva y puede reactivarlo cuando quiera.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-danger" disabled={setStatus.isPending} onClick={() => setStatus.mutate('deactivate')}>Desactivar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
