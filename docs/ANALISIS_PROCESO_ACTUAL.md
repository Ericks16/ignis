# Análisis del proceso actual — IGNIS

Fuente: `CRONOGRAMA ANUAL SISTEMA DE DETECCIÓN Y ALARMA - 2026.xlsx` (carpeta Descargas).
El archivo original **no se modificó**: el análisis se hizo sobre una copia de solo lectura.
Fecha de análisis: 2026-11-24.

## 1. Estructura del libro (20 hojas)

| Hoja | Contenido | Uso en el sistema |
|---|---|---|
| **CRONOGRAMA DE ATENCION (2)** | "CARTERA DE CLIENTES": 1 fila por cliente/sede/central. 149 filas, ~139 con datos. Fuente principal. | Clientes, instalaciones, sistemas, mantenimientos, seguimientos, dispositivos |
| **DATOS** | Listas auxiliares: TIPO DE CENTRAL, TÉCNICOS, ESTADO (INSTALADO / MTTO) | Catálogos |
| **CRONOGRAMA CLIENTES** | 9 bloques por cliente (DSM, Carlisnacks, Constructora Hidalgo, Quala, Imptek…): matriz mes×año con "trabajo a realizar" (inspección mensual, mantenimiento trimestral/semestral/anual, instalación), día de atención, hora y técnicos con cédula | Plantillas de programación y asignación de técnicos |
| **CRONOGRAMA ENI / AUTOLIDER** | Visitas por sucursal; ENI: fechas+iniciales de técnicos+descripción ("mtto sistema de alarma 1 central Bosch – 35 dispositivos"). AUTOLIDER: tabla Atención/Vencimiento por sucursal y tipo (extintores, alarma/luminiscencia, bomba CI) | Mantenimientos programados por instalación |
| **ENERO 2022 … DICIEMBRE 2022 / ABRIL–JULIO 2023** (12 hojas) | Agenda diaria tipo calendario: fecha, iniciales de técnicos (`JA-FR-IZ`), cliente + trabajo | Historial de visitas/actividades |
| **viaticos** | Gastos por viaje (peajes, viáticos, combustible, movilización, taxi), por técnico y cliente | **Fuera del alcance** del prompt; se propone módulo futuro |
| **Hoja1** | Plantilla vacía "GESTIÓN DE ATENCIÓN" (cliente, dirección, persona a cargo, central, fecha mtto, próx. mtto, fecha atención, seguimiento) | Confirma el modelo mental: cliente → central → mtto → próximo → seguimiento |
| **Hoja2** | Agencias (Ambato, Recreo, Condado, Dorado, Sol, Ceibos), fecha inicio y personal asignado **con cédulas** | Instalaciones/visitas; ver riesgo de datos personales |

## 2. Hoja principal: columnas

`ESTADO | Cliente | Direccion | Persona a Cargo | CENTRAL | FECHA MTO | Proximo MTO | SEGUIMIENTO | CANT DISP |` y 28 columnas de dispositivos:
DH (detector humo), DT (detector térmico), EM (estación manual), LUZ ESTROB., EXPANSORES, Parlante con luz, Sensor de calor, D GAS, PHOTOBEAM, M MONITOREO, MRELAY, M AISLAMIENTO, PANEL DESCARGA, BOTÓN ABORTO, LLAVE MTO, M DESCARGA, SOLENOIDE, ACTIVADOR MANUAL, CILINDRO, TUBERÍA/BOQUILLA DESCARGA (agente limpio), LÁMPARAS, ROCIADORES, TECLADO, FUENTE DE PODER, SIRENA, BATERÍA.

Cifras (sobre ~139 registros):

- **Estado**: MTTO 94, INSTALADO 43, más una fila separadora "CLIENTES PERDIDOS" (inicia en la fila 114; los registros siguientes son clientes perdidos o cerrados, p. ej. "sistema desinstalado", "cerrada").
- **Clientes únicos**: ~100 nombres; muchos con varias sedes (GRUPO SUPERIOR ×8, AVIANCA ×4, AUDIAUTO ×3, CASABACA ×3, ETERNIT ×3, etc.). El "cliente" y la "sede" están mezclados en una sola celda o repartidos entre `Cliente` y `Direccion`.
- **Central** (columna CENTRAL): 30 valores; los más comunes DSC 1832 (24), Simplex 4007 (17), Bosch FPA 1000 (15), Bosch FPD 7024 (12). 12 filas vacías. La columna mezcla *modelos de central* con *categorías de servicio* (EXTINTORES 8, LÁMPARAS 4, BOMBA CI, GABINETES, PARARRAYOS, EVACUACIÓN).
- **Dispositivos**: 71 filas con CANT DISP; ~4 259 dispositivos totales (DH 2 127, EM 557, LUZ ESTROB. 523, DT 461…). `CANT DISP` es una fórmula (suma de columnas); algunas fórmulas están rotas (`#REF`/`undefined`).
- **Seguimiento**: solo 25 de 139 filas tienen texto, libre y sin estructura ("enviar proforma", "carta de presentacion", "dar seguimiento tabatha", "con RTM", "otro proveedor", "no aprobaron", "preguntar a Tabatha como va el proceso mtto vencido junio anual").

## 3. Cómo trabaja hoy la empresa (procesos identificados)

1. **Cartera de clientes** con su central instalada, cantidad de dispositivos y contacto.
2. **Mantenimiento periódico**: se registra `FECHA MTO` (último) y `Proximo MTO`. La diferencia real es **12 meses en 98 casos, 6 meses en 33**, y 7/3/0 meses en 4 casos (anómalos). Todas las fechas son **día 1 del mes** → la precisión actual es **mensual**, no diaria.
3. **Programación**: en hojas por cliente (matriz mensual) y en agendas diarias por técnico (iniciales).
4. **Asignación de técnicos**: por iniciales en la agenda (`JA, MC, IZ, FR, RC, WS, FA`) y por nombre con cédula en el cronograma por cliente.
5. **Seguimiento comercial** (proformas, cartas de presentación, RTM) como texto libre al lado del mantenimiento.
6. **Clientes perdidos**: sección aparte al final de la hoja.
7. **Tipos de trabajo** observados: inspección mensual, mantenimiento trimestral/semestral/anual, instalación, ampliación, corrección de cableado/tubería, revisión de detector de gas, instalación de lámparas de emergencia, traslado/viaje a Guayaquil.

## 4. Problemas detectados

- **Datos desactualizados**: 109 de 135 registros con fecha tienen `Proximo MTO` anterior a hoy (2026-11-24). Importarlos tal cual generaría ~109 mantenimientos "vencidos" y una ráfaga de correos. Requiere decisión humana.
- Dirección vacía en 68 filas y persona a cargo vacía en 65 → no hay contacto ni correo para notificar. **No existen correos electrónicos en el Excel.**
- Nombres inconsistentes/duplicados: `AUDIAUTO` vs `AUDIOAUTO`; `PRICE WATER HOUSE` vs `PWC ASESORES EMPRESARIALES`; espacios finales en 17 nombres; `PARRARAYOS`, `RED CONTRA INCEDIOS` (typos); `DSC` vs `DSC 1832`; `NOTIFIER` / `NOTIFIRE` / `NOTIFIER NFS 2-640`; `SIMPLEX 4007` repetido en DATOS.
- Etiquetado de año engañoso: el archivo se llama "2026", pero las hojas mensuales dicen 2022/2023 y contienen fechas de 2024; "CRONOGRAMA CLIENTES" mezcla 2022–2024.
- Mismo cliente con dos fechas distintas por central o sede, sin identificador común.
- Técnicos referidos de 3 formas distintas (iniciales, "Javier A.", nombre completo con cédula) y personas que aparecen duplicadas (p. ej. Arteaga Zhunio repetido en un bloque).
- Estado `INSTALADO` vs `MTTO` mezcla "tipo de relación" con "estado"; no hay estado de ejecución real.
- Seguimiento sin responsable, fecha objetivo ni estado.
- **Datos personales**: cédulas de técnicos en `Hoja2` y `CRONOGRAMA CLIENTES`. No se importarán salvo decisión explícita (recomendado: no almacenarlas, o cifradas y solo para Administrador).
- Hoja `viaticos` contiene fórmulas y totales inconsistentes (p. ej. fila con `=-40`).

## 5. Traslado al sistema

| Dato del Excel | Destino | Tratamiento |
|---|---|---|
| Cliente (+ Dirección como sede) | `Client` + `Installation` | Normalizar nombre (trim, mayúsculas, fusión de duplicados **con confirmación**); el cliente "GRUPO SUPERIOR" tendrá 8 instalaciones |
| Persona a cargo | `ClientContact` | Sin correo → queda pendiente de completar |
| CENTRAL | `InstalledSystem` + catálogo `SystemCategory`/modelo | Separar *modelo de central* (marca/modelo) de *categoría* (Extintores, Lámparas, Bomba CI…) |
| Columnas de dispositivos | `Equipment` (tipo de dispositivo + cantidad) | Catálogo de tipos de dispositivo; cantidad por sistema |
| FECHA MTO | `Maintenance` realizado (histórico) | Fecha día 1 → se marca "fecha aproximada" |
| Proximo MTO | `Maintenance` programado / `InstalledSystem.nextMaintenanceDate` | **Vencidos: el usuario decide** (reprogramar, marcar histórico, ignorar) |
| SEGUIMIENTO | `FollowUp` (título = texto; estado inicial por reglas) | Texto libre → título/descripción; responsable y fecha objetivo a completar |
| ESTADO MTTO/INSTALADO | Campo "relación" del sistema | No es estado de seguimiento |
| CLIENTES PERDIDOS | `Client.status = INACTIVO` | Sin recordatorios |
| Iniciales de técnicos | `Technician` | Tabla de equivalencias a validar (ver abajo) |
| Agenda diaria 2022–2023 | `Activity` histórica (opcional) | Baja prioridad; solo con confirmación |
| viaticos | — | Fuera de alcance de esta versión |

### Se conservan
Cliente, sede, persona a cargo, central, fechas, seguimiento (texto), cantidades de dispositivos, estado/relación.

### Se normalizan
Mayúsculas/espacios, typos de catálogos, fechas a `DATE` en zona America/Guayaquil, estados a catálogo, modelos de central a catálogo.

### Requiere validación humana antes de importar
1. Fusión de duplicados de clientes (AUDIAUTO/AUDIOAUTO, PWC, etc.).
2. Qué hacer con los 109 mantenimientos vencidos.
3. Tabla de iniciales → técnico: `JA`, `MC`, `IZ`, `WS`, `RC`, `FR`, `FA`, `RN`. Hipótesis a confirmar: MC = Mauricio Cañaveral, IZ = Iván Zhinin, WS = Wuilfredo Silva, JA = Javier Arteaga; **FR, RC, FA, RN sin identificar con certeza**.
4. Qué filas de "CENTRAL" son categorías vs modelos.
5. Si se importan cédulas.
6. Correos de destinatarios (no existen en el Excel).
7. Periodicidad: el Excel sugiere 12 o 6 meses por cliente. Conforme a tu regla, el sistema **no la calcula solo**: la importación la propone y un humano la confirma.
8. Filas anómalas (diferencias de 0, 3 o 7 meses; 2 filas sin fechas).

## 6. Estrategia de migración segura

- La importación es una **función de la aplicación** (carga → hoja → mapeo → validación → previsualización → confirmación), nunca un script que toque el original.
- El archivo se lee en memoria con ExcelJS; el original no se escribe.
- Todo se guarda con un `ImportBatch` (archivo, hash, usuario, fecha, resultado) para trazabilidad, e importaciones **idempotentes** (re-importar el mismo archivo no duplica) con detección de duplicados por nombre normalizado + sede + central.
- Nunca se borra información existente.
- Las fechas importadas del pasado no generan recordatorios; los recordatorios sólo se activan para seguimientos/mantenimientos que el usuario marque como vigentes.
