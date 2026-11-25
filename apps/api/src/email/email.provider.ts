import { Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Clave de idempotencia (id de la notificación) para proveedores que la soportan. */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ id: string }>;
}

/** Error de envío. permanent = no tiene sentido reintentar (p. ej. dirección inválida, 4xx). */
export class EmailError extends Error {
  constructor(message: string, public readonly permanent = false) { super(message); }
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/** Modo de prueba/desarrollo: no envía nada; solo registra en el log. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('Email[console]');
  async send(msg: EmailMessage) {
    this.logger.log(`(no enviado, modo prueba) Para: ${msg.to} · Asunto: ${msg.subject}`);
    return { id: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new EmailError(`Error de red al enviar: ${(e as Error).name === 'TimeoutError' ? 'tiempo de espera agotado' : 'sin conexión con el proveedor'}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { message?: string }).message ?? res.statusText;
    // 4xx (salvo 408/429) = problema de la petición: no se reintenta. 5xx/429 = temporal.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    throw new EmailError(`El proveedor respondió ${res.status}: ${String(detail).slice(0, 200)}`, permanent);
  }
  return data;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  constructor(private readonly apiKey: string, private readonly from: string) {}
  async send(m: EmailMessage) {
    const data = (await post(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${this.apiKey}`, ...(m.idempotencyKey ? { 'Idempotency-Key': m.idempotencyKey } : {}) },
      { from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text },
    )) as { id?: string };
    return { id: data.id ?? 'resend' };
  }
}

export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';
  constructor(private readonly apiKey: string, private readonly from: string) {}
  async send(m: EmailMessage) {
    const match = /^(.*)<(.+)>$/.exec(this.from);
    const sender = match ? { name: match[1].trim(), email: match[2].trim() } : { email: this.from };
    const data = (await post('https://api.brevo.com/v3/smtp/email', { 'api-key': this.apiKey }, { sender, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text })) as { messageId?: string };
    return { id: data.messageId ?? 'brevo' };
  }
}
