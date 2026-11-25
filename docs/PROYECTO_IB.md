# Proyecto Primer Bimestre — IGNIS Maintenance Manager

## 1. Introducción y planteamiento del problema
IGNIS Fire Protection instala y mantiene sistemas contra incendios (detección y alarma, extintores, bombas, gabinetes, agente limpio) para decenas de clientes. Hoy el control vive en **hojas de Excel** (cartera de clientes, cronogramas anuales, agendas diarias): los mantenimientos vencidos no se detectan a tiempo, los seguimientos comerciales dependen de la memoria de cada persona, no hay avisos automáticos y la información está duplicada y dispersa. Un mantenimiento omitido es un riesgo para las personas y para el cliente. El análisis detallado está en [ANALISIS_PROCESO_ACTUAL.md](ANALISIS_PROCESO_ACTUAL.md).

**Solución:** una aplicación web que centraliza clientes, instalaciones, sistemas y mantenimientos, hace seguimiento de cada oportunidad o pendiente, avisa de lo que vence (por correo y dentro del sistema) y permite al equipo coordinarse en un chat en tiempo real.

## 2. Objetivos
**General.** Desarrollar y desplegar una aplicación web que gestione el ciclo de mantenimiento y seguimiento de las instalaciones de IGNIS, reduzca los vencimientos no atendidos y centralice la información operativa.

**Específicos**
1. Centralizar clientes, instalaciones, sistemas y mantenimientos con permisos por rol (administrador, operativo, técnico, consulta).
2. Registrar y dar seguimiento a cada pendiente, con recordatorios automáticos (un mes antes, luego semanales y al vencer) y alertas dentro del sistema que no dependan del correo.
3. Permitir la coordinación del equipo mediante un chat en tiempo real con WebSockets, general y por caso.
4. Migrar de forma segura los datos del Excel actual con vista previa y confirmación.
5. Garantizar seguridad (autenticación cifrada, recuperación de contraseña, control de acceso) y calidad mediante pruebas automáticas.
6. Desplegar el sistema en la nube con integración continua.

## 3. Cronograma de actividades
| Fase | Actividad | Resultado |
|---|---|---|
| 0 | Análisis del proceso, requerimientos y plan | `docs/ANALISIS_PROCESO_ACTUAL.md`, `FASE0_PLAN.md` |
| 1 | Fundamentos: autenticación, usuarios, roles, auditoría | Login seguro |
| 2 | Clientes e instalaciones | CRUD con detección de duplicados |
| 3 | Catálogos, sistemas y equipos | Inventario de sistemas |
| 4 | Técnicos, mantenimientos y calendario | Ciclo de mantenimiento |
| 5 | Seguimientos y actividades | Seguimiento de pendientes |
| 6 | Recordatorios por correo | Motor idempotente con reintentos |
| 7 | Importación de Excel | Migración con vista previa |
| 8 | Reportes y dashboard | 13 reportes, exportación |
| 9 | Pruebas y seguridad | 188 pruebas de API + 16 E2E |
| 10 | Despliegue y CI/CD | Vercel + Render + Neon |
| 11 | Registro, recuperación de clave, alertas y chat en tiempo real | Cierre de la rúbrica |

## 4. Cumplimiento de la rúbrica del primer bimestre
| Ítem de la rúbrica | Peso | Dónde está / cómo demostrarlo |
|---|---|---|
| Introducción y planteamiento del problema | 5 % | Sección 1 de este documento |
| Objetivos y cronograma | 5 % | Secciones 2 y 3 |
| Requerimientos funcionales / historias de usuario | 10 % | [REQUISITOS.md](REQUISITOS.md): 45 RF en 9 bloques + 4 RNF + historias |
| Diagrama de arquitectura | 5 % | [ARCHITECTURE.md](ARCHITECTURE.md) (diagramas Mermaid; NestJS en el backend) |
| Login con lectura/escritura cifrada | 10 % | bcrypt costo 12, token de sesión guardado como hash, cookie `HttpOnly`; `apps/api/src/auth` |
| Signup y reset/forgot | 10 % | `/registro` (solicitud con aprobación del administrador) y `/olvide` → correo con enlace de un solo uso → `/restablecer`; pruebas `access-recovery.spec.ts` |
| Pantalla principal con CRUD | 15 % | Clientes, instalaciones, sistemas, mantenimientos, seguimientos |
| Chat con WebSockets | 10 % | Menú **Chat** (Socket.IO): general y por seguimiento/mantenimiento; `apps/api/src/chat`; pruebas `chat.spec.ts` y E2E |
| Base de datos | 10 % | PostgreSQL (Neon), 27 tablas con Prisma; ver [DATABASE.md](DATABASE.md) |
| Repositorio público con commits de todos | 5 % | Repositorio en GitHub (ver nota) |
| Presentación y evidencias | 15 % | Guion de demostración (sección 5); sistema desplegado |

> **Nota sobre el repositorio:** para este ítem el repositorio debe ser público y tener commits de cada integrante. Eso lo decide y lo hace el equipo (cambiar la visibilidad en GitHub y que cada integrante suba sus cambios con su propia cuenta).

## 5. Guion de demostración (≈ 10 min)
1. **Problema y solución** (1 min): el Excel de IGNIS vs. el sistema.
2. **Acceso** (1 min): iniciar sesión; mostrar `/registro` (solicitud) y aprobación desde *Usuarios*; «¿Olvidó su contraseña?».
3. **CRUD y datos reales** (2 min): clientes → instalaciones → sistemas → mantenimiento; importación del Excel con vista previa.
4. **Seguimiento sin depender del correo** (2 min): un seguimiento de un cliente **sin correo** aparece en la campana de alertas; el recordatorio por correo sale al personal interno.
5. **Chat en tiempo real** (2 min): dos navegadores, mensaje instantáneo; chat de un seguimiento (solo ven quienes tienen acceso).
6. **Dashboard, calendario y reportes** (1 min) con exportación a Excel.
7. **Arquitectura, seguridad y pruebas** (1 min): diagrama, CI en verde, 188 + 16 pruebas.

## 6. Declaración de uso de inteligencia artificial
Se utilizó un asistente de IA (Claude) como apoyo en el diseño, la programación y la documentación. El equipo debe revisar, comprender y poder explicar cada parte del código antes de la presentación, y declarar este uso en la entrega según lo pide la rúbrica.

## 7. Cómo ejecutarlo
- **Producción:** URL del frontend en Vercel (ver [DEPLOYMENT.md](DEPLOYMENT.md)).
- **Local:** `npm install`, `npm run dev:db`, `npm run dev:api`, `npm run dev:web` (ver README).
- **Pruebas:** `npm test` (API) y `npm run test:e2e` (navegador).
