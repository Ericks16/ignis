# Estado del proyecto

Actualizado: 2026-11-24

## Completado (Fase 1 — Fundamentos)
- Monorepo (`apps/api`, `apps/web`), configuración validada con zod, `.env.example`, `.gitignore`.
- Base de datos: Prisma + migración `init` (User, Session, AuditLog, Setting). PostgreSQL local embebido o Docker.
- Autenticación: login, logout, sesión por cookie, cambio de contraseña (obligatorio con clave temporal), bloqueo por intentos fallidos.
- Usuarios y roles (ADMIN, OPERATIVO, TECNICO, CONSULTA): CRUD por Administrador; no se puede quitar al último administrador; desactivar cierra sesiones.
- Auditoría de acciones de autenticación y usuarios.
- Health: `/health` y `/health/ready` (base de datos).
- Frontend: login, layout (sidebar, header, breadcrumbs), dashboard base con datos reales, usuarios, mi cuenta, toasts, modales.
- Pruebas: 13 de integración (PostgreSQL real) que cubren auth, CSRF, RBAC, bloqueo, sesiones y validación. Verificado además a mano en el navegador: login → cambio forzado de clave → dashboard → usuarios.

## Completado (Fase 2 — Clientes e instalaciones)
- Migración `clients_installations`: Client, ClientContact, Installation (estado ACTIVE/INACTIVE; sin borrado físico).
- API: clientes (listar con búsqueda por nombre/RUC/correo/razón social, filtros por estado y ciudad, paginación; crear, editar, desactivar, reactivar, historial), contactos (crear, editar, desactivar) e instalaciones (listar con filtros, crear, editar, desactivar, reactivar).
- Reglas: detección de nombres duplicados equivalentes (sin acentos/mayúsculas) con confirmación explícita; RUC único; validación de RUC (10 o 13 dígitos), correos y longitudes; campos vacíos se guardan como nulos; no se agregan instalaciones a clientes inactivos; los contactos no reciben recordatorios salvo que se active.
- Permisos en backend: lectura para todos los roles; escritura solo Administrador y Administrador operativo.
- Historial por cliente (basado en la auditoría): quién, qué y cuándo, incluyendo contactos e instalaciones.
- Frontend: lista de clientes con búsqueda/filtro/paginación, detalle con pestañas (Datos, Contactos, Instalaciones, Historial), formularios con validación, lista global de instalaciones. Dashboard con total/activos/inactivos de clientes e instalaciones activas (datos reales).
- Pruebas: 25 de integración en total (12 nuevas de clientes/instalaciones/permisos) y verificación manual en el navegador (crear cliente → crear instalación → historial).

## Completado (Fase 3 — Catálogos, sistemas y equipos)
- Migración `catalogs_systems_equipment`: SystemCategory, EquipmentType, InstalledSystem, Equipment. Los catálogos iniciales se siembran dentro de la propia migración (idempotente): las 7 categorías oficiales de IGNIS y 28 tipos de dispositivo tomados de las columnas del Excel (con código, p. ej. DH, DT, EM, para la futura importación).
- Catálogos administrables desde la aplicación (solo Administrador): agregar, editar, desactivar/reactivar, nombres únicos sin distinguir mayúsculas; lo desactivado no se ofrece en formularios nuevos pero se conserva en registros existentes. Nada de categorías hardcodeadas en el código.
- Sistemas: una instalación puede tener varios (también de la misma categoría); marca, modelo, serie, fecha de instalación, ubicación, estado operativo, relación Instalado/Mtto (como en el Excel), responsable, último/próximo mantenimiento (fechas sin desfase de zona horaria), datos técnicos extra (JSON), desactivar/reactivar.
- Dispositivos: tipo del catálogo, cantidad entera ≥ 1, zona, estado, observaciones; se pueden quitar/restaurar.
- Permisos en backend: lectura para todos los roles; sistemas y dispositivos los escribe Administrador/Operativo; catálogos solo Administrador.
- Frontend: pestaña Sistemas en el cliente, lista global de sistemas con filtros, detalle con dispositivos, administración de catálogos, "Sistemas activos" en el dashboard. Corregido un defecto de la interfaz detectado en la prueba manual: los formularios largos en modal no se podían desplazar y el botón Guardar quedaba fuera de pantalla.
- Pruebas: 32 de integración en total (7 nuevas) y verificación manual en el navegador (crear sistema desde el cliente → agregar dispositivo → catálogos).

## Completado (Fase 4 — Técnicos, mantenimientos y calendario)
- Migración `technicians_maintenances`: Technician, MaintenanceType (catálogo configurable con 5 tipos iniciales sembrados), Maintenance, MaintenanceTechnician.
- Técnicos: alta/edición/desactivación, búsqueda, iniciales (para mapear las agendas del Excel), vínculo opcional y único con un usuario. Sin cédulas.
- Mantenimientos: programar (con técnicos asignados), editar, iniciar, registrar trabajo realizado (fecha de ejecución, observaciones, recomendaciones, materiales, resultado), marcar pendiente/programado, cancelar (motivo obligatorio), reprogramar (el original queda REPROGRAMADO y se crea uno nuevo enlazado, con motivo) e historial por mantenimiento. Estados: PROGRAMADO, PENDIENTE, EN_PROCESO, REALIZADO, CANCELADO, REPROGRAMADO con transiciones validadas; REALIZADO/CANCELADO/REPROGRAMADO son terminales.
- Próximo mantenimiento: lo define el usuario al registrar el trabajo; nunca se calcula una periodicidad. Si no lo define y la fecha anterior ya quedó cumplida, se limpia (evita falsos vencidos); si la anterior sigue en el futuro, se conserva. Al completar se actualiza el último mantenimiento del sistema.
- Vencido = abierto con fecha anterior a hoy en America/Guayaquil (hoy no es vencido); próximos = siguientes 30 días.
- Permisos en backend: Administrador/Operativo programan, asignan, reprograman y cancelan; el Técnico ve solo lo asignado a su usuario vinculado y solo puede iniciar, registrar trabajo y observaciones en eso; Consulta solo lee.
- Calendario (FullCalendar): vistas Mes, Semana, Día y Lista; filtros por cliente, técnico, estado, tipo de mantenimiento y categoría de sistema; clic abre el detalle; vencidos resaltados. Es de solo lectura: las fechas se cambian reprogramando con motivo (no hay arrastrar y soltar, para no alterar fechas sin guardar en el backend).
- Dashboard con datos reales: programados, próximos, vencidos, mantenimientos por mes (realizados/pendientes) y próximas visitas, respetando el alcance del rol.
- Pruebas: 51 de integración y unitarias en total (19 nuevas: reglas de estado, fechas en Guayaquil, permisos, flujo completo, calendario, dashboard). Verificación manual en el navegador: crear técnico → programar desde el sistema → ver en el calendario → registrar como realizado. La prueba manual detectó y se corrigió un bucle infinito en la página del calendario.

## Completado (Fase 5 — Seguimientos y actividades)
- Migración `followups_activities`: FollowUpStatus, FollowUpType, ActivityType (catálogos sembrados), FollowUp, FollowUpTechnician, FollowUpHistory, Activity.
- Estados de seguimiento administrables de forma controlada: los 7 iniciales son de sistema (no se renombran ni desactivan; FINALIZADO y CANCELADO son terminales); el Administrador puede agregar estados propios (abiertos o finales; la condición de final no se cambia después) y ordenarlos.
- Seguimientos: vinculados a cliente (obligatorio), instalación, sistema y mantenimiento (se valida que pertenezcan al mismo cliente y sean coherentes entre sí), tipo, prioridad, responsable, técnicos asignados, fecha de inicio y fecha objetivo, próxima acción, observaciones e indicador de recordatorios. Filtros por estado, situación (abiertos, vencidos, vencen en 30 días, cerrados), prioridad, tipo y texto.
- Cambio de estado con historial (quién, estado anterior, estado nuevo, fecha y hora, observaciones). Cerrar (FINALIZADO/CANCELADO) registra fecha y usuario, escribe el historial y la auditoría, y deja una actividad automática; CANCELADO exige motivo; un cerrado no se edita y solo se reabre (con motivo) hacia un estado abierto, nunca de terminal a terminal. Un cerrado nunca figura como vencido.
- Actividades: historial cronológico (más reciente primero) vinculado a cliente, instalación, seguimiento y/o mantenimiento, con tipo del catálogo, fecha/hora (no futura) y autor; filtros por texto, tipo, usuario y rango de fechas (en hora de Guayaquil). No se borran; edita el autor o Administrador/Operativo.
- Permisos en backend: Administrador/Operativo gestionan seguimientos; el Técnico ve solo los suyos (responsable o asignado) y registra/edita sus actividades en ellos y en sus mantenimientos; Consulta solo lee; los estados y catálogos los administra solo el Administrador.
- Calendario combinado: mantenimientos (fecha programada) y seguimientos (fecha objetivo), con filtro por tipo de evento; los filtros propios de mantenimientos excluyen a los seguimientos.
- Dashboard con datos reales: seguimientos pendientes, en proceso, finalizados, vencidos, abiertos y por vencer, resumen por estado, y clientes que requieren atención (con mantenimientos o seguimientos vencidos).
- Frontend: lista y detalle de seguimientos (con historial y actividades), pestañas Seguimientos y Actividades en el cliente, actividades en el mantenimiento, página global de Actividades, administración de estados y de tipos en Catálogos.
- Pruebas: 66 en total (15 nuevas: reglas de estado, permisos, historial, cierre y reapertura, alcance del Técnico, actividades, calendario, dashboard). Verificación manual en el navegador: crear un seguimiento desde el cliente → cerrarlo como FINALIZADO → historial y actividad automática.

## Completado (Fase 6 — Recordatorios por correo)
- Migración `notifications_jobs`: Notification (con `dedupeKey` única) y JobRun. Detalle completo en [EMAIL_REMINDERS.md](EMAIL_REMINDERS.md).
- Proveedor de correo intercambiable (`EmailProvider`): consola/prueba, Resend y Brevo. **En modo `test` nunca se envía nada real**; `live` exige proveedor y clave, y admite lista de destinatarios permitidos para el piloto.
- Motor: primer aviso 1 mes calendario antes (31 mar → 28 feb), luego cada 7 días también tras vencer; solo el último aviso debido si hubo atraso; seguimientos y mantenimientos; destinatarios = responsable + correos internos (+ contactos del cliente solo con permiso explícito); plantilla HTML responsive + texto plano con enlace al sistema.
- Fiabilidad: idempotencia por clave única, reclamo con `SKIP LOCKED`, ejecuciones simultáneas sin duplicados, reintentos con espera y tope, rechazos permanentes sin reintento, recuperación de envíos colgados, re-validación justo antes de enviar.
- Detención: finalizar/cancelar un seguimiento cancela sus pendientes **en la misma transacción** (sin esperar al cron); también al realizar/cancelar/reprogramar un mantenimiento o cambiar fecha/responsable/recordatorios.
- Cron externo: `POST /api/internal/cron/reminders` con `x-cron-secret` (sin sesión ni CSRF). Registro de ejecuciones en `JobRun`; `/health/ready` informa correo y scheduler sin exponer secretos.
- Pantallas: Notificaciones (historial con filtros y reintento manual), Recordatorios (política, correos internos, estado, «Ejecutar ahora» y registro de ejecuciones), panel de recordatorios en seguimientos y mantenimientos.
- Pruebas: 95 en total (29 nuevas). Verificado también en vivo: dos llamadas seguidas al cron generaron y «enviaron» (modo prueba) 2 correos la primera vez y 0 la segunda.
- Defectos hallados y corregidos durante la fase: (1) las comparaciones de fecha en SQL crudo dependían de la zona horaria de la sesión de la base de datos; ahora se convierten explícitamente a UTC; (2) con target ES2022 los DTO traen campos `undefined` que borraban valores al fusionar la configuración y ensuciaban el registro de auditoría; se añadieron `definedOnly`/`definedKeys`.

## Completado (Fase 7 — Importación de Excel)
- Detalle completo en [EXCEL_IMPORT.md](EXCEL_IMPORT.md). Migraciones `import_batches` e `import_importing` (ImportBatch + `importBatchId` en clientes, instalaciones, sistemas, mantenimientos y seguimientos).
- Asistente web (solo Administrador): subir → hoja/encabezados → mapeo de columnas (sugerido automáticamente) → reglas → vista previa con errores y advertencias → confirmación explícita → resultado y reporte `.xlsx` descargable. Plantilla oficial descargable.
- Garantías: el original no se toca, nada se guarda sin vista previa + confirmación, solo agrega (no borra ni modifica), todo-o-nada en una transacción, no se importa dos veces (toma exclusiva) y re-importar el mismo archivo no duplica.
- Validaciones: fechas, RUC, correos, cantidades, duplicados (exactos y parecidos), cliente repetido en el archivo, sistemas existentes, sección «CLIENTES PERDIDOS» (inactivos), encabezados repetidos. Política configurable para los «próximos mantenimientos» ya vencidos (por defecto: solo como dato, sin recordatorios).
- Verificado con el **Excel real** en la interfaz (sin guardar): 137 filas importables, 0 errores, 98 clientes, 123 instalaciones, 133 sistemas, 391 tipos de dispositivo, 135 mantenimientos históricos, 26 programados, 20 seguimientos, 42 contactos. El lote de prueba se canceló: no se importó nada del archivo real.
- Pruebas: 126 en total (32 nuevas).
- Defectos hallados y corregidos: (1) la base embebida de desarrollo en Windows se creaba en WIN1252 y rechazaba caracteres reales del archivo; ahora las bases embebidas (desarrollo y pruebas) se crean en **UTF-8**, igual que producción — **la base de desarrollo se recreó (se perdieron los datos de prueba locales; el administrador se volvió a sembrar con la contraseña de `.env` y se le pidió cambiarla)**; (2) el servidor de subida entregaba los nombres de archivo con acentos mal codificados; ahora se decodifican como UTF-8.

## Completado (Fase 8 — Reportes y dashboard completo)
- Detalle en [REPORTES.md](REPORTES.md). 13 reportes filtrables (clientes, sistemas, sistemas por categoría, mantenimientos realizados / pendientes / vencidos / próximos / por técnico / por cliente, seguimientos pendientes / finalizados / vencidos, actividades por técnico) con filtros por fecha, cliente, técnico, categoría, tipo, estado, prioridad, responsable, ciudad y búsqueda.
- Exportación a **Excel, CSV y PDF** con los mismos filtros y permisos; Excel con totales y hoja de filtros, CSV UTF-8 con BOM, PDF horizontal con encabezado repetido y paginación; fórmulas neutralizadas; auditoría de cada exportación.
- Permisos reales en backend: alcance de datos compartido (`common/scopes.ts`) entre pantallas, reportes y exportaciones; el Técnico solo ve lo suyo y un subconjunto de reportes.
- Dashboard: tarjetas clicables hacia listas filtradas, filtro de año, tabla de clientes que requieren atención, sistemas por categoría. Las listas de Mantenimientos, Seguimientos y Sistemas aceptan filtros iniciales por URL.
- Verificado en la aplicación en ejecución (datos de demostración locales): dashboard, reporte «por técnico» con totales y exportación real a XLSX, CSV y PDF (se comprobó el texto del PDF, incluidos acentos y el pie de página).
- Pruebas: 143 en total (17 nuevas). Las suites ahora son independientes del orden de ejecución (la de reportes parte de una base de negocio vacía; el test de calendario ya no depende de los datos de otras suites).
- Nota de la base de desarrollo: contiene datos de **demostración** que creé para probar (3 clientes, 1 técnico, mantenimientos y seguimientos); se pueden borrar recreando la base (`apps/api/.pgdata`).

## Completado (Fase 9 — Pruebas y seguridad)
- Auditoría de seguridad con 8 hallazgos corregidos (detalle en [SECURITY.md](SECURITY.md)): secretos en logs, enumeración de cuentas, cookie `__Host-` en producción, «bomba zip» en .xlsx, 413 en vez de 500, límites configurables, logout que no volvía al login, limpieza que usaba fecha simulada.
- Suite de seguridad (`apps/api/test/security.spec.ts`, 27 pruebas): matriz de permisos por rol sobre **todas** las rutas con introspección (una ruta nueva sin clasificar falla), 401 sin sesión, escalada de privilegios, cookies/sesiones, CORS, Helmet, CSRF, rate limiting, modo producción, SQLi/XSS, asignación masiva, prototype pollution, zip bomb, 500 genérico y redacción de logs.
- E2E con Playwright (`apps/e2e`, Microsoft Edge, entorno temporal con PostgreSQL embebido + API + Vite en puertos 3100/5174, correo en modo prueba): login/logout, cambio de clave obligatorio, cookie HttpOnly, clientes (crear, buscar, duplicado), XSS, permisos de consulta/técnico/administrador en UI y API, CSRF, navegación de módulos y descarga de Excel. 12 pruebas, todas pasan.
- Total: **170 pruebas de API (todas pasan) + 12 E2E**. Cobertura de la API: 94 % sentencias, 83 % ramas, 97 % funciones, 97 % líneas (`npm run test:cov`).
- `npm audit`: sin solución sin cambios incompatibles; los avisos de producción están en herramientas de Prisma CLI y `uuid` de ExcelJS (sin exposición práctica; ver SECURITY.md).
- Sin pruebas unitarias del frontend (la cobertura de la interfaz es vía E2E).

## Completado (Fase 10 — Despliegue, CI/CD y documentación final)
- Verificado localmente: `npm run build` (API + web) y arranque de `dist/main.js` con `NODE_ENV=production` sobre una base temporal: migraciones aplicadas, `/health` y `/health/ready` correctos, 401 sin sesión, Swagger desactivado (404) y endpoint del cron responde 200 con el secreto.
- Configuración lista, **sin desplegar** (requiere cuentas suyas): `render.yaml` (API, migra al arrancar), `apps/web/vercel.json` (proxy `/api`, SPA, cabeceras y CSP; falta poner el host real de Render), `.github/workflows/ci.yml` (tipos, pruebas, build, auditoría informativa, E2E con Chromium) y `reminders-cron.yml` (respaldo del cron).
- Documentación final: [DEPLOYMENT.md](DEPLOYMENT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [USER_GUIDE.md](USER_GUIDE.md).
- No verificado: el workflow de CI nunca se ejecutó (no hay repositorio GitHub); el E2E en Linux/Chromium tampoco; los límites vigentes de las capas gratuitas deben confirmarse al crear las cuentas (una búsqueda mostró que Render cambió su ancho de banda incluido y que su Postgres gratuito caduca, por eso se usa Neon; Vercel Hobby es solo uso no comercial).
- Sin dominio propio aún: necesario para SPF/DKIM y correos reales.

## Completado (Fase 11 — Cierre de la rúbrica del primer bimestre)
- **Registro con aprobación**: `POST /api/auth/register` crea una cuenta inactiva de solo consulta; el administrador la aprueba en *Usuarios* («Solicitud pendiente» / «Aprobar acceso»).
- **Recuperación de contraseña**: `/olvide` → correo con enlace de un solo uso (60 min, solo se guarda el hash, cierra todas las sesiones) → `/restablecer`. Requiere correo en modo *live* para entregarse de verdad; en modo prueba solo se registra y el administrador puede restablecer la clave.
- **Seguimiento sin depender del correo del cliente**: los recordatorios salen al responsable y a los correos internos; además la **campana de alertas** (`GET /api/alerts`) muestra todo lo vencido/por vencer del alcance del usuario, y avisa al personal de los seguimientos sin destinatario de correo.
- **Chat en tiempo real con Socket.IO** (WebSocket): sala general y una por seguimiento/mantenimiento con permiso por alcance; ticket de un solo uso, mensajes guardados, límites de longitud y velocidad. En producción el navegador se conecta directo a Render (`VITE_WS_URL`), porque Vercel no reenvía WebSockets.
- Documentos: [REQUISITOS.md](REQUISITOS.md) (45 RF + RNF + historias), [ARCHITECTURE.md](ARCHITECTURE.md) con diagramas Mermaid, [PROYECTO_IB.md](PROYECTO_IB.md) (introducción, objetivos, cronograma, mapa de la rúbrica y guion de demo).
- Pruebas: **188 de API** (nuevas: `access-recovery`, `chat`, matriz de permisos ampliada) + **16 E2E** (chat entre dos navegadores, registro y aprobación, recuperación, campana). Todas pasan en local.
- Pendiente de ustedes: repositorio **público** con commits de todos los integrantes, declaración de uso de IA, y activar un proveedor de correo (Resend/Brevo) si quieren que el correo de recuperación y los recordatorios se envíen de verdad.

## Pendiente
- Recuperación de contraseña por correo → Fase 6 (requiere EmailProvider).
- Pestañas de mantenimientos, seguimientos y actividades en el detalle del cliente → Fases 4 y 5.
- Los técnicos solo ven trabajos asignados cuando exista la asignación (Fase 4); hoy leen todos los clientes e instalaciones.
- El campo "Último/Próximo mantenimiento" del sistema es manual hasta la Fase 4, cuando se actualizará desde los mantenimientos. El responsable del sistema es un usuario; en la Fase 4 se vinculará con el módulo de técnicos.
- **Evidencias y archivos adjuntos de mantenimientos**: no implementados aún. Requieren elegir el almacenamiento (Supabase Storage o Cloudflare R2), validar MIME y tamaño; se hará junto con el despliegue (Fase 10) o antes si lo prioriza.
- Asignar técnicos a instalaciones, seguimientos, actividades y visitas: mantenimientos ya está; seguimientos y actividades llegan en la Fase 5; asignación a instalaciones queda pendiente de decisión.
- Los dispositivos no se asocian aún a un mantenimiento (solo vía el sistema del mantenimiento).
- **Antes de activar envíos reales**: dominio propio con SPF/DKIM verificado en el proveedor, cuenta Resend/Brevo, `EMAIL_MODE=live`, piloto con `EMAIL_ALLOWED_RECIPIENTS`, y configurar el cron externo (Fase 10). Sin cron externo, los avisos solo salen con «Ejecutar ahora».
- **Importación real del Excel de IGNIS: pendiente de su decisión.** Antes de confirmar, decidir la política de los próximos mantenimientos vencidos y revisar la categoría de «EXTINTORES» y «EVACUACION» (no están en el catálogo oficial). Hoy no hay botón para revertir un lote (los registros llevan `importBatchId`).
- Importación de las hojas de agenda diaria / cronogramas por cliente / técnicos (iniciales): no incluida; requeriría confirmar la tabla iniciales → técnico.
- Recuperación de contraseña por correo: pendiente (puede reutilizar el `EmailProvider`).
- Logo en imagen en los correos: hoy es texto estilizado; requiere alojar el archivo (despliegue).
- Dashboard: "Actividades pendientes" no aplica tal cual (las actividades son registros históricos, no tareas); se cubre con los seguimientos abiertos y su próxima acción. Archivos adjuntos de actividades: pendientes junto con el almacenamiento.
- La asignación de técnicos a visitas e instalaciones sigue pendiente de decisión.
- La fecha de "último mantenimiento" del Excel (mes completo) se importará como aproximada en la Fase 7.
- Fases 5–10 según [FASE0_PLAN.md](FASE0_PLAN.md).
- Ejecutar el despliegue real siguiendo DEPLOYMENT.md y decidir la importación del Excel real.
- Estado de correo y scheduler en `/health/ready` → Fase 6.

## Problemas conocidos / decisiones
- El PostgreSQL embebido de desarrollo es una versión beta de PostgreSQL; solo para desarrollo y pruebas. Producción usará Neon (PostgreSQL estable).
- Decisiones abiertas de la Fase 0 sin respuesta; se asumen valores por defecto hasta que se indique lo contrario: dominio propio (pendiente), cédulas de técnicos **no** se almacenan, mantenimientos vencidos se importarán como histórico sin recordatorios, "un mes antes" = 1 mes calendario, viáticos fuera de alcance.
- `docker compose` no se probó (Docker Desktop estaba detenido); el flujo verificado es el PostgreSQL embebido.
- Los dashboards de clientes/mantenimientos/seguimientos se añaden con sus módulos (hoy solo hay indicadores de usuarios; no hay datos ficticios).
