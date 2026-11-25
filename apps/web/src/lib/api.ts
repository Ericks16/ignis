export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Json = Record<string, unknown> | undefined;

/** Cliente HTTP: cookie de sesión + cabecera anti-CSRF en todas las peticiones. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: Json } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ignis' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (data as { message?: string | string[] }).message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join('. ') : (m ?? 'Error inesperado'));
  }
  return data as T;
}

export type Role = 'ADMIN' | 'OPERATIVO' | 'TECNICO' | 'CONSULTA';
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  OPERATIVO: 'Administrador operativo',
  TECNICO: 'Técnico',
  CONSULTA: 'Consulta',
};

export interface Me { id: string; email: string; name: string; role: Role; mustChangePassword: boolean }
export interface UserRow extends Me { active: boolean; selfRegistered?: boolean; lastLoginAt: string | null; createdAt: string }

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export type Status = 'ACTIVE' | 'INACTIVE';
export interface Contact {
  id: string; clientId: string; name: string; position: string | null; phone: string | null; email: string | null;
  receivesNotifications: boolean; active: boolean;
}
export interface Client {
  id: string; commercialName: string; legalName: string | null; ruc: string | null; address: string | null; city: string | null;
  province: string | null; phone: string | null; email: string | null; status: Status; notes: string | null;
  createdAt: string; updatedAt: string; _count?: { installations: number }; contacts?: Contact[];
}
export interface Installation {
  id: string; clientId: string; name: string; type: string | null; address: string | null; city: string | null; province: string | null;
  contactName: string | null; contactPhone: string | null; notes: string | null; status: Status;
  client?: { id: string; commercialName: string; status: Status };
}
export interface HistoryItem { id: string; action: string; actor: string | null; createdAt: string; metadata: unknown }

export type OpStatus = 'OPERATIVO' | 'CON_FALLAS' | 'FUERA_DE_SERVICIO';
export const OP_LABEL: Record<OpStatus, string> = { OPERATIVO: 'Operativo', CON_FALLAS: 'Con fallas', FUERA_DE_SERVICIO: 'Fuera de servicio' };
export interface CatalogItem { id: string; name: string; description: string | null; code?: string | null; sortOrder?: number; active: boolean }
export interface Equipment { id: string; systemId: string; typeId: string; type: { id: string; name: string; code: string | null }; quantity: number; label: string | null; status: OpStatus; notes: string | null; active: boolean }
export interface InstalledSystem {
  id: string; installationId: string; categoryId: string; brand: string | null; model: string | null; serialNumber: string | null;
  installedAt: string | null; location: string | null; operationalStatus: OpStatus; relation: 'INSTALADO' | 'MTTO' | null;
  description: string | null; notes: string | null; lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
  responsibleId: string | null; status: Status;
  category: { id: string; name: string }; responsible: { id: string; name: string } | null;
  installation: { id: string; name: string; status: Status; clientId: string; client: { id: string; commercialName: string } };
  _count: { equipment: number }; equipment?: Equipment[];
}
export interface Technician {
  id: string; name: string; email: string | null; phone: string | null; position: string | null; specialty: string | null;
  initials: string | null; hireDate: string | null; notes: string | null; status: Status; userId: string | null; user?: { id: string; email: string } | null;
}
export type MStatus = 'PROGRAMADO' | 'PENDIENTE' | 'EN_PROCESO' | 'REALIZADO' | 'CANCELADO' | 'REPROGRAMADO';
export const M_LABEL: Record<MStatus, string> = {
  PROGRAMADO: 'Programado', PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', REPROGRAMADO: 'Reprogramado',
};
export const M_OPEN: MStatus[] = ['PROGRAMADO', 'PENDIENTE', 'EN_PROCESO'];
export interface Maintenance {
  id: string; status: MStatus; overdue: boolean; scheduledDate: string; executedDate: string | null; nextMaintenanceDate: string | null;
  description: string | null; observations: string | null; recommendations: string | null; materials: string | null; result: string | null;
  type: { id: string; name: string };
  system: {
    id: string; brand: string | null; model: string | null; lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
    category: { id: string; name: string };
    installation: { id: string; name: string; client: { id: string; commercialName: string } };
  };
  technicians: { id: string; name: string; initials: string | null }[];
  rescheduledFrom?: { id: string; scheduledDate: string } | null; rescheduledTo?: { id: string; scheduledDate: string } | null;
}
export interface CalendarEvent {
  id: string; kind: 'MAINTENANCE' | 'FOLLOWUP'; date: string; status: string; overdue: boolean; title: string; client: string; installation: string;
  category?: string; type?: string; technicians: string[]; closed?: boolean; priority?: Priority;
}
export type Priority = 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export const PRIORITY_LABEL: Record<Priority, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
export interface FollowUpStatus { id: string; name: string; isTerminal: boolean; isSystem: boolean; sortOrder: number; active: boolean }
export interface FollowUp {
  id: string; title: string; description: string | null; priority: Priority; overdue: boolean; startDate: string; targetDate: string | null;
  completedAt: string | null; nextAction: string | null; observations: string | null; remindersEnabled: boolean;
  client: { id: string; commercialName: string }; installation: { id: string; name: string } | null;
  system: { id: string; brand: string | null; model: string | null; category: { name: string } } | null;
  maintenance: { id: string; scheduledDate: string; type: { name: string } } | null;
  type: { id: string; name: string }; status: { id: string; name: string; isTerminal: boolean };
  responsible: { id: string; name: string } | null; completedBy: { id: string; name: string } | null;
  technicians: { id: string; name: string; initials: string | null }[];
}
export interface FollowUpHistoryItem { id: string; fromName: string | null; toName: string; comment: string | null; by: string | null; createdAt: string }
export interface Activity {
  id: string; description: string; occurredAt: string; type: { id: string; name: string }; user: { id: string; name: string } | null;
  client: { id: string; commercialName: string } | null; followUp: { id: string; title: string } | null; maintenance: { id: string; scheduledDate: string } | null;
}
export const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/** Solo Administrador y Administrador operativo editan datos de negocio (el backend lo valida igualmente). */
export const canWrite = (role?: Role) => role === 'ADMIN' || role === 'OPERATIVO';
