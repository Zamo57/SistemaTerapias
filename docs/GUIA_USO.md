# Guía breve de uso

## Conexión actual: nube

http://localhost:5174 utiliza SistemaTerapias remoto (onyonqjatljkbytdxjmz), no Docker. Las cuentas ficticias locales no funcionan en este destino. Las tres cuentas usadas para verificar se eliminaron junto con sus registros. Para ingresar habitualmente, completar config/team.json, preparar SMTP y ejecutar el alta segura descrita en README. Las tarifas y catálogos requieren configuración real. La web todavía no está publicada en Internet.

Las instrucciones de prueba siguientes corresponden al backend local: restaurar su configuración privada y reiniciar antes de utilizarlas. No ejecutar local:setup mientras se quiera mantener la conexión remota.

## Abrir la prueba funcional

Abrir **http://localhost:5174** e ingresar, sin seleccionar Explorar demostración. Consultar el correo y la contraseña individual en `.local/test-accounts.json` mediante el editor de este equipo. No es un archivo público del navegador. Usar exclusivamente nombres/documentos ficticios.

1. **Recepción** (`recepcion.prueba@centro.example`): registrar un paciente llamado `Paciente FICTICIO de prueba`, abrirlo y crear una atención. Seleccionar `Terapeuta · FICTICIO`, `Terapia manual · FICTICIO`, 60 minutos y Tarifa 1. El precio de ensayo es ₡57.000. Se puede probar Tarifa 2 o modificable con montos ficticios; no son precios aprobados del centro.
2. Atenciones → Iniciar; recargar. Inicio vuelve a abrirse, conservando la cuenta y el temporizador. Pausar, recargar de nuevo y continuar. Esperar la confirmación del cambio antes de la siguiente acción; los controles se deshabilitan mientras guardan.
3. Finalizar y abrir el historial del paciente. Con recepción no aparecen las notas clínicas. La visita cuenta como una sesión, aunque incluya más de una terapia.
4. Cobros → registrar un pago efectivo completo o un abono. Para SINPE de ensayo usar el receptor FICTICIO; simular la verificación humana solo con datos de prueba. El pago pendiente no reduce el saldo. Recargar y comprobar pagos y reportes; un cobro completo quita la visita de la lista de saldos.
5. Cerrar sesión e ingresar como **Terapeuta** (`terapeuta.prueba@centro.example`): abrir al mismo paciente, completar notas ficticias y finalizar. Corregir con motivo si es necesario. Recargar para comprobar contenido, versiones y autoría. El historial financiero no se expone a esta cuenta clínica.
6. Cerrar sesión e ingresar como **Administración** (`admin.prueba@centro.example`): revisar configuración y permisos. Esta cuenta no tiene acceso clínico ni financiero automático. Las cuentas reales pueden recibir más de un permiso mediante configuración explícita.

Los pacientes, visitas, notas, temporizadores y pagos de este modo se guardan en PostgreSQL local; no son los objetos de demostración de memoria. Para volver a arrancar después de reiniciar el equipo, ver los comandos `local:start`, `local:setup`, `local:functions` y `dev:local` en README. El buzón http://localhost:54324 captura invitaciones/recuperaciones locales. No prueba SMTP externo.

## Una persona habitual

1. Inicio → Buscar paciente. Escribir cédula con o sin guiones; también acepta nombre o teléfono.
2. Abrir la ficha: última visita, sesiones finalizadas y línea de tiempo. Antecedentes y notas solo aparecen con permiso clínico. El filtro Desde permite recuperar visitas antiguas.
3. Nueva atención: profesional responsable, terapia(s), 30/60 minutos y **Tarifa 1**, **Tarifa 2** o **Tarifa modificable**. Confirmar duración y monto visibles. Recepción conserva su identidad como autora aunque seleccione a otra persona como terapeuta.
4. Atenciones → Iniciar. El temporizador puede pausarse/continuarse. Probar sonido en cada dispositivo al comienzo de la jornada.
5. Completar notas desde Atenciones o el historial. Los borradores se guardan en la base tras una pausa breve de escritura; leer el indicador. Finalizar nota conserva versiones. Para corregir después, indicar motivo.
6. Cuando termina el tiempo: atender/silenciar la alarma y confirmar Finalizar. El pago es independiente.
7. Cobrar: pago completo por defecto; cambiar monto para un abono. Seleccionar efectivo o el receptor SINPE. Verificar SINPE en la cuenta bancaria antes de marcar la confirmación. Una imagen o referencia no demuestra recepción.

La atención puede quedar finalizada con saldo. Para dividir un pago, registrar un abono por cada método. El saldo es el monto acordado menos cobros confirmados más devoluciones. No hay comisión SINPE asumida.

## Primera visita y personas sin cita

Si la búsqueda no encuentra al paciente, Registrar paciente reutiliza la identificación escrita. Solo documento y nombre son obligatorios; contacto y preferencias pueden completarse después. Registrar atención no requiere cita. Antecedentes generales se editan aparte de las notas de visita.

## Configuración diaria

Cada persona usa su cuenta. Roles combinables: administración (catálogos/usuarios), atención clínica (antecedentes/notas), recepción (pacientes/atenciones/cobros), finanzas (movimientos/reportes). Tener administración o finanzas no concede acceso clínico. No desactivar el último administrador.

En Tarifas, un campo vacío significa pendiente de configurar; cero exige identificar la sesión gratuita. La tarifa de ₡57.000 por una hora solo se usa si se configura o se acuerda como modificable. Los cambios futuros preservan atenciones existentes.

En Agenda se crean citas, cancelan y reprograman; no se permiten horarios superpuestos del mismo terapeuta. Marcar una cita atendida no crea una sesión: registrarla desde la ficha del paciente. No se envían recordatorios todavía.

## Reportes y cierres

Desde Inicio, abrir un indicador para ver su detalle. Reportes usa fechas de recepción para pagos, fechas de atención para sesiones. Semana comienza el lunes; toda fecha se interpreta en Costa Rica. Sesiones canceladas o pendientes no cuentan como realizadas. Terapias múltiples de una visita son una sesión. Devoluciones reducen cobros netos en su fecha, sin borrar el cobro original. No se calculan ganancias.

Exportar cobros produce CSV sin notas, padecimientos ni identificación del paciente. Guardar fuera de equipos compartidos. La exportación solo está disponible para recepción/finanzas.

## Si falla una conexión

No cerrar una nota pendiente. El mensaje Guardando… no significa que haya terminado. Solo el indicador guardado confirma persistencia. Reintentar en la misma ventana conserva la clave del pago, evitando duplicación. Si otra persona modificó el registro, actualizar y revisar antes de guardar. No hay atención offline ni copia local de expedientes.

## Sonido y accesibilidad

La prueba de sonido permite habilitar audio después de un gesto del usuario. La alerta visible persiste; la sonora se repite cada 15 segundos hasta atenderla, si esta página permanece activa. Silenciar este dispositivo afecta su audio; Atendida guarda el reconocimiento de esa alarma para los demás dispositivos. No se garantiza alarma con pantalla bloqueada, pestaña en segundo plano o suspensión del sistema. Mantener una pantalla activa y comprobar físicamente el audio; usar un temporizador independiente si es esencial.

Los campos admiten el dictado del teclado del dispositivo. No se envían notas a servicios de IA. Usar Tab para navegar y Escape para cerrar ventanas. Las animaciones respetan reducir movimiento.

## Nombre sugerido por cédula

En Nuevo paciente, una cédula física de nueve dígitos activa la búsqueda después de una breve espera. Un paciente registrado ofrece abrir su ficha. Para personas nuevas se consulta caché/GoMeta desde backend y se completan nombre y dos apellidos editables. Revisar antes de guardar: GoMeta es externo y esto no verifica identidad. Si no hay resultado, falla el servicio o se alcanza un límite, continuar manualmente. DIMEX/pasaporte no consultan el proveedor. Los expedientes anteriores conservan Nombre completo.
