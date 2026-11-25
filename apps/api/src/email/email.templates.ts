export interface ReminderEmailData {
  entityLabel: 'Seguimiento' | 'Mantenimiento';
  title: string;
  client: string;
  installation?: string | null;
  systemType?: string | null;
  typeName?: string | null;
  targetDate: string; // AAAA-MM-DD
  status: string;
  responsible?: string | null;
  priority?: string | null;
  nextAction?: string | null;
  url: string;
  /** Días que faltan hasta la fecha objetivo (negativo = vencido). */
  daysLeft: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function urgency(daysLeft: number): { label: string; overdue: boolean } {
  if (daysLeft < 0) return { label: `VENCIDO hace ${-daysLeft} ${-daysLeft === 1 ? 'día' : 'días'}`, overdue: true };
  if (daysLeft === 0) return { label: 'Vence hoy', overdue: false };
  if (daysLeft === 1) return { label: 'Vence mañana', overdue: false };
  return { label: `Vence en ${daysLeft} días`, overdue: false };
}

export function reminderSubject(d: ReminderEmailData): string {
  const u = urgency(d.daysLeft);
  return u.overdue
    ? `[IGNIS] VENCIDO: ${d.title} (${d.client})`
    : `[IGNIS] Recordatorio: ${d.title} (${d.client}) · ${fmtDate(d.targetDate)}`;
}

/** Plantilla HTML responsive (tablas y estilos en línea, compatible con clientes de correo) y versión de texto plano. */
export function renderReminderEmail(d: ReminderEmailData): { subject: string; html: string; text: string } {
  const u = urgency(d.daysLeft);
  const color = u.overdue ? '#c62828' : d.daysLeft <= 7 ? '#d85a10' : '#13677a';
  const rows: [string, string | null | undefined][] = [
    ['Cliente', d.client], ['Instalación', d.installation], ['Tipo de sistema', d.systemType], [d.entityLabel === 'Seguimiento' ? 'Tipo de seguimiento' : 'Tipo de mantenimiento', d.typeName],
    ['Fecha objetivo', fmtDate(d.targetDate)], ['Estado', d.status], ['Responsable', d.responsible], ['Prioridad', d.priority], ['Próxima acción', d.nextAction],
  ];
  const shown = rows.filter(([, v]) => v);
  const tr = shown.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#0f172a">${esc(String(v))}</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reminderSubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:16px 8px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0b2545;padding:18px 24px"><span style="font-size:24px;font-weight:700;letter-spacing:1px;color:#f26b1d">IGNIS</span> <span style="font-size:13px;color:#cbd5e1">Maintenance Manager</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#64748b">${esc(d.entityLabel)}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0b2545">${esc(d.title)}</h1>
<p style="display:inline-block;margin:0 0 16px;padding:6px 12px;border-radius:999px;background:${color};color:#ffffff;font-size:13px;font-weight:600">${esc(u.label)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e2e8f0;padding-top:8px">${tr}</table>
<p style="margin:24px 0 0"><a href="${esc(d.url)}" style="display:inline-block;background:#f26b1d;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;font-size:14px">Abrir en el sistema</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#64748b;word-break:break-all">Si el botón no funciona, copie este enlace: ${esc(d.url)}</p>
</td></tr>
<tr><td style="background:#f8fafc;padding:14px 24px;font-size:12px;color:#64748b">Recordatorio automático de IGNIS. Se repetirá periódicamente hasta que el ${esc(d.entityLabel.toLowerCase())} se finalice o cancele.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    'IGNIS Maintenance Manager',
    '',
    `${d.entityLabel.toUpperCase()}: ${d.title}`,
    u.label.toUpperCase(),
    '',
    ...shown.map(([k, v]) => `${k}: ${v}`),
    '',
    `Abrir en el sistema: ${d.url}`,
    '',
    `Recordatorio automático de IGNIS. Se repetirá periódicamente hasta que el ${d.entityLabel.toLowerCase()} se finalice o cancele.`,
  ].join('\n');
  return { subject: reminderSubject(d), html, text };
}
