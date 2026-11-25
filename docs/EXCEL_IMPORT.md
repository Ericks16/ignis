# Importación de Excel

Estado: implementado y probado (Fase 7). Solo el **Administrador** puede importar. Pantalla: **Importar Excel**.
Código: `apps/api/src/imports` (lectura, mapeo, planificador, ejecutor) y `apps/web/src/pages/Import*.tsx`.

## Garantías de seguridad

| Garantía | Cómo se cumple |
|---|---|
| El Excel original **nunca se modifica** | El archivo se lee en memoria; las descargas (reporte, plantilla) son archivos nuevos. |
| **Nada se guarda sin vista previa y confirmación** | `preview` no escribe datos de negocio; `confirm` exige `acknowledge: true` y una vista previa previa. |
| **Nunca borra ni modifica** lo existente | El ejecutor solo hace `create`; reutiliza clientes, instalaciones y sistemas que ya existen. |
| **Todo o nada** | La importación entera va en una transacción; si algo falla, no queda nada a medias. |
| **No se importa dos veces** | Toma exclusiva al confirmar; re-importar el mismo archivo no duplica nada y se avisa («este archivo ya se importó el…»). |
| **Trazabilidad** | Cada registro creado guarda `importBatchId`; el lote conserva configuración, resumen y resultado. |
| Archivos seguros | Solo `.xlsx`, máx. 10 MB y 5 000 filas por hoja; se valida la firma ZIP (no se confía en la extensión/MIME); las fórmulas nunca se evalúan (solo se lee su resultado guardado); el reporte neutraliza celdas que empiezan con `= + - @`. |
| Datos personales | La importación no lee ni guarda cédulas; los contactos importados **no** reciben recordatorios hasta que se active a mano. |
| Sin copia permanente del archivo | Los bytes del XLSX se borran al terminar o cancelar la importación. |

## Flujo (asistente)

1. **Subir** el `.xlsx`. Se muestran las hojas.
2. **Hoja y encabezados:** se sugiere la fila de encabezados (la que más columnas reconoce).
3. **Mapeo de columnas:** se proponen automáticamente por el encabezado; se pueden cambiar. Las columnas de dispositivos se reconocen contra el catálogo (nombre, código o alias del Excel de IGNIS, p. ej. `ESPANSORES`, `MRELAY`, `LAMPARAS`). `CANT DISP` (total) se ignora.
4. **Reglas** (ver abajo) y valores por defecto.
5. **Vista previa:** resumen, cada fila con su estado (correcta / advertencia / error / omitida) y qué ocurrirá, categoría asignada a cada valor de «Central», y ajustes por fila: **renombrar cliente** (para fusionar duplicados) u **omitir**.
6. **Confirmar** (casilla de confirmación explícita) → resultado con contadores y **reporte descargable** (`.xlsx`) con errores y advertencias.

Hay también una **plantilla oficial** descargable (mismas columnas del Excel de IGNIS + RUC, ciudad y correos; las columnas de dispositivos salen del catálogo vigente; incluye instrucciones y catálogos).

## Qué se crea por cada fila

| Excel | Resultado |
|---|---|
| Cliente | `Client` (se reutiliza si el nombre normalizado ya existe: sin acentos, mayúsculas ni espacios repetidos). Varias filas del mismo cliente → un solo cliente. |
| Dirección / sede | `Installation` (si está vacía: «Principal»). Se reutiliza si ya existe en ese cliente. |
| Persona a cargo | `ClientContact` (sin recordatorios por defecto; se avisa que no tiene correo). |
| CENTRAL | `InstalledSystem`: si el texto coincide con una categoría (incluye erratas como «PARRARAYOS») usa esa categoría; si no, es **modelo** de central en la categoría por defecto (marca detectada si es conocida: Bosch, DSC, Simplex, Kidde…). Cada valor se puede reasignar en la vista previa. |
| ESTADO | Relación del sistema: `INSTALADO` / `MTTO`. |
| Columnas de dispositivos | `Equipment` (cantidad entera ≥ 1) — solo para sistemas **nuevos**. |
| FECHA MTO | Mantenimiento **REALIZADO** histórico (fecha tal como está en el Excel, que suele ser solo mes/año) y último mantenimiento del sistema. |
| Proximo MTO | Si es hoy o futuro: mantenimiento **PROGRAMADO** (generará recordatorios). Si ya venció: según la regla elegida. |
| SEGUIMIENTO | `FollowUp` PENDIENTE sin fecha objetivo (no genera recordatorios) con el texto como título. |
| Fila «CLIENTES PERDIDOS» | Las filas siguientes se importan como **inactivas**: sin programación ni seguimientos. |

### Reglas que debe decidir el usuario

- **Próximo mantenimiento ya vencido** (en el Excel real son ~109 de 135): **Guardarlo solo como dato** (recomendado: sin mantenimiento ni recordatorios), **crear un mantenimiento vencido** (generará recordatorios semanales «VENCIDO» a los destinatarios configurados) o **descartarlo**.
- **Fila sin central:** crear un sistema genérico en la categoría por defecto, o no crear sistema.
- **Categoría de «EXTINTORES», «EVACUACION», etc.:** no están en el catálogo oficial. Cree la categoría en *Catálogos* antes de importar (se reconoce sola) o asígnela en la vista previa.

## Validaciones

- **Errores (la fila no se importa):** cliente vacío o fuera de 2–150 caracteres; fecha ilegible, imposible (31/02) o fuera de 2000–2100; último mantenimiento futuro; RUC que no tiene 10 o 13 dígitos, ya pertenece a otro cliente o está repetido para otro cliente del archivo; correo del cliente o del contacto con formato inválido; cantidad de dispositivos no entera, negativa o > 100 000.
- **Advertencias (la fila sí se importa):** sin instalación; sin central; estado no reconocido; próximo mantenimiento vencido o no posterior al último (se ignora); sistema/cliente/seguimiento repetido o ya existente; contacto sin correo; nombre de cliente muy parecido a otro (p. ej. `AUDIAUTO`/`AUDIOAUTO`: renómbrelo para fusionarlos).
- Una fila con error **no reserva** claves: si la siguiente fila válida es del mismo cliente, sí lo crea.

## Resultado con el Excel real de IGNIS (vista previa, sin guardar)

Hoja «CRONOGRAMA DE ATENCION (2)» con las reglas por defecto: **137 filas importables, 0 errores, 2 omitidas** (el separador «CLIENTES PERDIDOS» y un encabezado repetido) → 98 clientes (27 perdidos/inactivos), 123 instalaciones, 133 sistemas, 391 tipos de dispositivo cargados, 135 mantenimientos históricos, 26 programados, 20 seguimientos y 42 contactos. Se detectaron automáticamente: fila de encabezados (2), todos los campos y 27 tipos de dispositivo. La mayoría de las 132 advertencias son «sin instalación», «próximo vencido» y «contacto sin correo».

## Alcance y límites

- Se importa la **cartera de clientes** (una hoja tabular). Las hojas de agenda diaria (`ENERO 2022`…), cronogramas por cliente, `AUTOLIDER`, `ENI`, `viaticos`, `Hoja2` (personal con cédulas) **no** se importan; el asistente muestra todas las hojas por si se quiere probar otra.
- El Excel mezcla cliente y sede en el nombre en algunos casos (p. ej. «AUTOLIDER GUAMANI», «AUTOLIDER NNUU»): se importan como clientes distintos; se pueden fusionar renombrando.
- Las fechas del Excel tienen precisión mensual (siempre día 1): el histórico queda con esa fecha y una nota que lo indica.
- No hay «deshacer» automático: cada registro lleva `importBatchId`, lo que permite revertir un lote con una consulta si fuera necesario (no hay botón en esta versión).
- Técnicos: el Excel no trae su identificación por fila (solo iniciales en las agendas, que no se importan), por eso no se asignan técnicos.

## Pruebas

`npm test`: 20 pruebas unitarias del planificador (fechas, reconocimiento de los encabezados reales, errores, duplicados, sección de perdidos, políticas de vencidos, fusión por renombrado…) y 12 de integración (permisos, validación del archivo, plantilla, flujo completo con trazabilidad, idempotencia, concurrencia, atomicidad, reporte, cancelación, neutralización de fórmulas, nombre de archivo con acentos).
