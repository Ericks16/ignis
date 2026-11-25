# Requerimientos funcionales e historias de usuario

Sistema: **IGNIS Maintenance Manager** (gestión de mantenimientos y seguimientos de instalaciones contra incendios).
Cada requerimiento indica dónde se verifica (`test/*.spec.ts` = pruebas de API, `E2E` = pruebas de navegador).

## Roles
| Rol | Resumen de alcance |
|---|---|
| Administrador | Todo, incluida la administración de usuarios, catálogos, importación y configuración |
| Administrador operativo | Opera clientes, sistemas, mantenimientos, seguimientos y notificaciones |
| Técnico | Ve y actualiza solo lo que tiene asignado |
| Consulta | Solo lectura |

## Bloque A — Acceso y seguridad
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-01 | Iniciar sesión con correo y contraseña; la contraseña se guarda cifrada (bcrypt, costo 12) | auth-users, security |
| RF-02 | Sesión por cookie `HttpOnly`/`SameSite`; el token se guarda como hash; cerrar sesión la revoca | security, E2E |
| RF-03 | Bloqueo temporal tras 5 intentos fallidos; mensaje de error único (no revela si el correo existe) | auth-users, security |
| RF-04 | Cambio de contraseña voluntario y obligatorio al primer ingreso con clave temporal | auth-users, E2E |
| RF-05 | **Registro (solicitud de acceso)**: la persona se registra y su cuenta queda **inactiva** con rol de solo consulta hasta que un administrador la apruebe | access-recovery, E2E |
| RF-06 | **Recuperación de contraseña**: «¿Olvidó su contraseña?» envía por correo un enlace de un solo uso que vence en 60 min; al usarlo se cierran todas las sesiones | access-recovery, E2E |
| RF-07 | El administrador crea, edita, activa/desactiva usuarios, cambia su rol y restablece su clave | auth-users, E2E |
| RF-08 | Permisos por rol aplicados en el servidor en **todas** las rutas (no solo ocultando botones) | security (matriz de rutas) |
| RF-09 | Protección contra CSRF, límite de peticiones, cabeceras de seguridad y CORS restringido | security |
| RF-10 | Auditoría de acciones relevantes (inicio de sesión, cambios, importaciones, recuperación) | auth-users |

## Bloque B — Clientes e instalaciones
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-11 | CRUD de clientes (nombre comercial, razón social, RUC, ciudad, contacto) con desactivación lógica | clients, E2E |
| RF-12 | Detección de duplicados por nombre normalizado (sin tildes ni mayúsculas) y por RUC | clients, E2E |
| RF-13 | Contactos del cliente, con indicador de si reciben notificaciones | clients |
| RF-14 | CRUD de instalaciones por cliente | clients |
| RF-15 | Historial consolidado del cliente (mantenimientos, seguimientos, actividades) | clients |

## Bloque C — Sistemas y catálogos
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-16 | CRUD de sistemas instalados (categoría, marca, modelo, estado operativo, responsable) | systems |
| RF-17 | CRUD de equipos/dispositivos por sistema (tipo y cantidad) | systems |
| RF-18 | Catálogos administrables: categorías de sistema, tipos de equipo, tipos de mantenimiento, de seguimiento y de actividad, estados de seguimiento | systems, follow-ups |

## Bloque D — Técnicos, mantenimientos y calendario
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-19 | CRUD de técnicos, vinculables a un usuario | maintenance |
| RF-20 | Programar mantenimientos con técnicos asignados; ciclo PROGRAMADO → PENDIENTE → EN PROCESO → REALIZADO / CANCELADO | maintenance, maintenance-rules |
| RF-21 | Al registrar un mantenimiento como realizado se guardan resultado, materiales y la **próxima fecha elegida por el usuario** (nunca calculada automáticamente) | maintenance-rules |
| RF-22 | Reprogramar y cancelar con historial | maintenance |
| RF-23 | Calendario mensual/semanal de visitas | maintenance, E2E |
| RF-24 | El técnico solo ve y actualiza los mantenimientos asignados a él | maintenance, security |

## Bloque E — Seguimientos y actividades
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-25 | CRUD de seguimientos (tipo, prioridad, responsable, fecha objetivo, próxima acción) con historial de cambios de estado | follow-ups, follow-ups-rules |
| RF-26 | Finalizar o cancelar cierra el seguimiento y detiene sus recordatorios; se puede reabrir | follow-ups-rules, reminders |
| RF-27 | Registro de actividades (visitas, llamadas, cotizaciones) ligadas a seguimientos o mantenimientos | follow-ups |

## Bloque F — Recordatorios y alertas
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-28 | Recordatorio por correo **un mes antes** de la fecha objetivo, luego **cada semana**, también cuando ya venció | reminders, reminders-policy |
| RF-29 | Se detiene al finalizar/cancelar; nunca envía el mismo recordatorio dos veces (idempotente) | reminders |
| RF-30 | Reintentos con espera creciente; un fallo no detiene el resto; registro de cada envío | reminders |
| RF-31 | **Modo prueba**: sin configuración explícita nunca se envía un correo real | reminders, security |
| RF-32 | Destinatarios: responsable + correos internos configurados; contactos del cliente **solo con permiso explícito** | reminders |
| RF-33 | **El seguimiento no depende del correo del cliente**: si el cliente no tiene correo, el recordatorio sale al personal interno; y siempre aparece en la **campana de alertas** dentro del sistema, aunque no haya nadie a quien enviar correo (en ese caso se avisa al personal) | access-recovery, E2E |
| RF-34 | Campana de alertas: vencidos y próximos 30 días según el alcance del usuario | access-recovery, E2E |
| RF-35 | Un servicio externo dispara el envío a diario mediante un endpoint protegido por secreto | reminders |

## Bloque G — Chat en tiempo real (WebSocket)
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-36 | Chat general para todo el personal | chat, E2E |
| RF-37 | Chat por seguimiento y por mantenimiento, accesible solo para quien puede ver ese registro | chat |
| RF-38 | Mensajes en tiempo real con **Socket.IO (WebSocket)**, guardados en la base de datos y con historial | chat, E2E |
| RF-39 | Conexión autenticada con ticket de un solo uso; validación, límite de longitud (1000) y de velocidad de envío; el HTML se muestra como texto | chat |

## Bloque H — Importación desde Excel
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-40 | Subir el .xlsx real de cartera, elegir hoja y mapear columnas | imports |
| RF-41 | **Vista previa obligatoria** con errores, advertencias y duplicados antes de guardar | import-planner, imports |
| RF-42 | Confirmación todo-o-nada que solo agrega datos y deja trazabilidad por lote | imports |
| RF-43 | Archivos maliciosos rechazados (firma, tamaño, «bomba zip») | imports, security |

## Bloque I — Reportes y dashboard
| ID | Requerimiento | Verificación |
|---|---|---|
| RF-44 | Dashboard con indicadores reales (programados, próximos, vencidos, seguimientos, clientes que requieren atención) | reports, E2E |
| RF-45 | 13 reportes con filtros, exportables a Excel, CSV y PDF, respetando el alcance del rol | reports, E2E |

## Requerimientos no funcionales
| ID | Requerimiento |
|---|---|
| RNF-01 | Desplegado en la nube (Vercel + Render + Neon), sin depender de la computadora de nadie |
| RNF-02 | Fechas de negocio en zona horaria `America/Guayaquil` |
| RNF-03 | Interfaz responsive con la identidad visual de IGNIS |
| RNF-04 | Pruebas automáticas (API y navegador) ejecutadas en integración continua |

## Historias de usuario (muestra)
| Como… | Quiero… | Para… |
|---|---|---|
| Administrador | recibir cada semana un correo de los seguimientos que vencen | no olvidar contactar a un cliente |
| Administrador operativo | ver una campana con lo vencido aunque el cliente no tenga correo | seguir su caso sin depender del correo |
| Técnico | ver solo mis mantenimientos y conversar con el equipo sobre cada uno | trabajar sin ruido y resolver dudas al instante |
| Persona nueva | solicitar acceso y que un administrador lo apruebe | no depender de que alguien me cree la cuenta |
| Usuario | recuperar mi contraseña por correo | volver a entrar sin llamar al administrador |
| Gerencia | importar el Excel actual con vista previa | migrar sin perder ni duplicar datos |
