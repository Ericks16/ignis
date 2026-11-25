# Base de datos

PostgreSQL gestionado con Prisma. Fuente de verdad: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Las migraciones (`apps/api/prisma/migrations`) **solo agregan**; nunca borran datos.

## Modelos
| Grupo | Modelos |
|---|---|
| Acceso y auditoría | `User` (rol, bloqueo, cambio de clave obligatorio), `Session` (hash del token, vencimiento), `AuditLog`, `Setting` (configuración de recordatorios) |
| Clientes | `Client`, `ClientContact` (flag `receivesNotifications`), `Installation` |
| Sistemas | `SystemCategory`, `EquipmentType`, `InstalledSystem`, `Equipment` |
| Mantenimientos | `MaintenanceType`, `Technician`, `Maintenance`, `MaintenanceTechnician` |
| Seguimientos | `FollowUpStatus`, `FollowUpType`, `FollowUp`, `FollowUpTechnician`, `FollowUpHistory`, `ActivityType`, `Activity` |
| Recordatorios | `Notification` (clave `dedupeKey` única), `JobRun` |
| Importación | `ImportBatch` (el Excel se guarda hasta confirmar/cancelar; los registros importados llevan `importBatchId`) |

Enumeraciones: `Role` (ADMIN, OPERATIVO, TECNICO, CONSULTA), `EntityStatus`, `MaintenanceStatus`, `Priority`, `OperationalStatus`, `SystemRelation`, `NotificationKind/Status/Entity`, `JobStatus`, `ImportStatus`.

## Reglas importantes
- Los nombres de cliente se normalizan (`normalizedName`: sin tildes ni mayúsculas) para detectar duplicados.
- RUC único; las cédulas de técnicos **no** se almacenan.
- Eliminación lógica (estado inactivo) en clientes, instalaciones, sistemas y técnicos: el historial se conserva.
- Las notificaciones son únicas por (entidad, fecha de ocurrencia, destinatario) mediante `dedupeKey`: ejecutar el cron dos veces no duplica correos.
- Limpieza automática en cada corrida del cron: sesiones vencidas hace más de 1 día y `JobRun` de más de 90 días.

## Operación
```powershell
npm run prisma:migrate -w apps/api   # desarrollo: crear/aplicar una migración
npm run prisma:deploy -w apps/api    # producción: aplicar migraciones pendientes
```
Respaldos: según la retención del proveedor (Neon); ver [DEPLOYMENT.md](DEPLOYMENT.md).
