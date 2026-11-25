# Guía de usuario

## Ingreso
1. Abra la dirección del sistema e ingrese con su correo y contraseña.
2. Si su cuenta es nueva o su clave fue restablecida, el sistema le pedirá **cambiarla** antes de continuar (mínimo 10 caracteres con mayúscula, minúscula y número).
3. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. Si olvidó su clave, pida a un administrador que la restablezca.
4. Use **Cerrar sesión** al terminar, sobre todo en equipos compartidos.

## ¿No tiene cuenta u olvidó su clave?
- **Solicitar acceso:** en la pantalla de ingreso, *Solicitar acceso*. Su cuenta queda pendiente y un administrador la aprueba (*Usuarios → Aprobar acceso*); recibirá solo permisos de consulta hasta que le cambien el rol.
- **¿Olvidó su contraseña?:** escriba su correo y recibirá un enlace de un solo uso que vence en 60 minutos. Si no llega, revise spam o pida a un administrador que restablezca su clave.

## Qué puede hacer cada rol
| | Administrador | Administrador operativo | Técnico | Consulta |
|---|---|---|---|---|
| Ver clientes, sistemas, calendario, reportes | ✔ | ✔ | Solo lo asignado a él | ✔ |
| Crear/editar clientes, instalaciones, sistemas, técnicos, seguimientos | ✔ | ✔ | — | — |
| Registrar/actualizar mantenimientos y actividades | ✔ | ✔ | Los asignados a él | — |
| Notificaciones y recordatorios | ✔ | ✔ (ver y reintentar) | — | Ver notificaciones |
| Usuarios, catálogos, importar Excel, ejecutar recordatorios, configurar | ✔ | — | — | — |

## Trabajo diario
- **Dashboard**: tarjetas clicables (vencidos, próximos, pendientes), filtro por año y lista de clientes que requieren atención.
- **Clientes → detalle**: contactos, instalaciones, sistemas, historial de mantenimientos y seguimientos. Al crear un cliente el sistema avisa si ya existe uno con nombre o RUC parecido.
- **Sistemas**: cada sistema tiene categoría, estado, fechas de último/próximo mantenimiento y sus dispositivos/equipos.
- **Mantenimientos**: programar, iniciar, completar (con resultado y próxima fecha), reprogramar o cancelar. Al completar con próxima fecha se programa el siguiente.
- **Calendario**: vista mensual/semanal de visitas; clic para abrir el detalle.
- **Seguimientos**: pendientes comerciales o técnicos con fecha objetivo, prioridad, responsable e historial. Finalizar o cancelar detiene los recordatorios.
- **Actividades**: registro histórico de lo hecho (visitas, llamadas, cotizaciones).

## Campana de alertas
La campana de la cabecera muestra lo **vencido** y lo que **vence en 30 días** dentro de su alcance. Funciona aunque el cliente no tenga correo o el correo esté en modo prueba: ningún seguimiento queda sin atender por falta de un correo.

## Chat del equipo
En **Chat** hay una sala general para todo el personal. En cada seguimiento y mantenimiento hay un botón *Chat del …* con una sala que solo ven quienes tienen acceso a ese registro. Los mensajes llegan al instante y quedan guardados.

## Recordatorios por correo
- El primer aviso sale **un mes antes** de la fecha objetivo y luego **cada semana**, también cuando ya venció, hasta que el registro se finalice o cancele.
- Los destinatarios son el responsable, los correos internos configurados y (solo si se habilitó) los contactos del cliente.
- En *Notificaciones* se ve cada envío y su resultado; un administrador operativo puede reintentar los fallidos. En *Recordatorios* (administrador) se configura y se puede ejecutar a mano.
- Mientras el sistema esté en **modo prueba**, los correos solo se registran y no se envían.

## Importar desde Excel (administrador)
1. *Importar Excel → Nueva importación*, suba el .xlsx (el original nunca se modifica).
2. Elija la hoja y confirme qué columna es cada dato.
3. Revise la **vista previa** (errores, advertencias, duplicados). Todavía no se guardó nada.
4. Confirme: solo se **agregan** registros; nada existente se borra ni cambia. Descargue el informe del resultado.
Hay una plantilla oficial descargable.

## Reportes
*Reportes* ofrece 13 reportes con filtros; cada uno se exporta a Excel, CSV o PDF con los filtros aplicados. Cada rol solo ve la información que le corresponde.

## Buenas prácticas
- No comparta su cuenta; cada persona debe tener la suya.
- Registre el resultado y la próxima fecha al completar un mantenimiento: de ahí salen los siguientes recordatorios.
- Si un dato parece incorrecto, edítelo: los cambios quedan en el historial de auditoría.
