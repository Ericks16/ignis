import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    APP_TIMEZONE: z.string().default('America/Guayaquil'),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    /** Peticiones por minuto y por IP (general) y para el inicio de sesión. */
    RATE_LIMIT_GLOBAL: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_LOGIN: z.coerce.number().int().min(1).default(10),
    /** URL pública del frontend; se usa para los enlaces de los correos. */
    APP_URL: z.string().url().default('http://localhost:5173'),
    /** test = nunca envía correos reales (solo los registra). live = envía con el proveedor configurado. */
    EMAIL_MODE: z.enum(['test', 'live']).default('test'),
    EMAIL_PROVIDER: z.enum(['console', 'resend', 'brevo']).default('console'),
    EMAIL_FROM: z.string().default('IGNIS <no-reply@localhost>'),
    RESEND_API_KEY: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
    /** Lista (separada por comas) de destinatarios permitidos en modo live. Vacío = sin restricción. Útil durante el piloto. */
    EMAIL_ALLOWED_RECIPIENTS: z.string().default(''),
    /** Secreto del endpoint del cron externo (POST /api/internal/cron/reminders). Sin valor, el endpoint queda deshabilitado. */
    CRON_SECRET: z.string().min(24, 'CRON_SECRET debe tener al menos 24 caracteres').optional(),
  })
  .superRefine((e, ctx) => {
    if (e.EMAIL_MODE === 'live') {
      if (e.EMAIL_PROVIDER === 'console') ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'EMAIL_MODE=live requiere EMAIL_PROVIDER=resend o brevo' });
      if (e.EMAIL_PROVIDER === 'resend' && !e.RESEND_API_KEY) ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Falta RESEND_API_KEY' });
      if (e.EMAIL_PROVIDER === 'brevo' && !e.BREVO_API_KEY) ctx.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'Falta BREVO_API_KEY' });
    }
  });

export type Env = z.infer<typeof schema> & { corsOrigins: string[]; allowedRecipients: string[] };

let cached: Env | undefined;

/** Valida y devuelve la configuración. Falla al arrancar si falta algo. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${msg}`);
  }
  const d = parsed.data;
  cached = {
    ...d,
    corsOrigins: d.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    allowedRecipients: d.EMAIL_ALLOWED_RECIPIENTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
  return cached;
}

/** Solo para pruebas. */
export function resetEnvCache() { cached = undefined; }
