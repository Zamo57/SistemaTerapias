# Comunicación planificada, no activada

Correo con proveedor SMTP/API oficial y WhatsApp mediante WhatsApp Business Platform de Meta o proveedor autorizado. Selección y costos se investigarán cuando el responsable autorice esta etapa. No usar automatización de WhatsApp Web ni números personales compartidos.

Agregar `communication_consents` (canal, autorización/revocación, texto/versión, autor y fecha), `communication_jobs` (cita, canal, propósito, versión de cita, clave única, horario, estado/intentos), `communication_events` (proveedor/ID, enviado/entregado/fallido/cancelado, hora) y webhooks firmados de proveedor. RLS de recepción, secretos exclusivamente en servidor.

El disparador solo programa recordatorios para consentimientos vigentes y citas programadas. Respetar horario aprobado en Costa Rica y plantillas oficiales cuando sean necesarias. Contenido mínimo: nombre del centro, fecha/hora, instrucciones de confirmación/cancelación; excluir síntomas, terapias, notas y saldos. Evitar números de identificación en mensajes.

Un worker reclama trabajos de forma atómica con bloqueo; clave única `(cita, versión, canal, propósito)` y clave de idempotencia al proveedor cuando exista. Reprogramar/cancelar invalida jobs antiguos; comprobar estado y consentimiento justo antes de enviar. Webhooks procesados con ID único para no duplicar eventos. Reintentos limitados y revisión manual de resultados ambiguos para evitar mensajes duplicados.

Pruebas futuras: cambio de cita entre programación y envío, consentimiento revocado, webhook repetido, timeout del proveedor, reintento ambiguo, fuera de horario, cancelación y reprogramación. Documentar costos por mensaje/plantilla, contratos de datos, retención del historial y soporte de baja. Activar únicamente después de prueba en entorno separado y aprobación del responsable.
