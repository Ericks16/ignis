import type { ReactNode } from 'react';

/** Marco común de las pantallas sin sesión: panel de marca + tarjeta con el formulario. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section aria-hidden className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-500/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-accent/10" />
        <img src="/brand/logo.png" alt="" className="relative h-14 w-auto self-start" />
        <div className="relative flex items-end gap-6">
          <div className="max-w-sm pb-10">
            <h2 className="font-display text-3xl font-bold leading-tight">Cada sistema,<br /><span className="text-accent">protegido y al día.</span></h2>
            <p className="mt-4 text-slate-300">Mantenimientos, seguimientos y recordatorios de tus instalaciones contra incendios en un solo lugar.</p>
          </div>
          <img src="/brand/mascota.png" alt="" className="h-80 w-auto select-none drop-shadow-2xl" />
        </div>
      </section>
      <main className="flex items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_10px_40px_rgba(10,46,58,0.10)]">
          <div className="-mx-8 -mt-8 mb-6 rounded-t-2xl bg-navy-900 px-8 py-5 lg:hidden"><img src="/brand/logo.png" alt="IGNIS Fire Protection" className="h-11 w-auto" /></div>
          <h1 className="font-display text-2xl font-bold text-navy-900">{title}</h1>
          {subtitle && <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>}
          {children}
          <p className="mt-6 text-center text-xs text-slate-400">IGNIS Fire Protection · Sistema de gestión de mantenimientos</p>
        </div>
      </main>
    </div>
  );
}
