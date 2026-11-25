import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type CatalogItem } from '../lib/api';
import { Empty, Field } from '../components/ui';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { BATCH_STATUS, downloadUrl, type BatchRow } from './Imports';

type FieldKey = 'status' | 'client' | 'installation' | 'contact' | 'central' | 'lastMaintenance' | 'nextMaintenance' | 'followUp' | 'ruc' | 'clientEmail' | 'contactEmail' | 'city';
const FIELD_LABELS: Record<FieldKey, string> = {
  client: 'Cliente *', installation: 'Instalación / sede', status: 'Estado (INSTALADO / MTTO)', contact: 'Persona a cargo', central: 'Central / tipo de sistema',
  lastMaintenance: 'Fecha del último mantenimiento', nextMaintenance: 'Fecha del próximo mantenimiento', followUp: 'Seguimiento (texto)', ruc: 'RUC', clientEmail: 'Correo del cliente',
  contactEmail: 'Correo del contacto', city: 'Ciudad',
};
const FIELD_ORDER: FieldKey[] = ['client', 'installation', 'status', 'contact', 'central', 'lastMaintenance', 'nextMaintenance', 'followUp', 'ruc', 'clientEmail', 'contactEmail', 'city'];

interface Opts {
  overdueNext: 'HISTORICAL' | 'SCHEDULE' | 'IGNORE'; blankCentral: 'DEFAULT' | 'SKIP_SYSTEM'; detectLostSection: boolean; importHistory: boolean; importFollowUps: boolean;
  defaultCategoryId: string; defaultMaintenanceTypeId: string; followUpTypeId: string;
}
interface Cfg {
  sheet: string; headerRow: number; columns: Partial<Record<FieldKey, number>>; equipment: { column: number; typeId: string }[]; options: Opts;
  centralMap: Record<string, { categoryId: string; brand?: string | null; model?: string | null }>; overrides: Record<string, { clientName?: string; skip?: boolean }>;
}
interface SheetData {
  name: string; rowCount: number; colCount: number; headerRow: number;
  guess: { columns: Partial<Record<FieldKey, number>>; equipment: { column: number; header: string; typeId: string }[]; ignored: { column: number; header: string }[]; unrecognized: { column: number; header: string }[] };
  defaults: { categories: CatalogItem[]; maintenanceTypes: CatalogItem[]; followUpTypes: CatalogItem[]; defaultCategoryId: string | null; defaultMaintenanceTypeId: string | null; followUpTypeId: string | null };
  rows: { row: number; cells: string[] }[];
}
interface Summary { rowsTotal: number; rowsOk: number; rowsWarning: number; rowsError: number; rowsSkipped: number; clientsNew: number; clientsExisting: number; clientsLost: number; contactsNew: number; installationsNew: number; systemsNew: number; systemsExisting: number; equipmentRows: number; historyMaintenances: number; scheduledMaintenances: number; followUps: number }
interface PRow { rowNumber: number; status: 'OK' | 'WARNING' | 'ERROR' | 'SKIPPED'; skipReason: string | null; lost: boolean; clientName: string; installationName: string; system: string | null; errors: string[]; warnings: string[]; summary: string; lastDate: string | null; nextDate: string | null; nextMode: string | null }
interface CentralValue { key: string; value: string; count: number; categoryId: string; categoryName: string; brand: string | null; model: string | null; matchedCategory: boolean; decided: boolean }
interface Preview { summary: Summary; centralValues: CentralValue[]; config: Cfg; truncated: boolean; rows: PRow[] }
interface BatchDetail extends BatchRow { config: Cfg | null; sheets: { name: string; rows: number; cols: number }[] }

const colLetter = (n: number) => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };

// ---------- Paso 1: configurar ----------
function ConfigureStep({ batch, initial, onPreview }: { batch: BatchDetail; initial: Cfg | null; onPreview: (p: Preview) => void }) {
  const toast = useToast();
  const [sheet, setSheet] = useState(initial?.sheet ?? batch.sheets[0]?.name ?? '');
  const [headerRow, setHeaderRow] = useState<number | undefined>(initial?.headerRow);
  const data = useQuery({ queryKey: ['import-sheet', batch.id, sheet, headerRow], enabled: !!sheet, queryFn: () => api<SheetData>(`/imports/${batch.id}/sheet?name=${encodeURIComponent(sheet)}${headerRow ? `&headerRow=${headerRow}` : ''}`) });
  const types = useQuery({ queryKey: ['catalog', 'equipment-types'], queryFn: () => api<CatalogItem[]>('/catalogs/equipment-types') });
  const [columns, setColumns] = useState<Partial<Record<FieldKey, number>>>({});
  const [equipment, setEquipment] = useState<{ column: number; typeId: string; header: string; on: boolean }[]>([]);
  const [opts, setOpts] = useState<Opts | null>(null);
  const [loadedKey, setLoadedKey] = useState('');

  // Al cargar la hoja (o cambiar la fila de encabezados) se sugiere el mapeo; si ya había configuración, se respeta.
  useEffect(() => {
    const d = data.data;
    if (!d) return;
    const key = `${sheet}|${d.headerRow}`;
    if (key === loadedKey) return;
    setLoadedKey(key);
    const reuse = initial && initial.sheet === sheet && initial.headerRow === d.headerRow;
    setColumns(reuse ? initial.columns : d.guess.columns);
    setEquipment(d.guess.equipment.map((e) => ({ ...e, on: reuse ? initial.equipment.some((x) => x.column === e.column) : true })));
    setOpts((o) => o ?? initial?.options ?? {
      overdueNext: 'HISTORICAL', blankCentral: 'DEFAULT', detectLostSection: true, importHistory: true, importFollowUps: true,
      defaultCategoryId: d.defaults.defaultCategoryId ?? '', defaultMaintenanceTypeId: d.defaults.defaultMaintenanceTypeId ?? '', followUpTypeId: d.defaults.followUpTypeId ?? '',
    });
  }, [data.data, sheet, initial, loadedKey]);

  const headers = data.data?.rows.find((r) => r.row === (data.data?.headerRow ?? 1))?.cells ?? [];
  const m = useMutation({
    mutationFn: () => api<Preview>(`/imports/${batch.id}/preview`, {
      method: 'POST',
      body: { sheet, headerRow: data.data!.headerRow, columns, equipment: equipment.filter((e) => e.on).map((e) => ({ column: e.column, typeId: e.typeId })), options: opts, centralMap: initial?.sheet === sheet ? initial.centralMap : {}, overrides: initial?.sheet === sheet ? initial.overrides : {} },
    }),
    onSuccess: onPreview, onError: (e: Error) => toast('error', e.message),
  });
  const colOptions = headers.map((h, i) => ({ value: i + 1, label: `${colLetter(i + 1)} · ${h || '(sin encabezado)'}` }));
  const d = data.data;
  if (!opts && data.isLoading) return <p className="text-slate-500">Leyendo el archivo…</p>;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-navy-900">1. Hoja y encabezados</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Hoja del libro"><select className="input" value={sheet} onChange={(e) => { setSheet(e.target.value); setHeaderRow(undefined); setLoadedKey(''); }}>{batch.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows} filas)</option>)}</select></Field>
          <Field label="Fila de encabezados"><input type="number" min={1} max={200} className="input w-28" value={headerRow ?? d?.headerRow ?? 1} onChange={(e) => { setHeaderRow(Number(e.target.value) || 1); setLoadedKey(''); }} /></Field>
        </div>
        {d && (
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-xs">
              <thead><tr className="bg-slate-50"><th className="p-1.5 text-left text-slate-500">Fila</th>{Array.from({ length: Math.min(d.colCount, 14) }, (_, i) => <th key={i} className="p-1.5 text-left text-slate-500">{colLetter(i + 1)}</th>)}</tr></thead>
              <tbody>
                {d.rows.slice(0, 12).map((r) => (
                  <tr key={r.row} className={r.row === d.headerRow ? 'bg-teal-50 font-semibold' : r.row < d.headerRow ? 'text-slate-400' : ''}>
                    <td className="p-1.5 text-slate-500">{r.row}</td>{r.cells.slice(0, 14).map((c, i) => <td key={i} className="max-w-[160px] truncate p-1.5" title={c}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d && d.colCount > 14 && <p className="text-xs text-slate-500">Se muestran las primeras 14 columnas de {d.colCount}. Las demás (p. ej. dispositivos) se reconocen por su encabezado.</p>}
      </div>

      {d && opts && (
        <>
          <div className="card space-y-3">
            <h2 className="text-lg font-semibold text-navy-900">2. ¿Qué columna es cada dato?</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELD_ORDER.map((f) => (
                <Field key={f} label={FIELD_LABELS[f]}>
                  <select className="input" value={columns[f] ?? ''} onChange={(e) => setColumns({ ...columns, [f]: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">— no importar —</option>{colOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              ))}
            </div>
            {!columns.client && <p role="alert" className="text-sm text-danger">Debe indicar la columna del cliente.</p>}
          </div>

          <div className="card space-y-2">
            <h2 className="text-lg font-semibold text-navy-900">3. Columnas de dispositivos reconocidas</h2>
            {equipment.length === 0 && <p className="text-sm text-slate-500">No se reconoció ninguna columna de dispositivos (se importan solo los datos generales).</p>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {equipment.map((e, i) => (
                <label key={e.column} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                  <input type="checkbox" checked={e.on} onChange={(ev) => setEquipment(equipment.map((x, j) => (j === i ? { ...x, on: ev.target.checked } : x)))} />
                  <span className="w-28 shrink-0 truncate" title={e.header}>{colLetter(e.column)} · {e.header}</span>
                  <select className="input py-1 text-xs" aria-label={`Tipo de dispositivo para ${e.header}`} value={e.typeId} onChange={(ev) => setEquipment(equipment.map((x, j) => (j === i ? { ...x, typeId: ev.target.value } : x)))}>
                    {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {d.guess.ignored.length > 0 && <p className="text-xs text-slate-500">Se ignoran por ser totales: {d.guess.ignored.map((i) => i.header).join(', ')}.</p>}
            {d.guess.unrecognized.length > 0 && <p className="text-xs text-slate-500">Columnas no reconocidas (no se importan): {d.guess.unrecognized.map((i) => i.header).join(', ')}.</p>}
          </div>

          <div className="card space-y-3">
            <h2 className="text-lg font-semibold text-navy-900">4. Reglas de importación</h2>
            <Field label="Si el «próximo mantenimiento» del Excel ya venció">
              <select className="input max-w-xl" value={opts.overdueNext} onChange={(e) => setOpts({ ...opts, overdueNext: e.target.value as Opts['overdueNext'] })}>
                <option value="HISTORICAL">Guardarlo solo como dato (sin crear mantenimiento ni recordatorios) — recomendado</option>
                <option value="SCHEDULE">Crear un mantenimiento vencido (generará recordatorios semanales «VENCIDO»)</option>
                <option value="IGNORE">Descartarlo</option>
              </select>
            </Field>
            <Field label="Si la fila no tiene central">
              <select className="input max-w-xl" value={opts.blankCentral} onChange={(e) => setOpts({ ...opts, blankCentral: e.target.value as Opts['blankCentral'] })}>
                <option value="DEFAULT">Crear un sistema genérico en la categoría por defecto</option>
                <option value="SKIP_SYSTEM">No crear sistema (tampoco sus fechas ni dispositivos)</option>
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Categoría por defecto"><select className="input" value={opts.defaultCategoryId} onChange={(e) => setOpts({ ...opts, defaultCategoryId: e.target.value })}>{d.defaults.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Tipo de mantenimiento"><select className="input" value={opts.defaultMaintenanceTypeId} onChange={(e) => setOpts({ ...opts, defaultMaintenanceTypeId: e.target.value })}>{d.defaults.maintenanceTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Tipo de seguimiento"><select className="input" value={opts.followUpTypeId} onChange={(e) => setOpts({ ...opts, followUpTypeId: e.target.value })}>{d.defaults.followUpTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            </div>
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.importHistory} onChange={(e) => setOpts({ ...opts, importHistory: e.target.checked })} />Importar el último mantenimiento como historial (mantenimiento «Realizado»)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.importFollowUps} onChange={(e) => setOpts({ ...opts, importFollowUps: e.target.checked })} />Importar el texto de «Seguimiento» como seguimientos pendientes (sin fecha objetivo)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.detectLostSection} onChange={(e) => setOpts({ ...opts, detectLostSection: e.target.checked })} />Detectar la sección «CLIENTES PERDIDOS» (se importan como inactivos)</label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-primary" disabled={!columns.client || m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Validando…' : 'Validar y ver vista previa'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Paso 2: vista previa y confirmación ----------
const ROW_BADGE = { OK: 'bg-green-100 text-ok', WARNING: 'bg-amber-100 text-amber-800', ERROR: 'bg-red-100 text-danger', SKIPPED: 'bg-slate-200 text-slate-600' } as const;
const ROW_LABEL = { OK: 'Correcta', WARNING: 'Advertencia', ERROR: 'Error', SKIPPED: 'Omitida' } as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warn' }) {
  return <div className="rounded-lg border bg-white p-3"><div className="text-xs text-slate-500">{label}</div><div className={`text-2xl font-semibold ${tone === 'danger' && value ? 'text-danger' : tone === 'warn' && value ? 'text-accent-dark' : 'text-navy-900'}`}>{value}</div></div>;
}

function PreviewStep({ batch, preview, setPreview, onBack, onDone }: { batch: BatchDetail; preview: Preview; setPreview: (p: Preview) => void; onBack: () => void; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'ALL' | 'ERROR' | 'WARNING' | 'OK' | 'SKIPPED'>('ALL');
  const [rename, setRename] = useState<PRow | null>(null);
  const [name, setName] = useState('');
  const [ack, setAck] = useState(false);
  const cats = useQuery({ queryKey: ['catalog', 'system-categories'], queryFn: () => api<CatalogItem[]>('/catalogs/system-categories') });
  const s = preview.summary;
  const importable = s.rowsOk + s.rowsWarning;

  const recompute = useMutation({
    mutationFn: (cfg: Cfg) => api<Preview>(`/imports/${batch.id}/preview`, { method: 'POST', body: cfg as unknown as Record<string, unknown> }),
    onSuccess: (p) => { setPreview(p); setAck(false); }, onError: (e: Error) => toast('error', e.message),
  });
  const confirm = useMutation({
    mutationFn: () => api(`/imports/${batch.id}/confirm`, { method: 'POST', body: { acknowledge: true } }),
    onSuccess: () => { ['imports', 'clients', 'dashboard', 'systems', 'maintenances', 'follow-ups'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast('ok', 'Importación completada'); onDone(); },
    onError: (e: Error) => toast('error', e.message),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/imports/${batch.id}/cancel`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['imports'] }); toast('ok', 'Importación cancelada; no se guardó nada'); nav('/importaciones'); },
  });
  const cfg = preview.config;
  const setOverride = (row: number, o: { clientName?: string; skip?: boolean } | null) => {
    const overrides = { ...cfg.overrides };
    if (o) overrides[String(row)] = { ...overrides[String(row)], ...o }; else delete overrides[String(row)];
    recompute.mutate({ ...cfg, overrides });
  };
  const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const setCentral = (cv: CentralValue, categoryId: string) => {
    const chosen = cats.data?.find((c) => c.id === categoryId);
    // Si la categoría elegida se llama igual que el valor del Excel, no hay «modelo»; si no, el texto original se conserva como modelo.
    const model = chosen && plain(chosen.name) === plain(cv.value) ? null : (cv.model ?? cv.value);
    recompute.mutate({ ...cfg, centralMap: { ...cfg.centralMap, [cv.key]: { categoryId, brand: cv.brand, model } } });
  };
  const shown = useMemo(() => preview.rows.filter((r) => filter === 'ALL' || r.status === filter), [preview.rows, filter]);

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-orange-50 px-4 py-3 text-sm text-accent-dark"><b>Vista previa:</b> todavía no se ha guardado nada. Revise los datos y confirme al final.</div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Clientes nuevos" value={s.clientsNew} /><Stat label="Clientes existentes" value={s.clientsExisting} /><Stat label="Clientes perdidos (inactivos)" value={s.clientsLost} />
        <Stat label="Instalaciones nuevas" value={s.installationsNew} /><Stat label="Sistemas nuevos" value={s.systemsNew} /><Stat label="Sistemas ya existentes" value={s.systemsExisting} />
        <Stat label="Tipos de dispositivo" value={s.equipmentRows} /><Stat label="Mantenimientos históricos" value={s.historyMaintenances} /><Stat label="Mantenimientos programados" value={s.scheduledMaintenances} />
        <Stat label="Seguimientos" value={s.followUps} /><Stat label="Contactos nuevos" value={s.contactsNew} /><Stat label="Filas omitidas" value={s.rowsSkipped} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Filas que se importan" value={importable} /><Stat label="Con advertencias" value={s.rowsWarning} tone="warn" /><Stat label="Con errores (no se importan)" value={s.rowsError} tone="danger" />
      </div>

      {preview.centralValues.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-navy-900">Categoría de cada «central»</h2>
          <p className="mb-2 text-sm text-slate-500">Los valores que no coinciden con una categoría del catálogo se tratan como modelo de central en la categoría por defecto. Cámbielo aquí si no es correcto (p. ej. «EXTINTORES» no está en el catálogo: créelo antes en <Link className="text-teal-700 underline" to="/catalogos">Catálogos</Link>).</p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b bg-slate-50 text-slate-600"><tr><th className="p-2">Valor en el Excel</th><th className="p-2">Filas</th><th className="p-2">Se importará como</th></tr></thead>
              <tbody>
                {preview.centralValues.map((cv) => (
                  <tr key={cv.key} className="border-b last:border-0">
                    <td className="p-2 font-medium">{cv.value}</td><td className="p-2">{cv.count}</td>
                    <td className="p-2"><select className="input py-1" aria-label={`Categoría de ${cv.value}`} value={cv.categoryId} disabled={recompute.isPending} onChange={(e) => setCentral(cv, e.target.value)}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                      <span className="ml-2 text-xs text-slate-500">{cv.matchedCategory ? 'coincide con la categoría' : cv.model ? `modelo: ${cv.model}` : ''}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy-900">Filas del archivo</h2>
          <div className="flex flex-wrap gap-1 text-sm">
            {(['ALL', 'ERROR', 'WARNING', 'OK', 'SKIPPED'] as const).map((f) => (
              <button key={f} className={`rounded-full border px-3 py-1 ${filter === f ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-300'}`} onClick={() => setFilter(f)}>
                {f === 'ALL' ? `Todas (${preview.rows.length})` : `${ROW_LABEL[f]} (${preview.rows.filter((r) => r.status === f).length})`}
              </button>
            ))}
          </div>
        </div>
        {preview.truncated && <p className="text-xs text-slate-500">Se muestran las primeras 2000 filas.</p>}
        <div className="max-h-[32rem] overflow-auto rounded border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-slate-50 text-slate-600"><tr><th className="p-2">Fila</th><th className="p-2">Estado</th><th className="p-2">Cliente / instalación</th><th className="p-2">Sistema</th><th className="p-2">Qué ocurrirá</th><th className="p-2" /></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6}><Empty>No hay filas en este filtro.</Empty></td></tr>}
              {shown.map((r) => (
                <tr key={r.rowNumber} className="border-b align-top last:border-0">
                  <td className="p-2 whitespace-nowrap text-slate-500">{r.rowNumber}</td>
                  <td className="p-2"><span className={`badge ${ROW_BADGE[r.status]}`}>{ROW_LABEL[r.status]}</span>{r.lost && <span className="badge ml-1 bg-slate-100 text-slate-600">Perdido</span>}</td>
                  <td className="p-2">{r.clientName || '—'}<div className="text-xs text-slate-500">{r.installationName}</div></td>
                  <td className="p-2">{r.system ?? '—'}</td>
                  <td className="p-2"><div>{r.summary}</div>
                    {r.errors.map((e, i) => <div key={`e${i}`} className="text-xs text-danger">✖ {e}</div>)}
                    {r.warnings.map((w, i) => <div key={`w${i}`} className="text-xs text-amber-700">⚠ {w}</div>)}</td>
                  <td className="p-2 whitespace-nowrap text-right">
                    {r.status !== 'SKIPPED' || r.skipReason === 'USER' ? (
                      <>
                        {r.status !== 'SKIPPED' && <button className="btn-secondary mr-1 py-0.5 text-xs" onClick={() => { setRename(r); setName(r.clientName); }}>Renombrar cliente</button>}
                        <button className="btn-secondary py-0.5 text-xs" disabled={recompute.isPending} onClick={() => setOverride(r.rowNumber, r.skipReason === 'USER' ? null : { skip: true })}>{r.skipReason === 'USER' ? 'Incluir' : 'Omitir'}</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-navy-900">Confirmar importación</h2>
        <ul className="list-disc pl-5 text-sm text-slate-600">
          <li>Se importarán <b>{importable}</b> filas{s.rowsError ? <> y se omitirán <b>{s.rowsError}</b> con errores (podrá descargar el reporte)</> : null}.</li>
          <li>La importación solo <b>agrega</b> registros: no borra ni modifica clientes, instalaciones ni sistemas existentes.</li>
          <li>Si algo falla durante el guardado, no se guarda nada (todo o nada).</li>
        </ul>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Entiendo lo anterior y confirmo que revisé la vista previa.</span></label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onBack}>← Volver a la configuración</button>
            <a className="btn-secondary" href={downloadUrl(`/imports/${batch.id}/report.xlsx`)}>Descargar reporte de errores</a>
            <button className="btn-secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar importación</button>
          </div>
          <button className="btn-primary" disabled={!ack || importable === 0 || confirm.isPending || recompute.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? 'Importando…' : `Importar ${importable} filas`}</button>
        </div>
      </div>

      {rename && (
        <Modal title={`Renombrar cliente (fila ${rename.rowNumber})`} onClose={() => setRename(null)}>
          <p className="mb-3 text-sm text-slate-600">Use el mismo nombre de otro cliente (del archivo o ya existente) para fusionarlos. Solo cambia esta importación, no el Excel.</p>
          <input className="input mb-4" aria-label="Nuevo nombre del cliente" value={name} minLength={2} onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setRename(null)}>Cancelar</button>
            <button className="btn-primary" disabled={name.trim().length < 2} onClick={() => { setOverride(rename.rowNumber, { clientName: name.trim() }); setRename(null); }}>Aplicar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Resultado ----------
function ResultView({ batch }: { batch: BatchDetail }) {
  const r = batch.result ?? {};
  const rows: [string, number][] = [
    ['Clientes creados', r.clientsCreated], ['Clientes reutilizados', r.clientsReused], ['Contactos creados', r.contactsCreated], ['Instalaciones creadas', r.installationsCreated],
    ['Sistemas creados', r.systemsCreated], ['Sistemas ya existentes', r.systemsReused], ['Tipos de dispositivo cargados', r.equipmentCreated], ['Mantenimientos históricos', r.historyCreated],
    ['Mantenimientos programados', r.scheduledCreated], ['Seguimientos creados', r.followUpsCreated], ['Filas importadas', r.rowsImported], ['Filas con errores (no importadas)', r.rowsWithErrors],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-ok">Importación completada{batch.importedAt ? ` el ${new Date(batch.importedAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}` : ''}. El archivo original no se modificó.</div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{rows.map(([k, v]) => <Stat key={k} label={k} value={v ?? 0} tone={k.startsWith('Filas con errores') ? 'danger' : undefined} />)}</div>
      <div className="flex flex-wrap gap-2">
        <a className="btn-secondary" href={downloadUrl(`/imports/${batch.id}/report.xlsx`)}>Descargar reporte (errores y advertencias)</a>
        <Link className="btn-primary" to="/clientes">Ver clientes</Link><Link className="btn-secondary" to="/importaciones">Volver a importaciones</Link>
      </div>
    </div>
  );
}

export function ImportWizard() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['import', id], queryFn: () => api<BatchDetail>(`/imports/${id}`) });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [step, setStep] = useState<'configure' | 'preview'>('configure');
  const stored = useQuery({ queryKey: ['import', id, 'preview'], enabled: q.data?.status === 'PREVIEWED' && !preview, retry: false, queryFn: () => api<Preview>(`/imports/${id}/preview`) });
  useEffect(() => { if (stored.data && !preview) { setPreview(stored.data); setStep('preview'); } }, [stored.data, preview]);

  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">No se encontró la importación. <Link className="underline" to="/importaciones">Volver</Link></p>;
  const b = q.data;
  return (
    <div className="space-y-4">
      <div>
        <Link to="/importaciones" className="text-sm text-teal-700 hover:underline">← Importaciones</Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold text-navy-900">{b.fileName}<span className={`badge ${BATCH_STATUS[b.status].cls}`}>{BATCH_STATUS[b.status].label}</span></h1>
      </div>
      {b.status === 'IMPORTED' && <ResultView batch={b} />}
      {(b.status === 'CANCELLED' || b.status === 'FAILED') && <p className="card text-sm text-slate-600">{b.status === 'FAILED' ? `La importación falló y no se guardó ningún dato. ${b.error ?? ''}` : 'Esta importación fue cancelada.'} <Link className="text-teal-700 underline" to="/importaciones">Volver</Link></p>}
      {(b.status === 'UPLOADED' || b.status === 'PREVIEWED') && (
        step === 'preview' && preview
          ? <PreviewStep batch={b} preview={preview} setPreview={setPreview} onBack={() => setStep('configure')} onDone={() => { setPreview(null); qc.invalidateQueries({ queryKey: ['import', id] }); }} />
          : <ConfigureStep batch={b} initial={preview?.config ?? b.config} onPreview={(p) => { setPreview(p); setStep('preview'); }} />
      )}
    </div>
  );
}
