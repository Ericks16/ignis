import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/api';

const TITLES: Record<string, string> = {
  '/': 'Dashboard', '/usuarios': 'Usuarios', '/cuenta': 'Mi cuenta', '/clientes': 'Clientes', '/instalaciones': 'Instalaciones',
  '/sistemas': 'Sistemas', '/catalogos': 'Catálogos', '/mantenimientos': 'Mantenimientos', '/calendario': 'Calendario', '/reportes': 'Reportes', '/seguimientos': 'Seguimientos', '/actividades': 'Actividades', '/notificaciones': 'Notificaciones', '/recordatorios': 'Recordatorios', '/importaciones': 'Importar Excel', '/tecnicos': 'Técnicos',
};
const crumb = (p: string) =>
  TITLES[p] ?? (p.startsWith('/clientes/') ? 'Clientes / Detalle' : p.startsWith('/sistemas/') ? 'Sistemas / Detalle' : p.startsWith('/mantenimientos/') ? 'Mantenimientos / Detalle' : p.startsWith('/seguimientos/') ? 'Seguimientos / Detalle' : p.startsWith('/importaciones/') ? 'Importar Excel / Asistente' : p.startsWith('/reportes/') ? 'Reportes / Detalle' : '');

/** Sidebar + header + breadcrumbs. Los módulos de negocio se añaden en las siguientes fases. */
export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const items = [
    { to: '/', label: 'Dashboard', show: true },
    { to: '/clientes', label: 'Clientes', show: true },
    { to: '/instalaciones', label: 'Instalaciones', show: true },
    { to: '/sistemas', label: 'Sistemas', show: true },
    { to: '/mantenimientos', label: 'Mantenimientos', show: true },
    { to: '/seguimientos', label: 'Seguimientos', show: true },
    { to: '/actividades', label: 'Actividades', show: true },
    { to: '/calendario', label: 'Calendario', show: true },
    { to: '/reportes', label: 'Reportes', show: true },
    { to: '/notificaciones', label: 'Notificaciones', show: user?.role !== 'TECNICO' },
    { to: '/recordatorios', label: 'Recordatorios', show: user?.role === 'ADMIN' || user?.role === 'OPERATIVO' },
    { to: '/tecnicos', label: 'Técnicos', show: true },
    { to: '/importaciones', label: 'Importar Excel', show: user?.role === 'ADMIN' },
    { to: '/catalogos', label: 'Catálogos', show: user?.role === 'ADMIN' },
    { to: '/usuarios', label: 'Usuarios', show: user?.role === 'ADMIN' },
    { to: '/cuenta', label: 'Mi cuenta', show: true },
  ].filter((i) => i.show);

  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-30 w-60 transform bg-navy-900 text-white transition md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 py-5 text-xl font-bold tracking-wide">
          <span className="text-accent">IGNIS</span> <span className="text-sm font-normal text-slate-300">Maintenance</span>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-3" aria-label="Principal">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end onClick={() => setOpen(false)}
              className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-teal-600 font-medium' : 'text-slate-200 hover:bg-navy-800'}`}>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-slate-900/40 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="btn-secondary md:hidden" aria-label="Abrir menú" onClick={() => setOpen(true)}>☰</button>
            <nav aria-label="Ruta" className="text-sm text-slate-500">
              <Link to="/" className="hover:underline">Inicio</Link>
              {pathname !== '/' && <> / <span className="text-slate-800">{crumb(pathname)}</span></>}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <div className="font-medium">{user?.name}</div>
              <div className="text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</div>
            </div>
            <button className="btn-secondary" onClick={() => logout()}>Cerrar sesión</button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
