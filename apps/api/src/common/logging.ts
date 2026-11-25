import type { Options } from 'pino-http';

/**
 * Datos que NUNCA deben llegar a los logs: cookies de sesión, credenciales, el secreto del cron y cualquier clave.
 * (pino-http registra las cabeceras de cada petición; los cuerpos no se registran.)
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-cron-secret"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
];

export function pinoHttpOptions(env: NodeJS.ProcessEnv = process.env): Options {
  return {
    level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTADO]' },
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
  };
}
