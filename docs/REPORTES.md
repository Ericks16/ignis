# Reportes y exportaciones

Estado: implementado y probado (Fase 8). Pantalla: **Reportes** (`/reportes`). Código: `apps/api/src/reports`, `apps/web/src/pages/Reports.tsx`.

## Reportes disponibles (13)

| Grupo | Reporte | Contenido | Filtros |
|---|---|---|---|
| Clientes y sistemas | **Clientes** | Cartera con instalaciones, sistemas activos, contactos, mantenimientos vencidos y seguimientos abiertos | estado, ciudad, búsqueda |
| | **Sistemas instalados** | Cada sistema con categoría, marca/modelo, estado operativo, fechas de mantenimiento, responsable y dispositivos | cliente, categoría, estado, búsqueda |
| | **Sistemas por categoría** | Activos/inactivos/total y clientes distintos por categoría (incluye categorías en cero) + total | cliente |
| Mantenimientos | **Realizados** | Trabajos ejecutados, resultado y próximo mantenimiento definido | fecha de ejecución, cliente, técnico, sistema, tipo |
| | **Pendientes** | Todo lo abierto (programado, pendiente, en proceso) con su situación (Vencido / Próximo / Programado) | fecha programada, cliente, técnico, sistema, tipo, estado |
| | **Vencidos** | Abiertos con fecha pasada, con días de atraso | fecha programada, cliente, técnico, sistema, tipo |
| | **Próximos** | Abiertos que vencen en los próximos N días (30 por defecto, 1–365) | días, cliente, técnico, sistema, tipo |
| | **Por técnico** | Asignados, realizados, en proceso, pendientes, vencidos y cancelados/reprogramados + total | fecha programada, técnico, cliente, sistema, tipo |
| | **Por cliente** | Total, realizados, pendientes, vencidos, último realizado y próximo programado + total | fecha programada, cliente, sistema, tipo |
| Seguimientos | **Pendientes** | Abiertos con prioridad, responsable y situación (Vencido / Por vencer / En plazo / Sin fecha) | fecha objetivo, cliente, técnico, tipo, estado, prioridad, responsable, búsqueda |
| | **Finalizados** | Cerrados como FINALIZADO: quién, cuándo y días en gestión | fecha de finalización, cliente, técnico, tipo, prioridad, responsable, búsqueda |
| | **Vencidos** | Abiertos con fecha objetivo pasada y días de atraso | como «Pendientes» |
| Actividades | **Actividades por técnico** | Historial con quién registró cada actividad | fecha, técnico, cliente, tipo de actividad |

Las fechas y horas se muestran en America/Guayaquil. «Vencido» significa abierto con fecha anterior a hoy (hoy no es vencido).

## Permisos y alcance de datos

- Cada reporte declara los roles que lo ven. **Administrador, Operativo y Consulta**: los 13. **Técnico**: solo los de mantenimientos (pendientes, vencidos, próximos, realizados, por técnico), seguimientos y actividades; no ve clientes, sistemas, sistemas por categoría ni mantenimientos por cliente (403).
- Los reportes usan **la misma definición de alcance** que las pantallas (`common/scopes.ts`): un Técnico solo ve lo asignado a su usuario, **también al exportar**. En «Mantenimientos por técnico» solo ve su propia fila.
- La exportación vuelve a ejecutar el reporte en el servidor con los mismos filtros y permisos: no se puede obtener por el exportador más de lo que se ve en pantalla.

## Exportaciones

| Formato | Detalle |
|---|---|
| **Excel (.xlsx)** | Encabezado con estilo, filas congeladas y autofiltro, fechas como fechas reales (ordenables), números como números, fila de **TOTAL** cuando aplica y hoja **Filtros** (reporte, fecha de generación, usuario, filas y filtros aplicados con nombres legibles). |
| **CSV** | UTF-8 con BOM (Excel respeta tildes y eñes), separador coma, comillas escapadas. |
| **PDF** | A4 horizontal, encabezado con título, usuario y filtros, tabla con encabezado repetido en cada página, filas alternadas, columnas proporcionales, total y pie «Página x de y». Máx. **3 000 filas** (avisa y sugiere Excel). |

- Máximo de **20 000 filas** por reporte; si se alcanza, se avisa en pantalla y en la hoja «Filtros»/nota del PDF.
- **Seguridad:** los textos que empiezan con `=`, `+`, `-` o `@` se guardan como texto literal (con apóstrofo) en Excel y CSV para que no se ejecuten como fórmulas al abrirlos.
- Cada exportación queda en la auditoría (`report.exported`: reporte, formato, filas y filtros).
- Nombre de archivo: `<reporte>-AAAA-MM-DD.<formato>`.

## Dashboard completo

- Tarjetas **clicables** que llevan a la lista ya filtrada (mantenimientos vencidos/próximos, seguimientos vencidos, etc.).
- **Filtro de año** para «Mantenimientos por mes» (realizados vs. pendientes).
- Tabla **«Clientes que requieren atención»** (los 8 más urgentes, con mantenimientos y seguimientos vencidos; el Técnico no la ve).
- **Sistemas por categoría** y **Seguimientos por estado** como gráficos de barras, **Próximas visitas**, y acceso a Reportes.
- «Actividades pendientes» no aplica como indicador: las actividades son registros históricos, no tareas; lo pendiente está en los seguimientos abiertos.

## Pruebas

`npm test`: 18 pruebas de reportes (catálogo por rol, permisos, cada reporte con sus filtros y cifras verificadas, paginación, alcance del Técnico en pantalla y al exportar, Excel/CSV/PDF reales, neutralización de fórmulas, auditoría, dashboard).

## Notas técnicas

- PDF con `pdfkit` **0.15.2** (fijado a propósito): las versiones 0.17+ dependen de un módulo solo-ESM que no carga en la suite de pruebas (Jest/CommonJS).
- Los reportes se calculan en memoria con tope de filas; para volúmenes muy grandes habría que pasar a consultas agregadas en SQL.
