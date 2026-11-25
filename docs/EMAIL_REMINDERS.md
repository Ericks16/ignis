> Nota: el seguimiento **no depende del correo del cliente**; ver el apartado «Sin correo del cliente» al final.

# Recordatorios por correo

Estado: implementado y probado (Fase 6). Código en `apps/api/src/reminders` y `apps/api/src/email`.

## Reglas de negocio

| Regla | Valor por defecto | ¿Configurable? |
|---|---|---|
| Primer aviso | **1 mes calendario** antes de la fecha objetivo | Sí (1–12 meses) |
| Avisos siguientes | cada **7 días** desde el primer aviso | Sí (1–60 días) |
| Después de la fecha objetivo | siguen cada 7 días, indicando **VENCIDO** | Mismo intervalo |
| Hora de envío | 08:00 (America/Guayaquil) | Sí |
| Detención | al pasar a **FINALIZADO o CANCELADO** (o cualquier estado final propio) | No |

- **Mes anterior:** si el mes anterior no tiene ese día, se usa su último día (31 mar → 28 feb; 29 feb en bisiesto).
- **Ejemplo (objetivo 24 dic):** 24 nov, 1, 8, 15 y 22 dic; luego 29 dic, 5 ene… marcados como vencidos.
- **Se evalúan:** seguimientos (fecha objetivo) y mantenimientos abiertos (fecha programada). Un seguimiento sin fecha objetivo, con recordatorios desactivados, de un cliente inactivo, o ya cerrado, no genera avisos.
- Si el sistema estuvo detenido (p. ej. el servidor gratuito dormido), **solo se envía el último aviso que correspondía**, no una ráfaga.

## Destinatarios

Nunca se escribe a todos. Recibe, sin duplicados:
1. El **responsable** del seguimiento (o del sistema, en mantenimientos), si está activo.
2. Los **correos internos** configurados (pantalla *Recordatorios*).
3. Opcionalmente, los contactos del cliente marcados «recibe recordatorios», **solo si** el interruptor global está encendido (apagado por defecto).

Los técnicos asignados no reciben correo automático por estar asignados.

## Cómo evita duplicados y pérdidas

- Cada envío es una fila en `Notification` con `dedupeKey` **única** (`tipo:id:correo:fecha-del-aviso`). Insertar con `skipDuplicates` hace imposible crear dos veces el mismo aviso, aunque corran varios procesos a la vez, se reinicie el servidor o el cron se ejecute repetido.
- El envío se reclama con `UPDATE … FOR UPDATE SKIP LOCKED`: una notificación la toma una sola ejecución.
- **Idempotencia hacia el proveedor:** se envía el id de la notificación como `Idempotency-Key` (Resend).
- **Reintentos:** si falla, queda `FAILED` con el error y `nextAttemptAt` (espera 5, 30, 120 y 720 min; máx. 5 intentos, configurable). Un rechazo permanente (4xx, p. ej. dirección inválida) no se reintenta. Un fallo no detiene los demás envíos. Tras agotar intentos, un usuario puede pulsar **Reintentar**.
- **Envíos "en vuelo"** que quedaron colgados (caída del servidor) se reprograman a los 10 minutos.
- **Aviso más reciente reemplaza** a los anteriores que no llegaron a enviarse.

## Detención inmediata al finalizar

Al finalizar o cancelar un seguimiento, **en la misma transacción** se cancelan sus notificaciones pendientes, sin esperar al cron; las ya enviadas se conservan como historial. Además, justo antes de enviar cada correo se vuelve a comprobar que el elemento siga abierto (cubre la carrera entre el cierre y un envío ya reclamado). Cambiar la fecha objetivo, el responsable o desactivar los recordatorios cancela lo pendiente y el calendario se recalcula. En mantenimientos: realizar, cancelar, reprogramar o cambiar la fecha hacen lo mismo.

Limitación conocida: si el cierre ocurre en los milisegundos en que un envío ya pasó la re-validación y está en el proveedor, ese único correo saldrá.

## Configuración (variables de entorno del servidor)

| Variable | Descripción |
|---|---|
| `EMAIL_MODE` | `test` (por defecto): **nunca envía correos reales**, solo registra. `live`: envía de verdad. |
| `EMAIL_PROVIDER` | `console`, `resend` o `brevo`. Con `live` debe ser `resend` o `brevo`. |
| `EMAIL_FROM` | Remitente, p. ej. `IGNIS <avisos@tudominio.com>` (el dominio debe estar verificado en el proveedor). |
| `RESEND_API_KEY` / `BREVO_API_KEY` | Clave del proveedor elegido. Nunca se muestra ni se registra. |
| `EMAIL_ALLOWED_RECIPIENTS` | Opcional. En `live`, solo estos destinatarios reciben correo (útil en el piloto). |
| `APP_URL` | URL pública del frontend, para los enlaces del correo. |
| `CRON_SECRET` | Secreto (≥ 24 caracteres) del endpoint del cron. Sin él, el endpoint queda deshabilitado. |

La política (meses, intervalo, hora, reintentos, correos internos, contactos del cliente) se edita en la pantalla **Recordatorios** (solo el Administrador; el Operativo la ve).

## El cron externo

El servidor gratuito puede dormirse, por lo que **no se usa un temporizador interno**. Un servicio externo llama una vez al día (basta con una; no hace daño repetir):

```
POST https://<tu-backend>/api/internal/cron/reminders
Cabecera: x-cron-secret: <CRON_SECRET>
```

- Recomendado: **cron-job.org** (gratuito) a las 08:05 hora de Guayaquil. La petición también despierta al backend.
- Respaldo opcional: un workflow de GitHub Actions programado (puede retrasarse horas, por eso no es el principal).
- Cada ejecución queda en `JobRun` (pantalla *Recordatorios*); `/health/ready` avisa si el cron nunca corrió o lleva más de 26 horas sin hacerlo.

## Cómo probarlo sin enviar correos reales

1. Deje `EMAIL_MODE=test` (por defecto). Los correos se registran como enviados «en modo prueba» y no salen.
2. Cree un seguimiento con fecha objetivo dentro del próximo mes y con responsable.
3. Pulse **Ejecutar ahora** en *Recordatorios* (o llame al endpoint del cron) y revise *Notificaciones*.
4. Para ver el correo real: cambie a `live` con `EMAIL_ALLOWED_RECIPIENTS=su-correo@…`.

## Pruebas automatizadas

`npm test` cubre: cálculo de fechas (incluye 31 mar, bisiestos y el ejemplo del 24 dic), plantilla (campos, enlace, HTML escapado, versión de texto), selección del proveedor, flujo completo con viaje en el tiempo, ejecuciones simultáneas, idempotencia, errores y reintentos, rechazo permanente, detención inmediata al finalizar/cancelar, cambios de fecha, destinatarios, mantenimientos, endpoint del cron, permisos y `/health/ready`.

## Pendiente / notas

- El logo en el correo es el texto «IGNIS» con estilos; un logo en imagen requiere alojar el archivo en una URL pública (se puede añadir en el despliegue).
- Recuperación de contraseña por correo: pendiente de implementar sobre este mismo proveedor.
- Antes de pasar a `live`: dominio propio con SPF/DKIM verificado en el proveedor y piloto con `EMAIL_ALLOWED_RECIPIENTS`.


## Sin correo del cliente
Que un cliente no tenga correo **no impide el seguimiento**:
- Los recordatorios salen al **responsable** y a los **correos internos** configurados en *Recordatorios*; los contactos del cliente solo reciben correos si se habilita expresamente.
- Independientemente del correo, todo seguimiento o mantenimiento vencido o próximo a vencer aparece en la **campana de alertas** del sistema (`GET /api/alerts`), con el alcance del usuario.
- Si un seguimiento no tiene a quién avisar por correo (sin responsable activo, sin correos internos y sin contactos habilitados), el sistema lo cuenta como «sin destinatario» y avisa al personal en la campana para que asigne un responsable; el seguimiento sigue visible y gestionable.
