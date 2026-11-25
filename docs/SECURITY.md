# Seguridad — IGNIS Maintenance Manager

Resumen de los controles implementados, cómo se verifican y lo que queda como riesgo aceptado o responsabilidad de la operación.

## Controles implementados

| Área | Control | Verificación |
|---|---|---|
| Contraseñas | bcrypt (coste 12), mínimo 10 caracteres con mayúscula, minúscula y número; contraseña temporal obliga a cambio | `auth-users.spec.ts` |
| Sesiones | Token aleatorio de 256 bits; en BD solo se guarda su SHA-256; expiración (`SESSION_TTL_HOURS`); se cierran las demás sesiones al cambiar la clave; sesiones vencidas se purgan | `security.spec.ts` |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`; en producción `Secure` y prefijo `__Host-` (sin `Domain`) | `security.spec.ts` (modo producción), E2E |
| Inicio de sesión | Mensaje único para correo inexistente, clave errónea, usuario inactivo o cuenta bloqueada; comparación de hash en tiempo constante; bloqueo tras 5 fallos (15 min); límite por IP (`RATE_LIMIT_LOGIN`) | `security.spec.ts` |
| CSRF | Cabecera personalizada `X-Requested-With: ignis` + validación de `Origin` en toda mutación; solo el endpoint del cron (con secreto propio) la omite | `security.spec.ts`, E2E |
| Autorización | Roles aplicados en el backend en **cada** ruta (guardas globales); alcance de datos del técnico (solo lo asignado) compartido por pantallas, reportes y exportaciones | Matriz de permisos con introspección de rutas: una ruta nueva sin clasificar rompe la prueba |
| Validación | `class-validator` con `whitelist` + `forbidNonWhitelisted` (rechaza campos no previstos: asignación masiva), UUID y enums validados | `security.spec.ts` |
| Inyección | Prisma parametrizado; sin SQL concatenado con datos de usuario; los SQL crudos del motor de recordatorios usan parámetros | `security.spec.ts` (payloads SQL) |
| XSS | React escapa el texto; la API responde JSON con `nosniff`; los reportes/exports neutralizan fórmulas (`=`, `+`, `-`, `@`) | `security.spec.ts`, E2E |
| Cabeceras | Helmet (CSP, HSTS, nosniff, frame-options); sin `X-Powered-By` | `security.spec.ts` |
| CORS | Solo los orígenes de `CORS_ORIGINS`, con credenciales | `security.spec.ts` |
| Límite de peticiones | Global (`RATE_LIMIT_GLOBAL`) y específico de login; `/health` exento | `security.spec.ts` |
| Errores | Respuesta genérica en errores internos (sin SQL, rutas ni stack); errores del analizador de cuerpo (413) con mensaje propio | `security.spec.ts` |
| Archivos subidos | Solo `.xlsx`, ≤ 10 MB, firma ZIP, inspección del directorio central **sin descomprimir** (máx. 2 000 entradas y 120 MB descomprimidos: protege contra «bombas zip»), lectura en memoria, el original nunca se modifica | `security.spec.ts`, `imports.spec.ts` |
| Importación | Vista previa obligatoria, transacción todo-o-nada, solo agrega, trazabilidad por lote; claves `__proto__`/`constructor` no contaminan | `imports.spec.ts`, `security.spec.ts` |
| Secretos en logs | Se redactan cookies, `Authorization`, `x-cron-secret`, `x-api-key` y contraseñas | `security.spec.ts` |
| Registro | La solicitud crea una cuenta **inactiva** de solo consulta que un administrador aprueba; ignora campos como rol o estado; respuesta idéntica exista o no el correo | `access-recovery.spec.ts` |
| Recuperación de clave | Token aleatorio de 256 bits, solo se guarda su hash, un solo uso, vence en 60 min, invalida el anterior y cierra todas las sesiones; respuesta neutra para correos desconocidos; con límite de peticiones | `access-recovery.spec.ts`, `security.spec.ts` |
| Chat (WebSocket) | Ticket de un solo uso (60 s) obtenido con la sesión; sala validada en cada mensaje según el alcance del usuario; límite de longitud y de velocidad; el HTML se trata como texto | `chat.spec.ts` |
| Correo | `EMAIL_MODE=test` por defecto (nunca envía); en vivo exige proveedor y claves; lista de destinatarios permitidos para pilotos; sin datos hardcodeados | `reminders.spec.ts` |
| Cron | Endpoint con `x-cron-secret` (≥ 24 caracteres), sin sesión; ejecuciones idempotentes y registradas | `reminders.spec.ts` |
| Auditoría | Acciones relevantes (login, cambios, importaciones) con actor, IP y fecha | `auth-users.spec.ts` |
| Mantenimiento de datos | Purga de sesiones vencidas (> 1 día) y de ejecuciones del cron (> 90 días) en cada corrida | `reminders.spec.ts` |

## Hallazgos de la auditoría de la Fase 9 (corregidos)

1. El secreto del cron (`x-cron-secret`) y las cookies podían quedar en los logs HTTP → ahora se redactan.
2. El inicio de sesión devolvía 429 para cuentas bloqueadas, revelando que el correo existía → respuesta única 401.
3. En producción la cookie no usaba el prefijo `__Host-` → añadido.
4. Un `.xlsx` pequeño podía declarar gigabytes al descomprimirse → rechazo previo por el directorio central.
5. Un cuerpo JSON demasiado grande devolvía 500 en lugar de 413 → corregido en el filtro global de excepciones.
6. Los límites de peticiones estaban fijos → configurables por entorno.
7. Al cerrar sesión en la interfaz, la pantalla no volvía al login hasta recargar (la caché se vaciaba mientras el contexto observaba la consulta) → corregido; cubierto por E2E.
8. La limpieza periódica usaba la fecha simulada de las pruebas y podía borrar sesiones válidas → usa siempre el reloj real.

## Dependencias (`npm audit`)

Tras revisar `npm audit --omit=dev`, quedan avisos **sin solución sin romper compatibilidad**:

- `effect` y `deepmerge-ts` (vía `prisma` → `@prisma/config`): se usan solo en la herramienta de línea de comandos de Prisma (migraciones/generación), **no** en el servidor que atiende peticiones. Se actualizarán con Prisma 7.
- `uuid` (vía `exceljs`): el aviso aplica al uso de `uuid` v3/v5/v6 con un búfer propio; ExcelJS no lo hace con datos del usuario. Sin exposición práctica. Se vigilará una versión de ExcelJS que lo actualice.
- Las alertas de `jest`/`minimatch` son solo de desarrollo (no se despliegan).

Recomendación: activar Dependabot o `npm audit` en el CI (Fase 10).

## Riesgos aceptados / responsabilidades de la operación

- La protección CSRF depende de la cabecera personalizada + `SameSite=Lax`; el frontend y la API deben servirse bajo el **mismo sitio** (proxy `/api`), como se documenta en el despliegue.
- No hay verificación en dos pasos (2FA) ni recuperación de contraseña por correo: el administrador restablece las claves.
- Las copias de seguridad de la base las ofrece el proveedor (Neon): verificar su retención en el plan gratuito.
- Antes de activar correos reales: dominio propio con SPF/DKIM y piloto con `EMAIL_ALLOWED_RECIPIENTS`.
- Rotar `CRON_SECRET` y las claves del proveedor de correo si se sospecha de exposición.

## Cómo ejecutar las pruebas de seguridad

```powershell
npm test                      # unitarias + integración + seguridad (188 pruebas)
npm run test:e2e              # navegador real (Microsoft Edge) contra un entorno temporal
```
