import { guessHeaderRow, guessMapping, importConfigSchema, ImportConfig } from '../src/imports/import.mapping';
import { buildPlan, parseDateCell, PlannerContext } from '../src/imports/import.planner';
import { CellValue } from '../src/imports/excel.reader';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CAT = { alarma: U(1), bomba: U(2), lamparas: U(3), pararrayos: U(4), gabinetes: U(5) };
const T_DH = U(11), T_DT = U(12);
const TODAY = '2026-11-25';

const ctx = (over: Partial<PlannerContext> = {}): PlannerContext => ({
  today: TODAY,
  categories: [
    { id: CAT.alarma, name: 'SISTEMA DE DETECCIÓN DE ALARMA' }, { id: CAT.bomba, name: 'BOMBA CI' }, { id: CAT.lamparas, name: 'LÁMPARAS' },
    { id: CAT.pararrayos, name: 'PARARRAYOS' }, { id: CAT.gabinetes, name: 'GABINETES' },
  ],
  equipmentTypes: [{ id: T_DH, name: 'Detector de humo' }, { id: T_DT, name: 'Detector térmico' }],
  existingClients: [], existingInstallations: [], existingSystems: [], existingContacts: [], existingFollowUps: [],
  ...over,
});

const HEADER: CellValue[] = ['ESTADO', 'Cliente', 'Direccion', 'Persona a Cargo', 'CENTRAL', 'FECHA MTO', 'Proximo MTO', 'SEGUIMIENTO', 'DH', 'DT'];
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const cfg = (options: Partial<ImportConfig['options']> = {}, extra: Partial<ImportConfig> = {}): ImportConfig =>
  importConfigSchema.parse({
    sheet: 'CARTERA', headerRow: 1,
    columns: { status: 1, client: 2, installation: 3, contact: 4, central: 5, lastMaintenance: 6, nextMaintenance: 7, followUp: 8 },
    equipment: [{ column: 9, typeId: T_DH }, { column: 10, typeId: T_DT }],
    options: { defaultCategoryId: CAT.alarma, defaultMaintenanceTypeId: U(21), followUpTypeId: U(31), ...options },
    ...extra,
  });
const plan = (rows: CellValue[][], c = cfg(), cx = ctx()) => buildPlan([HEADER, ...rows], c, cx);
const row = (v: Partial<Record<string, CellValue>>): CellValue[] => [v.estado === undefined ? 'MTTO' : v.estado, v.cliente ?? 'ACME SA', v.sede ?? 'MATRIZ', v.contacto ?? null, v.central === undefined ? 'BOSCH FPA 1000' : v.central, v.ultimo ?? null, v.proximo ?? null, v.seg ?? null, v.dh ?? null, v.dt ?? null];

describe('Lectura de fechas del Excel (unitarias)', () => {
  it('acepta fechas de Excel, serie numérica y textos AAAA-MM-DD / DD/MM/AAAA', () => {
    expect(parseDateCell(d('2025-03-01'))).toEqual({ iso: '2025-03-01' });
    expect(parseDateCell(45717)).toEqual({ iso: '2025-03-01' }); // serie de Excel
    expect(parseDateCell('2025-3-1')).toEqual({ iso: '2025-03-01' });
    expect(parseDateCell('15/03/2025')).toEqual({ iso: '2025-03-15' });
    expect(parseDateCell(null)).toEqual({});
  });
  it('rechaza fechas imposibles, mal escritas o fuera de rango', () => {
    expect(parseDateCell('31/02/2026').error).toMatch(/inválida/);
    expect(parseDateCell('marzo').error).toMatch(/no reconocida/);
    expect(parseDateCell('2026-13-01').error).toBeTruthy();
    expect(parseDateCell(d('1999-01-01')).error).toMatch(/rango/);
  });
});

describe('Reconocimiento de columnas (unitarias)', () => {
  const TYPES = [
    ['Detector de humo', 'DH'], ['Detector térmico', 'DT'], ['Estación manual', 'EM'], ['Luz estroboscópica', 'LUZ_ESTROB'], ['Expansor', 'EXPANSOR'], ['Parlante con luz', 'PARLANTE_LUZ'],
    ['Sensor de calor', 'SENSOR_CALOR'], ['Detector de gas', 'D_GAS'], ['Photobeam', 'PHOTOBEAM'], ['Módulo de monitoreo', 'M_MONITOREO'], ['Módulo relé', 'M_RELAY'],
    ['Módulo de aislamiento', 'M_AISLAMIENTO'], ['Panel de descarga', 'PANEL_DESCARGA'], ['Botón de aborto', 'BOTON_ABORTO'], ['Llave de mantenimiento', 'LLAVE_MTO'],
    ['Módulo de descarga', 'M_DESCARGA'], ['Solenoide', 'SOLENOIDE'], ['Activador manual', 'ACTIVADOR_MANUAL'], ['Cilindro', 'CILINDRO'], ['Tubería de descarga', 'TUBERIA_DESCARGA'],
    ['Boquilla de descarga', 'BOQUILLA_DESCARGA'], ['Lámpara de emergencia', 'LAMPARA'], ['Rociador', 'ROCIADOR'], ['Teclado', 'TECLADO'], ['Fuente de poder', 'FUENTE_PODER'],
    ['Sirena', 'SIRENA'], ['Batería', 'BATERIA'], ['Panel / central', 'PANEL'],
  ].map(([name, code], i) => ({ id: U(100 + i), name, code }));
  // Encabezados reales de la hoja «CARTERA DE CLIENTES» del Excel de IGNIS
  const REAL = ['ESTADO', 'Cliente', 'Direccion', 'Persona a Cargo', 'CENTRAL', 'FECHA MTO', 'Proximo MTO', 'SEGUIMIENTO', 'CANT DISP', 'DH', 'DT', 'EM', 'LUZ ESTROB.', 'ESPANSORES', 'Parlante con luz',
    'Sensor de calor ', 'D GAS', 'PHOTOBEAM', 'M MONITOREO', 'MRELAY', 'M AISLAMIENTO', 'PANEL DESCARGA', 'BOTON ABORTO', 'LLAVE MTO', 'M DESCARGA', 'SOLENOIDE', 'ACTIVADOR MANUAL ', 'CILINDRO ',
    'TUBERIA DESCARGA', 'BOQUILLA DESCARGA', 'LAMPARAS', 'ROCIADORES', 'TECLADO', 'FUENTE DE PODER ', 'SIRENA', 'BATERIA '];

  it('reconoce los encabezados reales del Excel de IGNIS: campos, 27 tipos de dispositivo y el total ignorado', () => {
    const g = guessMapping(REAL, TYPES);
    expect(g.columns).toMatchObject({ status: 1, client: 2, installation: 3, contact: 4, central: 5, lastMaintenance: 6, nextMaintenance: 7, followUp: 8 });
    expect(g.equipment).toHaveLength(27);
    expect(g.ignored.map((i) => i.header)).toEqual(['CANT DISP']);
    expect(g.unrecognized).toEqual([]);
    expect(g.equipment.find((e) => e.header === 'LAMPARAS')?.typeId).toBe(TYPES.find((t) => t.code === 'LAMPARA')!.id);
    expect(g.equipment.find((e) => e.header === 'ESPANSORES')?.typeId).toBe(TYPES.find((t) => t.code === 'EXPANSOR')!.id);
  });
  it('encuentra la fila de encabezados aunque haya títulos encima', () => {
    expect(guessHeaderRow([['CARTERA DE CLIENTES'], [], REAL as CellValue[], ['X', 'Y']], TYPES)).toBe(3);
  });
});

describe('Planificación de la importación (unitarias, sin base de datos)', () => {
  it('fila completa: crea cliente, instalación, contacto, sistema, dispositivos, histórico, programado y seguimiento', () => {
    const p = plan([row({ contacto: 'Ana Pérez', ultimo: d('2026-03-01'), proximo: d('2027-03-01'), seg: 'enviar proforma', dh: 59, dt: 22 })]);
    const r = p.rows[0];
    expect(r.status).toBe('WARNING'); // el contacto no tiene correo
    expect(r).toMatchObject({ clientNew: true, installationNew: true, lastDate: '2026-03-01', nextDate: '2027-03-01', nextMode: 'SCHEDULE' });
    expect(r.system).toMatchObject({ categoryId: CAT.alarma, model: 'BOSCH FPA 1000', brand: 'Bosch', relation: 'MTTO', isNew: true });
    expect(r.equipment).toEqual([{ typeId: T_DH, typeName: 'Detector de humo', quantity: 59 }, { typeId: T_DT, typeName: 'Detector térmico', quantity: 22 }]);
    expect(r.followUp).toMatchObject({ title: 'Enviar proforma', skipExisting: false });
    expect(p.summary).toMatchObject({ clientsNew: 1, installationsNew: 1, systemsNew: 1, equipmentRows: 2, historyMaintenances: 1, scheduledMaintenances: 1, followUps: 1, contactsNew: 1 });
  });

  it('una celda de central que coincide con una categoría (incl. erratas del Excel) usa esa categoría sin modelo', () => {
    const p = plan([row({ cliente: 'Alfa SA', central: 'BOMBA CI' }), row({ cliente: 'Beta SA', central: 'PARRARAYOS' }), row({ cliente: 'Gama SA', central: 'LAMPARAS' })]);
    expect(p.rows.map((r) => r.system?.categoryId)).toEqual([CAT.bomba, CAT.pararrayos, CAT.lamparas]);
    expect(p.rows.every((r) => r.system?.model === null)).toBe(true);
    expect(p.centralValues.find((c) => c.key === 'parrarayos')?.matchedCategory).toBe(true);
  });

  it('un modelo no reconocido va a la categoría por defecto, con marca si es conocida, y se puede reasignar', () => {
    const p = plan([row({ central: 'EXTINTORES' }), row({ cliente: 'Zeta SA', central: 'DSC 1832' })]);
    expect(p.rows[0].system).toMatchObject({ categoryId: CAT.alarma, model: 'EXTINTORES', brand: null });
    expect(p.rows[1].system).toMatchObject({ model: 'DSC 1832', brand: 'Dsc' });
    const mapped = plan([row({ central: 'EXTINTORES' })], cfg({}, { centralMap: { extintores: { categoryId: CAT.gabinetes, model: null } } }));
    expect(mapped.rows[0].system).toMatchObject({ categoryId: CAT.gabinetes, model: null });
    expect(mapped.centralValues[0].decided).toBe(true);
  });

  it('varias filas del mismo cliente crean UN cliente con varias instalaciones', () => {
    const p = plan([row({ cliente: 'Grupo Superior', sede: 'TAWA' }), row({ cliente: 'GRUPO  SUPERIOR ', sede: 'ESTE' }), row({ cliente: 'grupo superior', sede: 'TAWA', central: 'DSC 1832' })]);
    expect(p.summary).toMatchObject({ clientsNew: 1, installationsNew: 2, systemsNew: 3 });
    expect(p.rows.map((r) => r.clientNew)).toEqual([true, false, false]);
  });

  it('reutiliza lo que ya existe y NO lo modifica (solo avisa)', () => {
    const existing = ctx({
      existingClients: [{ id: 'c1', name: 'Acme SA', normalized: 'acme sa', status: 'ACTIVE', ruc: null }],
      existingInstallations: [{ id: 'i1', clientId: 'c1', normalized: 'matriz' }],
      existingSystems: [{ id: 's1', installationId: 'i1', categoryId: CAT.alarma, normModel: 'bosch fpa 1000' }],
    });
    const p = plan([row({ dh: 10 })], cfg(), existing);
    const r = p.rows[0];
    expect(r).toMatchObject({ clientExistingId: 'c1', installationExistingId: 'i1', clientNew: false, installationNew: false });
    expect(r.system).toMatchObject({ existingId: 's1', isNew: false });
    expect(r.equipment).toEqual([]); // no se agregan dispositivos a un sistema existente
    expect(r.warnings.join(' ')).toMatch(/ya existe/);
    expect(p.summary).toMatchObject({ clientsNew: 0, clientsExisting: 1, systemsNew: 0, systemsExisting: 1 });
  });

  it('un sistema repetido en el archivo se omite con aviso', () => {
    const p = plan([row({ cliente: 'Equis SA' }), row({ cliente: 'Equis SA' })]);
    expect(p.rows[1].system?.isNew).toBe(false);
    expect(p.rows[1].warnings.join(' ')).toMatch(/repetido en el archivo \(fila 2\)/);
    expect(p.summary.systemsNew).toBe(1);
  });

  it('errores por fila: fecha, RUC, correos, cantidades y cliente faltante (la fila se excluye)', () => {
    const c = cfg({}, { columns: { status: 1, client: 2, installation: 3, contact: 4, central: 5, lastMaintenance: 6, nextMaintenance: 7, followUp: 8, ruc: 11, clientEmail: 12, contactEmail: 13 } });
    const bad = (extra: CellValue[]) => [...row({ cliente: 'Bad SA', ultimo: 'mañana' }).slice(0, 10), ...extra];
    const p = plan([
      bad([null, null, null]),
      [...row({ cliente: 'Ruc SA' }), '123', null, null],
      [...row({ cliente: 'Mail SA' }), null, 'sin-arroba', null],
      [...row({ cliente: 'Contacto SA', contacto: 'X Y' }), null, null, 'x@@y'],
      row({ cliente: 'Cant SA', dh: -3 }),
      row({ cliente: 'Cant2 SA', dh: 2.5 }),
      row({ cliente: '' }),
      row({ cliente: 'Futuro SA', ultimo: d('2030-01-01') }),
    ], c);
    expect(p.rows.map((r) => r.status)).toEqual(Array(8).fill('ERROR'));
    expect(p.rows[0].errors[0]).toMatch(/Fecha de último mantenimiento/);
    expect(p.rows[1].errors[0]).toMatch(/RUC inválido/);
    expect(p.rows[2].errors[0]).toMatch(/Correo del cliente inválido/);
    expect(p.rows[3].errors[0]).toMatch(/Correo del contacto inválido/);
    expect(p.rows[4].errors[0]).toMatch(/Cantidad inválida en «DH»/);
    expect(p.rows[5].errors[0]).toMatch(/Cantidad inválida/);
    expect(p.rows[6].errors[0]).toMatch(/Falta el nombre del cliente/);
    expect(p.rows[7].errors[0]).toMatch(/no puede estar en el futuro/);
    expect(p.summary).toMatchObject({ rowsError: 8, clientsNew: 0, systemsNew: 0 });
  });

  it('una fila con error no «reserva» al cliente: la siguiente fila válida sí lo crea', () => {
    const p = plan([row({ cliente: 'Mismo SA', dh: -1 }), row({ cliente: 'Mismo SA', dh: 1 })]);
    expect(p.rows.map((r) => r.status)).toEqual(['ERROR', 'OK']);
    expect(p.rows[1]).toMatchObject({ clientNew: true, installationNew: true });
    expect(p.summary).toMatchObject({ clientsNew: 1, systemsNew: 1 });
  });

  it('RUC: ya existente en otro cliente o repetido en el archivo es error', () => {
    const c = cfg({}, { columns: { client: 2, installation: 3, central: 5, ruc: 11 } });
    const cx = ctx({ existingClients: [{ id: 'c9', name: 'Dueño SA', normalized: 'dueno sa', status: 'ACTIVE', ruc: '1790012345001' }] });
    const p = plan([[...row({ cliente: 'Otro SA' }), '1790012345001'], [...row({ cliente: 'Uno SA' }), '0992345678001'], [...row({ cliente: 'Dos SA' }), '0992345678001']], c, cx);
    expect(p.rows.map((r) => r.status)).toEqual(['ERROR', 'OK', 'ERROR']);
    expect(p.rows[0].errors[0]).toMatch(/pertenece al cliente «Dueño SA»/);
    expect(p.rows[2].errors[0]).toMatch(/repetido para otro cliente/);
  });

  it('sección «CLIENTES PERDIDOS»: filas inactivas, sin programación ni seguimiento; encabezados repetidos se omiten', () => {
    const divider: CellValue[] = Array(10).fill('CLIENTES PERDIDOS');
    const p = plan([
      row({ cliente: 'Activo SA', proximo: d('2027-05-01'), seg: 'llamar' }), divider, HEADER,
      row({ cliente: 'Perdido SA', ultimo: d('2024-05-01'), proximo: d('2027-05-01'), seg: 'cerrada' }),
    ]);
    expect(p.rows.map((r) => r.status)).toEqual(['OK', 'SKIPPED', 'SKIPPED', 'WARNING']);
    expect(p.rows[1].skipReason).toBe('DIVIDER');
    expect(p.rows[2].skipReason).toBe('HEADER');
    expect(p.rows[3]).toMatchObject({ lost: true, nextMode: 'IGNORE' });
    expect(p.rows[3].followUp).toBeUndefined();
    expect(p.rows[0]).toMatchObject({ lost: false, nextMode: 'SCHEDULE' });
    expect(p.summary).toMatchObject({ clientsLost: 1, scheduledMaintenances: 1, followUps: 1, rowsSkipped: 2 });
    // si se desactiva la detección, el divisor no tiene efecto
    expect(plan([divider, row({ cliente: 'Perdido SA' })], cfg({ detectLostSection: false })).rows[1].lost).toBe(false);
  });

  it('próximo mantenimiento vencido: respeta la política elegida (histórico por defecto, sin recordatorios)', () => {
    const r = (opt: 'HISTORICAL' | 'SCHEDULE' | 'IGNORE') => plan([row({ proximo: d('2025-09-01') })], cfg({ overdueNext: opt })).rows[0];
    expect(r('HISTORICAL')).toMatchObject({ nextMode: 'HISTORICAL', nextDate: '2025-09-01' });
    expect(r('SCHEDULE').nextMode).toBe('SCHEDULE');
    expect(r('IGNORE').nextMode).toBe('IGNORE');
    expect(r('HISTORICAL').warnings.join(' ')).toMatch(/sin recordatorios/);
    expect(plan([row({ proximo: d('2026-11-25') })]).rows[0].nextMode).toBe('SCHEDULE'); // hoy o futuro: se programa
    expect(plan([row({ proximo: d('2026-11-24') })]).rows[0].nextMode).toBe('HISTORICAL'); // ayer: vencido
  });

  it('próximo anterior o igual al último se ignora con aviso', () => {
    const r = plan([row({ ultimo: d('2026-06-01'), proximo: d('2026-06-01') })]).rows[0];
    expect(r.nextMode).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/no es posterior/);
  });

  it('sin central: sistema genérico o sin sistema según la opción', () => {
    const a = plan([row({ central: null, ultimo: d('2026-01-01'), dh: 3 })], cfg({ blankCentral: 'DEFAULT' })).rows[0];
    expect(a.system).toMatchObject({ categoryId: CAT.alarma, model: null, isNew: true });
    expect(a.warnings.join(' ')).toMatch(/Sin central indicada/);
    const b = plan([row({ central: null, ultimo: d('2026-01-01'), dh: 3 })], cfg({ blankCentral: 'SKIP_SYSTEM' })).rows[0];
    expect(b.system).toBeUndefined();
    expect(b.lastDate).toBeUndefined();
    expect(b.equipment).toEqual([]);
    expect(b.warnings.join(' ')).toMatch(/no se crea sistema/);
  });

  it('nombres parecidos (AUDIAUTO / AUDIOAUTO) generan advertencia y se pueden fusionar renombrando', () => {
    const p = plan([row({ cliente: 'AUDIAUTO', sede: 'BATAN' }), row({ cliente: 'AUDIOAUTO', sede: 'GYE' })]);
    expect(p.rows[0].warnings.join(' ')).toMatch(/muy parecido a fila 3/);
    expect(p.summary.clientsNew).toBe(2);
    const merged = plan([row({ cliente: 'AUDIAUTO', sede: 'BATAN' }), row({ cliente: 'AUDIOAUTO', sede: 'GYE' })], cfg({}, { overrides: { '3': { clientName: 'AUDIAUTO' } } }));
    expect(merged.summary).toMatchObject({ clientsNew: 1, installationsNew: 2 });
    expect(merged.rows[0].warnings.join(' ')).not.toMatch(/parecido/);
  });

  it('filas omitidas por el usuario, vacías y seguimientos repetidos o largos', () => {
    const p = plan(
      [row({ cliente: 'Alfa SA', seg: 'enviar proforma' }), Array(10).fill(null), row({ cliente: 'Beta SA' }), row({ cliente: 'Alfa SA', sede: 'OTRA', seg: 'Enviar Proforma' }), row({ cliente: 'Gama SA', seg: 'x'.repeat(250) })],
      cfg({}, { overrides: { '4': { skip: true } } }),
    );
    expect(p.rows.map((r) => r.status)).toEqual(['OK', 'SKIPPED', 'WARNING', 'OK']); // la fila vacía no se informa
    expect(p.rows[1].skipReason).toBe('USER');
    expect(p.rows[3].followUp?.title).toHaveLength(200);
    expect(p.rows[3].followUp?.description).toHaveLength(250);
    const dup = plan([row({ cliente: 'Alfa SA', seg: 'enviar proforma' }), row({ cliente: 'Alfa SA', sede: 'OTRA', seg: 'Enviar Proforma' })]);
    expect(dup.rows[1].followUp?.skipExisting).toBe(true);
    expect(dup.summary.followUps).toBe(1);
  });

  it('estado no reconocido genera advertencia; sin estado no', () => {
    expect(plan([row({ estado: 'RARO' })]).rows[0].warnings.join(' ')).toMatch(/Estado no reconocido/);
    expect(plan([row({ estado: null })]).rows[0].warnings).toEqual([]);
    expect(plan([row({ estado: 'INSTALADO' })]).rows[0].system?.relation).toBe('INSTALADO');
  });
});
