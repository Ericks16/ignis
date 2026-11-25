import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, Bell, BellRing, Building2, CalendarDays, ClipboardList, Cpu, FileBarChart, FileSpreadsheet, HardHat, LayoutDashboard, LogOut, MapPin, Menu, Tags, UserCog, UserRound, Users, Wrench, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/api';

const TITLES: Record<string, string> = {
  '/': 'Dashboard', '/usuarios': 'Usuarios', '/cuenta': 'Mi cuenta', '/clientes': 'Clientes', '/instalaciones': 'Instalaciones',
  '/sistemas': 'Sistemas', '/catalogos': 'Catálogos', '/mantenimientos': 'Mantenimientos', '/calendario': 'Calendario', '/reportes': 'Reportes', '/seguimientos': 'Seguimientos', '/actividades': 'Actividades', '/notificaciones': 'Notificaciones', '/recordatorios': 'Recordatorios', '/importaciones': 'Importar Excel', '/tecnicos': 'Técnicos',
};
const crumb = (p: string) =>
  TITLES[p] ?? (p.startsWith('/clientes/') ? 'Clientes / Detalle' : p.startsWith('/sistemas/') ? 'Sistemas / Detalle' : p.startsWith('/mantenimientos/') ? 'Mantenimientos / Detalle' : p.startsWith('/seguimientos/') ? 'Seguimientos / Detalle' : p.startsWith('/importaciones/') ? 'Importar Excel / Asistente' : p.startsWith('/reportes/') ? 'Reportes / Detalle' : '');

interface Item { to: string; label: string; icon: LucideIcon; show: boolean }
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/** Barra lateral agrupada + cabecera con migas de pan y datos del usuario. */
export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const staffOnly = user?.role !== 'TECNICO';
  const manager = user?.role === 'ADMIN' || user?.role === 'OPERATIVO';
  const admin = user?.role === 'ADMIN';
  const groups: { title: string; items: Item[] }[] = [
    { title: 'Operación', items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, show: true },
      { to: '/calendario', label: 'Calendario', icon: CalendarDays, show: true },
      { to: '/mantenimientos', label: 'Mantenimientos', icon: Wrench, show: true },
      { to: '/seguimientos', label: 'Seguimientos', icon: ClipboardList, show: true },
      { to: '/actividades', label: 'Actividades', icon: Activity, show: true },
    ] },
    { title: 'Cartera', items: [
      { to: '/clientes', label: 'Clientes', icon: Building2, show: true },
      { to: '/instalaciones', label: 'Instalaciones', icon: MapPin, show: true },
      { to: '/sistemas', label: 'Sistemas', icon: Cpu, show: true },
    ] },
    { title: 'Análisis y gestión', items: [
      { to: '/reportes', label: 'Reportes', icon: FileBarChart, show: true },
      { to: '/tecnicos', label: 'Técnicos', icon: HardHat, show: true },
      { to: '/notificaciones', label: 'Notificaciones', icon: Bell, show: staffOnly },
      { to: '/recordatorios', label: 'Recordatorios', icon: BellRing, show: manager },
    ] },
    { title: 'Administración', items: [
      { to: '/importaciones', label: 'Importar Excel', icon: FileSpreadsheet, show: admin },
      { to: '/catalogos', label: 'Catálogos', icon: Tags, show: admin },
      { to: '/usuarios', label: 'Usuarios', icon: Users, show: admin },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length > 0);

  const link = (i: Item) => (
    <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)}
      className={({ isActive }) => `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 font-semibold text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-accent" />}
          <i.icon aria-hidden size={18} strokeWidth={isActive ? 2.25 : 1.75} className={isActive ? 'text-teal-500' : 'text-slate-400 group-hover:text-teal-500'} />
          <span>{i.label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col bg-navy-900 text-white shadow-xl transition md:sticky md:top-0 md:h-screen md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 pb-2 pt-5">
          <Link to="/" onClick={() => setOpen(false)} aria-label="IGNIS Fire Protection, ir al inicio"><img src="/brand/logo.png" alt="IGNIS Fire Protection" className="h-12 w-auto" /></Link>
          <button className="rounded-md p-1 text-slate-300 hover:bg-white/10 md:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav className="mt-3 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Principal">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 px-3 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-500/80">{g.title}</div>
              <div className="flex flex-col gap-0.5">{g.items.map(link)}</div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <NavLink to="/cuenta" onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
            <UserRound aria-hidden size={18} className="text-slate-400" /><span>Mi cuenta</span>
          </NavLink>
          <img src="/brand/mascota.png" alt="" aria-hidden className="mx-auto mt-2 hidden h-28 w-auto select-none [@media(min-height:1020px)]:block" />
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-navy-950/60 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button className="btn-secondary px-2.5 md:hidden" aria-label="Abrir menú" onClick={() => setOpen(true)}><Menu size={18} /></button>
            <nav aria-label="Ruta" className="text-sm text-slate-500">
              <Link to="/" className="hover:text-teal-700">Inicio</Link>
              {pathname !== '/' && <> / <span className="font-medium text-navy-900">{crumb(pathname)}</span></>}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden items-center gap-3 sm:flex">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 font-display text-xs font-bold text-white ring-2 ring-teal-500/40">{initials(user?.name)}</span>
              <div className="text-right leading-tight">
                <div className="font-semibold text-navy-900">{user?.name}</div>
                <div className="text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</div>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => logout()}><LogOut aria-hidden size={16} />Cerrar sesión</button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
