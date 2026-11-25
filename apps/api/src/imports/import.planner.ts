import { normalizeName } from '../common/helpers';
import { CellValue, display } from './excel.reader';
import { ImportConfig, norm } from './import.mapping';

/**
 * Planificador de la importación: función PURA (sin base de datos). Recibe la hoja leída, la configuración y una
 * «foto» de lo que ya existe, y decide qué se crearía, qué se reutiliza y qué filas tienen errores o advertencias.
 * Nunca borra ni modifica registros existentes.
 */
export interface PlannerContext {
  today: string; // AAAA-MM-DD (America/Guayaquil)
  categories: { id: string; name: string }[];
  equipmentTypes: { id: string; name: string }[];
  existingClients: { id: string; name: string; normalized: string; status: 'ACTIVE' | 'INACTIVE'; ruc: string | null }[];
  existingInstallations: { id: string; clientId: string; normalized: string }[];
  existingSystems: { id: string; installationId: string; categoryId: string; normModel: string }[];
  existingContacts: { clientId: string; normName: string }[];
  existingFollowUps: { clientId: string; normTitle: string }[];
}

export type RowStatus = 'OK' | 'WARNING' | 'ERROR' | 'SKIPPED';
export type SkipReason = 'EMPTY' | 'HEADER' | 'DIVIDER' | 'USER';
export type NextMode = 'SCHEDULE' | 'HISTORICAL' | 'IGNORE';

export interface PlannedRow {
  rowNumber: number;
  status: RowStatus;
  skipReason?: SkipReason;
  lost: boolean;
  errors: string[];
  warnings: string[];
  clientName: string;
  clientKey: string;
  clientExistingId?: string;
  clientNew: boolean;
  ruc?: string;
  clientEmail?: string;
  city?: string;
  contact?: { name: string; email?: string; isNew: boolean };
  installationName: string;
  installationKey: string;
  installationExistingId?: string;
  installationNew: boolean;
  system?: { categoryId: string; categoryName: string; brand: string | null; model: string | null; relation: 'INSTALADO' | 'MTTO' | null; existingId?: string; isNew: boolean; key: string };
  equipment: { typeId: string; typeName: string; quantity: number }[];
  lastDate?: string;
  nextDate?: string;
  nextMode?: NextMode;
  followUp?: { title: string; description?: string; skipExisting: boolean };
  summary: string;
}

export interface CentralValue {
  key: string; value: string; count: number; categoryId: string; categoryName: string; brand: string | null; model: string | null; matchedCategory: boolean; decided: boolean;
}

export interface PlanSummary {
  rowsTotal: number; rowsOk: number; rowsWarning: number; rowsError: number; rowsSkipped: number;
  clientsNew: number; clientsExisting: number; clientsLost: number; contactsNew: number; installationsNew: number;
  systemsNew: number; systemsExisting: number; equipmentRows: number; historyMaintenances: number; scheduledMaintenances: number; followUps: number;
}

export interface Plan { rows: PlannedRow[]; summary: PlanSummary; centralValues: CentralValue[] }

const KNOWN_BRANDS = ['BOSCH', 'DSC', 'SIMPLEX', 'KIDDE', 'FIRELITE', 'HONEYWELL', 'NOTIFIER', 'NOTIFIRE', 'MIRCON', 'PARADOX', 'COFEM', 'ELKRON'];
/** Errores de digitación frecuentes del Excel de IGNIS para los nombres de categoría. */
const CATEGORY_TYPOS: Record<string, string> = { parrarayos: 'pararrayos', 'red contra incedios': 'red contra incendios', lampara: 'lamparas', gabinete: 'gabinetes' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RUC_RE = /^\d{10}(\d{3})?$/;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase());

/** Interpreta una celda como fecha. Acepta fechas de Excel, serie numérica, AAAA-MM-DD y DD/MM/AAAA. */
export function parseDateCell(v: CellValue): { iso?: string; error?: string } {
  if (v === null || v === '') return {};
  let iso: string | undefined;
  if (v instanceof Date) iso = v.toISOString().slice(0, 10);
  else if (typeof v === 'number') {
    if (v < 1 || v > 80_000) return { error: `Fecha inválida: ${v}` };
    iso = new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10); // serie de Excel (1900)
  } else {
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    else if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s))) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    else return { error: `Fecha no reconocida: «${s}»` };
  }
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return { error: `Fecha inválida: «${display(v)}»` };
  const y = Number(iso.slice(0, 4));
  if (y < 2000 || y > 2100) return { error: `Año fuera de rango (2000–2100): «${display(v)}»` };
  return { iso };
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function emptyPlanSummary(): PlanSummary {
  return { rowsTotal: 0, rowsOk: 0, rowsWarning: 0, rowsError: 0, rowsSkipped: 0, clientsNew: 0, clientsExisting: 0, clientsLost: 0, contactsNew: 0, installationsNew: 0, systemsNew: 0, systemsExisting: 0, equipmentRows: 0, historyMaintenances: 0, scheduledMaintenances: 0, followUps: 0 };
}

export function buildPlan(grid: CellValue[][], cfg: ImportConfig, ctx: PlannerContext): Plan {
  const headers = grid[cfg.headerRow - 1] ?? [];
  const headerText = (c: number) => display(headers[c - 1] ?? null);
  const cell = (row: CellValue[], c?: number): CellValue => (c ? row[c - 1] ?? null : null);
  const text = (row: CellValue[], c?: number) => display(cell(row, c)).trim();

  const catById = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const catByNorm = new Map(ctx.categories.map((c) => [norm(c.name), c]));
  const typeById = new Map(ctx.equipmentTypes.map((t) => [t.id, t.name]));
  const existingByClient = new Map(ctx.existingClients.map((c) => [c.normalized, c]));
  const existingInst = new Map(ctx.existingInstallations.map((i) => [`${i.clientId}|${i.normalized}`, i.id]));
  const existingSys = new Map(ctx.existingSystems.map((s) => [`${s.installationId}|${s.categoryId}|${s.normModel}`, s.id]));
  const existingContacts = new Set(ctx.existingContacts.map((c) => `${c.clientId}|${c.normName}`));
  const existingFollowUps = new Set(ctx.existingFollowUps.map((f) => `${f.clientId}|${f.normTitle}`));

  const rows: PlannedRow[] = [];
  const clientGroups = new Map<string, { name: string; firstRow: number; existingId?: string }>();
  const fileInstallations = new Set<string>();
  const fileSystems = new Map<string, number>();
  const fileContacts = new Set<string>();
  const fileFollowUps = new Set<string>();
  const fileRuc = new Map<string, string>();
  const centralStats = new Map<string, CentralValue>();
  let lost = false;

  const classify = (raw: string): { categoryId: string; brand: string | null; model: string | null; matched: boolean; decided: boolean; key: string } => {
    const key = norm(raw);
    const chosen = cfg.centralMap[key];
    if (chosen) {
      if (!catById.has(chosen.categoryId)) return { categoryId: cfg.options.defaultCategoryId, brand: null, model: raw, matched: false, decided: false, key };
      return { categoryId: chosen.categoryId, brand: chosen.brand ?? null, model: chosen.model ?? null, matched: false, decided: true, key };
    }
    const cat = catByNorm.get(CATEGORY_TYPOS[key] ?? key);
    if (cat) return { categoryId: cat.id, brand: null, model: null, matched: true, decided: false, key };
    const first = raw.split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, '') ?? '';
    return { categoryId: cfg.options.defaultCategoryId, brand: KNOWN_BRANDS.includes(first) ? titleCase(first) : null, model: raw, matched: false, decided: false, key };
  };

  for (let r = cfg.headerRow; r < grid.length; r++) {
    const row = grid[r];
    const rowNumber = r + 1;
    const base: PlannedRow = {
      rowNumber, status: 'OK', lost, errors: [], warnings: [], clientName: '', clientKey: '', clientNew: false, installationName: '', installationKey: '',
      installationNew: false, equipment: [], summary: '',
    };
    const nonEmpty = row.filter((c) => c !== null && display(c) !== '');
    if (!nonEmpty.length) continue; // fila vacía: no se informa

    // Fila divisoria «CLIENTES PERDIDOS» (celdas combinadas): lo que sigue son clientes perdidos.
    if (cfg.options.detectLostSection && new Set(nonEmpty.map((c) => norm(display(c)))).size === 1 && norm(display(nonEmpty[0])) === 'clientes perdidos') {
      lost = true;
      rows.push({ ...base, status: 'SKIPPED', skipReason: 'DIVIDER', summary: 'Sección «Clientes perdidos»: las filas siguientes se importan como inactivas' });
      continue;
    }
    // Encabezado repetido dentro de la hoja.
    const hClient = norm(headerText(cfg.columns.client));
    if (hClient && norm(text(row, cfg.columns.client)) === hClient) { rows.push({ ...base, status: 'SKIPPED', skipReason: 'HEADER', summary: 'Encabezado repetido' }); continue; }
    if (cfg.overrides[String(rowNumber)]?.skip) { rows.push({ ...base, status: 'SKIPPED', skipReason: 'USER', summary: 'Omitida por el usuario' }); continue; }
    base.lost = lost;

    const errors = base.errors;
    const warnings = base.warnings;
    // Las claves de la fila solo se registran si la fila es válida: una fila con errores no «reserva» clientes, sistemas, etc.
    const commit: (() => void)[] = [];

    // ---- Cliente ----
    const clientName = (cfg.overrides[String(rowNumber)]?.clientName ?? text(row, cfg.columns.client)).replace(/\s+/g, ' ').trim();
    if (!clientName) errors.push('Falta el nombre del cliente');
    else if (clientName.length < 2 || clientName.length > 150) errors.push('El nombre del cliente debe tener entre 2 y 150 caracteres');
    const clientKey = normalizeName(clientName);
    base.clientName = clientName;
    base.clientKey = clientKey;
    const existing = clientKey ? existingByClient.get(clientKey) : undefined;
    if (existing) { base.clientExistingId = existing.id; base.clientName = existing.name; }
    if (clientKey && !clientGroups.has(clientKey)) { commit.push(() => clientGroups.set(clientKey, { name: clientName, firstRow: rowNumber, existingId: existing?.id })); base.clientNew = !existing; }
    if (existing && lost && existing.status === 'ACTIVE') warnings.push('El cliente ya existe y está activo: no se cambia su estado aunque figure como perdido');

    const ruc = text(row, cfg.columns.ruc).replace(/[\s.-]/g, '');
    if (ruc) {
      if (!RUC_RE.test(ruc)) errors.push(`RUC inválido (debe tener 10 o 13 dígitos): «${ruc}»`);
      else if (!existing) {
        const owner = ctx.existingClients.find((c) => c.ruc === ruc);
        if (owner) errors.push(`El RUC ${ruc} ya pertenece al cliente «${owner.name}»`);
        else if (fileRuc.has(ruc) && fileRuc.get(ruc) !== clientKey) errors.push(`El RUC ${ruc} está repetido para otro cliente del archivo`);
        else { commit.push(() => fileRuc.set(ruc, clientKey)); base.ruc = ruc; }
      }
    }
    const clientEmail = text(row, cfg.columns.clientEmail).toLowerCase();
    if (clientEmail) { if (EMAIL_RE.test(clientEmail)) base.clientEmail = clientEmail; else errors.push(`Correo del cliente inválido: «${clientEmail}»`); }
    const city = text(row, cfg.columns.city);
    if (city) base.city = city.slice(0, 80);

    // ---- Instalación ----
    const instRaw = text(row, cfg.columns.installation).replace(/\s+/g, ' ');
    if (!instRaw) warnings.push('Sin instalación/sede: se usará «Principal»');
    base.installationName = (instRaw || 'Principal').slice(0, 150);
    base.installationKey = normalizeName(base.installationName);
    const instKeyFull = `${clientKey}|${base.installationKey}`;
    const instExisting = existing ? existingInst.get(`${existing.id}|${base.installationKey}`) : undefined;
    if (instExisting) base.installationExistingId = instExisting;
    else if (!fileInstallations.has(instKeyFull)) { base.installationNew = true; commit.push(() => fileInstallations.add(instKeyFull)); }

    // ---- Contacto ----
    const contactName = text(row, cfg.columns.contact).slice(0, 120);
    const contactEmail = text(row, cfg.columns.contactEmail).toLowerCase();
    if (contactEmail && !EMAIL_RE.test(contactEmail)) errors.push(`Correo del contacto inválido: «${contactEmail}»`);
    if (contactName) {
      const ck = `${existing?.id ?? clientKey}|${normalizeName(contactName)}`;
      const isNew = !existingContacts.has(ck) && !fileContacts.has(ck);
      commit.push(() => fileContacts.add(ck));
      base.contact = { name: contactName, email: contactEmail && EMAIL_RE.test(contactEmail) ? contactEmail : undefined, isNew };
      if (isNew && !base.contact.email) warnings.push('El contacto no tiene correo (no recibirá recordatorios)');
    }

    // ---- Estado (relación) ----
    const statusRaw = norm(text(row, cfg.columns.status));
    let relation: 'INSTALADO' | 'MTTO' | null = null;
    if (['instalado'].includes(statusRaw)) relation = 'INSTALADO';
    else if (['mtto', 'mto', 'mantenimiento', 'mttos'].includes(statusRaw)) relation = 'MTTO';
    else if (statusRaw && !(lost && statusRaw === 'clientes perdidos')) warnings.push(`Estado no reconocido: «${text(row, cfg.columns.status)}» (se espera INSTALADO o MTTO)`);

    // ---- Fechas ----
    const last = parseDateCell(cell(row, cfg.columns.lastMaintenance));
    const next = parseDateCell(cell(row, cfg.columns.nextMaintenance));
    if (last.error) errors.push(`Fecha de último mantenimiento: ${last.error}`);
    if (next.error) errors.push(`Fecha de próximo mantenimiento: ${next.error}`);
    if (last.iso && last.iso > ctx.today) errors.push(`El último mantenimiento (${last.iso}) no puede estar en el futuro`);
    let nextIso = next.iso;
    if (last.iso && nextIso && nextIso <= last.iso) { warnings.push('El próximo mantenimiento no es posterior al último: se ignora el próximo'); nextIso = undefined; }

    // ---- Sistema ----
    const centralRaw = text(row, cfg.columns.central);
    let skipSystem = false;
    let sys: PlannedRow['system'];
    if (!centralRaw) {
      if (cfg.options.blankCentral === 'SKIP_SYSTEM') { skipSystem = true; if (last.iso || nextIso || nonEmptyEquipment(row, cfg)) warnings.push('Sin central: no se crea sistema, por lo que no se importan sus fechas ni dispositivos'); }
      else warnings.push('Sin central indicada: se crea un sistema genérico en la categoría por defecto');
    }
    if (!skipSystem) {
      const c = centralRaw ? classify(centralRaw) : { categoryId: cfg.options.defaultCategoryId, brand: null as string | null, model: null as string | null, matched: false, decided: false, key: '' };
      if (!catById.has(c.categoryId)) errors.push('La categoría de sistema elegida ya no existe');
      if (centralRaw) {
        const st = centralStats.get(c.key);
        if (st) st.count++;
        else centralStats.set(c.key, { key: c.key, value: centralRaw, count: 1, categoryId: c.categoryId, categoryName: catById.get(c.categoryId) ?? '', brand: c.brand, model: c.model, matchedCategory: c.matched, decided: c.decided });
      }
      const normModel = normalizeName(c.model ?? '');
      const sysKey = `${instExisting ?? instKeyFull}|${c.categoryId}|${normModel}`;
      const sysExisting = instExisting ? existingSys.get(`${instExisting}|${c.categoryId}|${normModel}`) : undefined;
      const dupRow = fileSystems.get(sysKey);
      sys = { categoryId: c.categoryId, categoryName: catById.get(c.categoryId) ?? '', brand: c.brand, model: c.model, relation, existingId: sysExisting, isNew: !sysExisting && dupRow === undefined, key: sysKey };
      if (sysExisting) warnings.push('El sistema ya existe: no se modifica (solo se agregan mantenimientos o seguimientos que falten)');
      if (dupRow !== undefined) { warnings.push(`Sistema repetido en el archivo (fila ${dupRow}): se omite el duplicado`); sys.isNew = false; }
      else if (!sysExisting) commit.push(() => fileSystems.set(sysKey, rowNumber));
    }

    // ---- Dispositivos (solo para sistemas nuevos) ----
    if (sys) {
      for (const e of cfg.equipment) {
        const v = cell(row, e.column);
        if (v === null || display(v) === '') continue;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100_000) { errors.push(`Cantidad inválida en «${headerText(e.column)}»: «${display(v)}»`); continue; }
        if (n === 0) continue;
        if (sys.isNew) base.equipment.push({ typeId: e.typeId, typeName: typeById.get(e.typeId) ?? headerText(e.column), quantity: n });
      }
      if (!sys.isNew && nonEmptyEquipment(row, cfg)) warnings.push('Los dispositivos no se importan porque el sistema ya existe o está repetido');
    }

    // ---- Mantenimientos ----
    if (sys) {
      if (cfg.options.importHistory && last.iso) base.lastDate = last.iso;
      if (nextIso) {
        if (lost) { base.nextDate = nextIso; base.nextMode = 'IGNORE'; warnings.push('Cliente perdido: el próximo mantenimiento no se programa'); }
        else if (nextIso < ctx.today) {
          base.nextDate = nextIso;
          base.nextMode = cfg.options.overdueNext;
          warnings.push(cfg.options.overdueNext === 'SCHEDULE' ? `Próximo mantenimiento vencido (${nextIso}): se creará vencido y generará recordatorios` : cfg.options.overdueNext === 'HISTORICAL' ? `Próximo mantenimiento vencido (${nextIso}): se guarda solo como dato, sin recordatorios` : `Próximo mantenimiento vencido (${nextIso}): se descarta`);
        } else { base.nextDate = nextIso; base.nextMode = 'SCHEDULE'; }
      }
    }

    // ---- Seguimiento ----
    const fuText = text(row, cfg.columns.followUp);
    if (fuText && cfg.options.importFollowUps) {
      if (lost) warnings.push('Cliente perdido: el seguimiento no se importa');
      else {
        const clean = fuText.replace(/\s+/g, ' ');
        const title = (clean.charAt(0).toUpperCase() + clean.slice(1)).slice(0, 200);
        const fk = `${existing?.id ?? clientKey}|${normalizeName(title)}`;
        const dup = existingFollowUps.has(fk) || fileFollowUps.has(fk);
        commit.push(() => fileFollowUps.add(fk));
        base.followUp = { title, description: clean.length > 200 ? clean : undefined, skipExisting: dup };
        if (dup) warnings.push('Seguimiento repetido: no se vuelve a crear');
      }
    }

    // ---- Resultado de la fila ----
    base.system = sys;
    const parts: string[] = [];
    if (base.clientNew) parts.push('cliente nuevo'); else if (clientKey) parts.push('cliente existente');
    if (base.installationNew) parts.push('instalación nueva');
    if (sys?.isNew) parts.push('sistema nuevo');
    if (base.equipment.length) parts.push(`${base.equipment.length} tipos de dispositivo`);
    if (base.lastDate) parts.push('mantenimiento histórico');
    if (base.nextMode === 'SCHEDULE') parts.push('mantenimiento programado');
    if (base.followUp && !base.followUp.skipExisting) parts.push('seguimiento');
    base.summary = errors.length ? 'No se importa (tiene errores)' : parts.join(' · ') || 'Sin cambios';
    base.status = errors.length ? 'ERROR' : warnings.length ? 'WARNING' : 'OK';
    if (!errors.length) commit.forEach((fn) => fn());
    rows.push(base);
  }

  // Nombres muy parecidos (posibles duplicados): se avisa en la primera fila de cada cliente nuevo.
  const newGroups = [...clientGroups.entries()].filter(([, g]) => !g.existingId);
  if (newGroups.length <= 1500) {
    const pool = [...ctx.existingClients.map((c) => ({ key: c.normalized, label: `cliente existente «${c.name}»` })), ...newGroups.map(([k, g]) => ({ key: k, label: `fila ${g.firstRow} «${g.name}»` }))];
    for (const [key, g] of newGroups) {
      if (key.length < 8) continue;
      const tolerance = (len: number) => Math.min(2, Math.max(1, Math.floor(len * 0.15)));
      const similar = pool.find((p) => p.key !== key && p.key.length >= 8 && levenshtein(p.key, key) <= tolerance(Math.max(p.key.length, key.length)));
      if (similar) {
        const pr = rows.find((x) => x.rowNumber === g.firstRow);
        if (pr && pr.status !== 'ERROR') { pr.warnings.push(`Nombre muy parecido a ${similar.label}. Si es el mismo cliente, renómbrelo para fusionarlos.`); pr.status = 'WARNING'; }
      }
    }
  }

  const summary = emptyPlanSummary();
  for (const p of rows) {
    summary.rowsTotal++;
    if (p.status === 'SKIPPED') { summary.rowsSkipped++; continue; }
    if (p.status === 'ERROR') { summary.rowsError++; continue; }
    if (p.status === 'WARNING') summary.rowsWarning++; else summary.rowsOk++;
    if (p.clientNew) { summary.clientsNew++; if (p.lost) summary.clientsLost++; } else summary.clientsExisting++;
    if (p.contact?.isNew) summary.contactsNew++;
    if (p.installationNew) summary.installationsNew++;
    if (p.system?.isNew) summary.systemsNew++; else if (p.system?.existingId) summary.systemsExisting++;
    summary.equipmentRows += p.equipment.length;
    if (p.lastDate) summary.historyMaintenances++;
    if (p.nextMode === 'SCHEDULE') summary.scheduledMaintenances++;
    if (p.followUp && !p.followUp.skipExisting) summary.followUps++;
  }
  // «clientsExisting» cuenta filas, no clientes distintos: se corrige a clientes distintos.
  summary.clientsExisting = new Set(rows.filter((p) => p.status !== 'SKIPPED' && p.status !== 'ERROR' && p.clientExistingId).map((p) => p.clientExistingId)).size;

  const centralValues = [...centralStats.values()].sort((a, b) => b.count - a.count);
  return { rows, summary, centralValues };
}

function nonEmptyEquipment(row: CellValue[], cfg: ImportConfig): boolean {
  return cfg.equipment.some((e) => {
    const v = row[e.column - 1];
    return v !== null && v !== undefined && display(v) !== '' && Number(v) !== 0;
  });
}
