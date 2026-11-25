import type { ReactNode } from 'react';
import type { Status } from '../lib/api';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status === 'ACTIVE' ? 'bg-green-100 text-ok' : 'bg-slate-200 text-slate-600'}`}>
      {status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
    </span>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{total} registros</span>
      <div className="flex items-center gap-2">
        <button className="btn-secondary py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span>Página {page} de {pages}</span>
        <button className="btn-secondary py-1" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-sm text-slate-500">{children}</div>;
}
