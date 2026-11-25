import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Empty } from '../components/ui';
import { useToast } from '../components/Toast';

export interface BatchRow {
  id: string; fileName: string; fileSize: number; status: 'UPLOADED' | 'PREVIEWED' | 'IMPORTING' | 'IMPORTED' | 'CANCELLED' | 'FAILED'; sheetName: string | null;
  summary: Record<string, number> | null; result: Record<string, number> | null; error: string | null; createdAt: string; importedAt: string | null; createdBy: { name: string } | null;
}
export const BATCH_STATUS: Record<BatchRow['status'], { label: string; cls: string }> = {
  UPLOADED: { label: 'Archivo cargado', cls: 'bg-slate-200 text-slate-700' }, PREVIEWED: { label: 'En revisión', cls: 'bg-amber-100 text-amber-800' },
  IMPORTING: { label: 'Importando…', cls: 'bg-sky-100 text-sky-800' }, IMPORTED: { label: 'Importada', cls: 'bg-green-100 text-ok' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-slate-200 text-slate-600' }, FAILED: { label: 'Falló', cls: 'bg-red-100 text-danger' },
};
const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });

/** Descarga un archivo del backend usando la sesión (no se puede con un simple enlace por la cabecera anti-CSRF solo en POST; GET sí funciona con cookie). */
export const downloadUrl = (path: string) => `/api${path}`;

export function Imports() {
  const nav = useNavigate();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['imports'], queryFn: () => api<BatchRow[]>('/imports') });

  async function onFile(file?: File) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) return toast('error', 'Solo se admiten archivos .xlsx');
    if (file.size > 10 * 1024 * 1024) return toast('error', 'El archivo supera el máximo de 10 MB');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/imports', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'ignis' }, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, (data as { message?: string }).message ?? 'No se pudo subir el archivo');
      nav(`/importaciones/${(data as { id: string }).id}`);
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Error al subir el archivo'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Importar desde Excel</h1>
        <div className="flex gap-2">
          <a className="btn-secondary" href={downloadUrl('/imports/template.xlsx')}>Descargar plantilla oficial</a>
          <button className="btn-primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Subiendo…' : 'Nueva importación'}</button>
          <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="Archivo Excel" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>
      <div className="card text-sm text-slate-600">
        <p className="font-medium text-navy-900">Cómo funciona</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Suba el archivo .xlsx (el original nunca se modifica).</li>
          <li>Elija la hoja y confirme qué columna es cada dato.</li>
          <li>Revise la vista previa: errores, advertencias y duplicados. Todavía no se guarda nada.</li>
          <li>Confirme. La importación solo agrega registros: nunca borra ni cambia los existentes.</li>
        </ol>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">Archivo</th><th className="p-3">Fecha</th><th className="p-3">Por</th><th className="p-3">Estado</th><th className="p-3">Resultado</th><th className="p-3" /></tr></thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={6}><Empty>Cargando…</Empty></td></tr>}
            {q.data?.length === 0 && <tr><td colSpan={6}><Empty>Aún no hay importaciones.</Empty></td></tr>}
            {q.data?.map((b) => (
              <tr key={b.id} className="border-b last:border-0 align-top">
                <td className="p-3 font-medium">{b.fileName}<div className="text-xs font-normal text-slate-500">{(b.fileSize / 1024).toFixed(0)} KB</div></td>
                <td className="p-3 whitespace-nowrap">{fmt(b.importedAt ?? b.createdAt)}</td><td className="p-3">{b.createdBy?.name ?? '—'}</td>
                <td className="p-3"><span className={`badge ${BATCH_STATUS[b.status].cls}`}>{BATCH_STATUS[b.status].label}</span>{b.error && <div className="mt-1 max-w-xs text-xs text-danger">{b.error}</div>}</td>
                <td className="p-3 text-xs text-slate-600">{b.status === 'IMPORTED' && b.result ? `${b.result.clientsCreated} clientes, ${b.result.systemsCreated} sistemas, ${b.result.historyCreated + b.result.scheduledCreated} mantenimientos` : '—'}</td>
                <td className="p-3 text-right">{['UPLOADED', 'PREVIEWED'].includes(b.status) ? <Link className="btn-secondary py-1" to={`/importaciones/${b.id}`}>Continuar</Link> : b.status === 'IMPORTED' ? <Link className="btn-secondary py-1" to={`/importaciones/${b.id}`}>Ver</Link> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
