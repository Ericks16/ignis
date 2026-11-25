# Guía de despliegue (capa gratuita)

Arquitectura: **Vercel** (frontend + proxy `/api`) → **Render** (API NestJS) → **Neon** (PostgreSQL) · correo por **Resend o Brevo** · disparador diario del cron por **cron-job.org** (respaldo: GitHub Actions).

> Ningún paso de esta guía fue ejecutado todavía contra servicios reales: requieren cuentas suyas. Lo verificado localmente: el build de producción, el arranque con `NODE_ENV=production` (salud, migraciones, cookie `__Host-`, Swagger desactivado, endpoint del cron) y las 182 pruebas automáticas.

## Por qué el frontend proxea `/api`
La cookie de sesión es `SameSite=Lax` y `__Host-` (no admite `Domain`). Para que el navegador la trate como del mismo sitio, el frontend y la API deben verse bajo **el mismo dominio**: Vercel reescribe `https://su-app.vercel.app/api/*` hacia Render (`apps/web/vercel.json`). No use CORS entre dominios distintos: la sesión no funcionaría.

## 0. Requisitos previos
1. Subir el proyecto a un repositorio privado de GitHub (hoy la carpeta no es un repositorio git). El `.gitignore` ya excluye `.env`, `.pgdata`, `node_modules`, `dist`.
2. Confirmar que **no** hay secretos en el repositorio (solo existe `apps/api/.env.example`).

## 1. Base de datos (Neon)
1. Cree un proyecto en Neon (región cercana a Render, p. ej. `us-east`/`us-west`).
2. Copie la cadena de conexión (con `sslmode=require`). Será `DATABASE_URL`.
3. Las migraciones se aplican solas en cada arranque de la API (`prisma migrate deploy`: solo agrega, no borra).
4. Neon suspende el cómputo tras inactividad (la primera consulta tarda unos segundos). Verifique en su página de precios los límites actuales de almacenamiento, horas de cómputo y retención de respaldos.

## 2. API (Render)
1. *New → Blueprint* y elija el repositorio; Render lee `render.yaml`.
2. Complete las variables marcadas como secretas:
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena de Neon |
   | `CORS_ORIGINS` y `APP_URL` | URL del frontend (p. ej. `https://ignis.vercel.app`) |
   | `CRON_SECRET` | ≥ 24 caracteres aleatorios (genérelo con un gestor de contraseñas) |
   | `EMAIL_FROM`, `RESEND_API_KEY` / `BREVO_API_KEY`, `EMAIL_ALLOWED_RECIPIENTS` | ver sección 5 |
3. Compruebe `https://<su-api>.onrender.com/health/ready`: `status: ok`, `database: up`.
4. Límite conocido: el servicio gratuito **se duerme tras ~15 minutos sin tráfico** y tarda ~1 minuto en despertar; el filesystem es efímero (la aplicación no guarda archivos en disco, salvo el Excel de una importación en curso, que va a la base de datos). Verifique las condiciones vigentes en [render.com/docs/free](https://render.com/docs/free).

## 3. Primer administrador
Desde su computador, una sola vez, con la cadena de Neon solo en esa terminal:

```powershell
$env:DATABASE_URL = "<cadena de Neon>"
$env:SEED_ADMIN_EMAIL = "admin@su-empresa.com"
$env:SEED_ADMIN_PASSWORD = "<clave temporal>"
npm run seed -w apps/api
```
El usuario queda con cambio de contraseña obligatorio en el primer ingreso. No se sobrescribe si ya existe. Cierre la terminal o limpie las variables al terminar. Desde el panel de Usuarios cree el resto de cuentas.

## 4. Frontend (Vercel)
1. *Add New → Project*, elija el repositorio y como **Root Directory** `apps/web`.
2. Edite `apps/web/vercel.json`: reemplace `REEMPLAZAR-con-la-URL-de-render.onrender.com` por el host de su API en Render y haga commit.
3. Despliegue. Pruebe `https://<app>.vercel.app` → ingreso con el administrador.
4. Nota: Vercel *Hobby* es para uso no comercial; si IGNIS lo usará comercialmente, evalúe **Cloudflare Pages** (proxy `/api` mediante una Pages Function o Worker equivalente a la reescritura) o un plan de pago. Verifique los términos vigentes.

## 5. Correo y recordatorios
1. Cree la cuenta en Resend o Brevo y **verifique el dominio** (SPF y DKIM) del remitente. Sin dominio verificado los correos pueden ir a spam o ser rechazados.
2. En Render defina `EMAIL_PROVIDER` (`resend` o `brevo`), la clave y `EMAIL_FROM`.
3. **Piloto**: ponga `EMAIL_ALLOWED_RECIPIENTS` con 1–2 correos internos y cambie `EMAIL_MODE=live`. Desde *Recordatorios* envíe pruebas y revise *Notificaciones*.
4. Cuando el piloto sea correcto, vacíe `EMAIL_ALLOWED_RECIPIENTS` para operar con todos los destinatarios.

### Disparador diario (imprescindible)
La API en plan gratuito se duerme: **no** hay planificador interno confiable. Configure un cron externo que llame una vez al día (y puede repetirse con seguridad: es idempotente):

- **cron-job.org** (recomendado): URL `https://<su-api>.onrender.com/api/internal/cron/reminders`, método `POST`, cabecera `x-cron-secret: <CRON_SECRET>`, horario diario 07:30 hora de Ecuador, *timeout* 60–90 s (cubre el despertar).
- **Respaldo**: el flujo `.github/workflows/reminders-cron.yml` (secretos de repositorio `IGNIS_API_URL` e `IGNIS_CRON_SECRET`). GitHub puede retrasar ejecuciones programadas, por eso es respaldo.
- `GET /health/ready` avisa si el scheduler está atrasado (> 26 h).

## 6. Operación
- **Copias de seguridad**: dependen de la retención de Neon en su plan; además exporte periódicamente los reportes (Excel) y considere `pg_dump` mensual con una cadena de solo lectura.
- **Actualizar**: hacer *push* a `main`; CI valida, Render y Vercel redespliegan solos. Las migraciones corren al arrancar.
- **Revertir**: Render y Vercel permiten volver a un despliegue anterior; las migraciones solo agregan, por lo que el código anterior sigue funcionando.
- **Rotar secretos**: cambie `CRON_SECRET` en Render **y** en cron-job.org/GitHub a la vez.
- **Cerrar el acceso de alguien**: desactive el usuario (sus sesiones dejan de valer de inmediato).

## 7. Lista de verificación antes de abrir a los usuarios
- [ ] `/health/ready` en verde y sin advertencias tras la primera llamada del cron.
- [ ] Ingreso, cambio de clave obligatorio y cierre de sesión funcionan en el dominio final (cookie `__Host-ignis_session` visible solo como HttpOnly).
- [ ] Crear un usuario por rol y comprobar sus permisos.
- [ ] Piloto de correo con destinatarios limitados.
- [ ] Decisión sobre la importación real del Excel (ver `docs/ESTADO.md`), con vista previa y confirmación.
- [ ] Respaldo/retención de Neon revisado.
