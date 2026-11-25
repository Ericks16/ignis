# Arquitectura

```
Navegador ──HTTPS──▶ Vercel (React SPA + reescritura /api) ──▶ Render (NestJS) ──▶ Neon (PostgreSQL)
                                                                  ▲        │
cron-job.org / GitHub Actions ── POST /api/internal/cron/reminders┘        └──▶ Resend / Brevo (correo)
```

## Monorepo (npm workspaces)
| Carpeta | Contenido |
|---|---|
| `apps/api` | NestJS 11 + Prisma 6. Módulos: `auth`, `users`, `clients`, `installations`, `systems`, `catalogs`, `technicians`, `maintenance`, `follow-ups`, `reminders`, `email`, `imports`, `reports`, `dashboard`, `audit`, `health`, `common`, `config`. |
| `apps/web` | React 19 + Vite + Tailwind 4 + TanStack Query + FullCalendar. |
| `apps/e2e` | Playwright (Edge/Chromium) con entorno temporal propio. |
| `docs` | Documentación (este directorio). |

## Decisiones clave
- **Autorización en el backend**: guardas globales en orden *Throttler → CSRF → Sesión → Roles*; el alcance de datos del técnico vive en `common/scopes.ts` y lo comparten pantallas, reportes y exportaciones.
- **Sesión por cookie** (no JWT en el navegador): token aleatorio, guardado como SHA-256, revocable, `HttpOnly`/`SameSite=Lax`/`__Host-`.
- **Fechas de negocio** en `America/Guayaquil`; las fechas «solo día» se manejan sin hora para evitar corrimientos.
- **Recordatorios**: política pura (primer aviso 1 mes antes, luego semanal, también vencido, se detiene al finalizar/cancelar) + tabla `Notification` con `dedupeKey` único (idempotencia) + reclamo `FOR UPDATE SKIP LOCKED` + reintentos con espera + re-validación justo antes de enviar + cancelación transaccional al cerrar el registro. Detalle en [EMAIL_REMINDERS.md](EMAIL_REMINDERS.md).
- **Importación de Excel**: vista previa obligatoria, planificador puro, ejecución todo-o-nada que solo agrega, trazabilidad por lote. Detalle en [EXCEL_IMPORT.md](EXCEL_IMPORT.md).
- **Reportes**: 13 reportes con filtros, permisos por rol y exportación XLSX/CSV/PDF. Detalle en [REPORTES.md](REPORTES.md).
- **Sin dependencia del equipo del usuario**: todo corre en servicios en la nube; el PostgreSQL embebido es solo de desarrollo y pruebas.
- **Correo en modo prueba por defecto**: nada sale a destinatarios reales sin configuración explícita (`EMAIL_MODE=live`).

## Pruebas
170 de API (unitarias, integración, seguridad) + 12 E2E. Ver [SECURITY.md](SECURITY.md) y el README.
