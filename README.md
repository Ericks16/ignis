# IGNIS Maintenance Manager

Sistema web para gestionar clientes, instalaciones, mantenimientos y seguimientos de sistemas de protección contra incendios de IGNIS, con recordatorios automáticos por correo.

Estado del proyecto: **Fase 1 completada** (fundamentos). Ver [docs/ESTADO.md](docs/ESTADO.md). Plan completo: [docs/FASE0_PLAN.md](docs/FASE0_PLAN.md). Análisis del Excel: [docs/ANALISIS_PROCESO_ACTUAL.md](docs/ANALISIS_PROCESO_ACTUAL.md).

## Tecnologías
React + TypeScript + Vite + Tailwind (apps/web) · NestJS + Prisma + PostgreSQL (apps/api) · Jest + Supertest.

## Requisitos
Node 22+ y npm. PostgreSQL: se puede usar uno embebido (sin instalar nada) o Docker.

## Puesta en marcha (desarrollo)
```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env   # luego edite SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run dev:db                                   # PostgreSQL local en el puerto 5433 (deje esta terminal abierta)
```
En otra terminal:
```powershell
cd apps/api; npm run prisma:deploy; npm run seed   # migraciones y primer administrador
cd ../..; npm run dev:api                          # http://localhost:3000  (Swagger en /docs)
npm run dev:web                                    # http://localhost:5173
```
Alternativa a `dev:db`: `docker compose up -d db`.
El primer administrador debe cambiar su contraseña al ingresar.

> Nota Windows: si la carpeta del proyecto contiene `&` (p. ej. "TAPIA & REYES"), los scripts usan `node ...` directo para evitar un fallo de cmd. Funciona igual en rutas sin `&`.

## Pruebas
```powershell
npm test            # PostgreSQL temporal + migraciones + 188 pruebas (unitarias, integración, seguridad)
npm run test:cov    # con cobertura
npm run test:e2e    # Playwright con Microsoft Edge instalado, entorno temporal aislado
```

## Variables de entorno
Ver [apps/api/.env.example](apps/api/.env.example). Los secretos reales nunca se suben al repositorio (`.env` está en `.gitignore`).

## Seguridad (ver [docs/SECURITY.md](docs/SECURITY.md))
Sesión en cookie HttpOnly (SameSite=Lax, Secure en producción) con token aleatorio guardado como hash en BD · bcrypt (costo 12) · bloqueo tras 5 intentos fallidos · CSRF por cabecera personalizada + verificación de Origin · permisos por rol validados en el backend · rate limiting · Helmet · validación estricta de DTOs · logs sin cookies · auditoría de login, cambios de contraseña y gestión de usuarios.

## Documentación
- [Despliegue (Render + Neon + Vercel)](docs/DEPLOYMENT.md) · [Arquitectura](docs/ARCHITECTURE.md) · [Base de datos](docs/DATABASE.md) · [Guía de usuario](docs/USER_GUIDE.md)
- [Seguridad](docs/SECURITY.md) · [Recordatorios](docs/EMAIL_REMINDERS.md) · [Importación de Excel](docs/EXCEL_IMPORT.md) · [Reportes](docs/REPORTES.md) · [Estado del proyecto](docs/ESTADO.md)

## Despliegue
Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Importante: la cookie de sesión es SameSite=Lax, por lo que el frontend y la API se sirven bajo el mismo sitio (proxy `/api` de Vercel hacia Render, ya configurado en `apps/web/vercel.json`). CI en `.github/workflows/ci.yml`.
