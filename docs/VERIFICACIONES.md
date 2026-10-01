# Verificaciones de la entrega

Fecha: 30/09/2026 (Costa Rica). Se configuró y ejecutó **Supabase local en Docker**, con PostgreSQL 17.11, Auth, PostgREST y Edge Functions reales. No hay proyecto de producción ni credenciales externas configuradas.

## Nueva verificación conectada

`npm run test:connected` prueba la aplicación en http://localhost:5174 contra http://127.0.0.1:54321. Cuentas y todos los pacientes/notas/movimientos son ficticios. Los servicios usan la red `centro-terapias-local`, limitada a localhost. Se aplicaron las cinco migraciones sin sustituir la base por mocks.

- Flujo por navegador aprobado: login real, paciente guardado, recarga y búsqueda, visita con Tarifa 1, terapeuta distinto al autor, inicio, recarga conservando inicio/tiempo restante, pausa y otra recarga, continuación/finalización, historial, pago efectivo, recarga conservando pago y aumento exacto de ₡57.000 en cobros netos del reporte.
- Nota clínica creada con identidad terapéutica, corregida desde navegador con motivo y recuperada tras recargar; autoría y dos versiones confirmadas por API.
- Las tres modalidades de tarifa aplicadas en Supabase real. Abono efectivo, SINPE pendiente sin efecto en saldo, confirmación y pago dividido verificados. No hubo transferencias bancarias reales.
- Consultas directas y snapshot con JWT reales: administración/recepción no leen notas; clínica no lee pagos; recepción no puede escribir notas ni editar pagos directamente. Signup público rechazado por Auth.
- Cuenta inactiva con JWT existente pierde acceso a pacientes y RPC, preservando identidad y autoría; se volvió a activar la cuenta ficticia al terminar.
- Dos conexiones concurrentes intentan cobrar el mismo saldo: exactamente una registra pago y otra recibe rechazo por exceso. Reintento con UUID existente no duplica el movimiento.
- Edge Function de invitación: recepción rechazada, administrador autorizado; correo FICTICIO capturado en Mailpit, enlace aceptado, contraseña individual creada y login correcto. Recuperación por enlace local y login con nueva contraseña ejecutados. **Esto no aprueba SMTP externo.**
- Archivos `.local/`, credenciales y configuración privada bloqueados al solicitarse por HTTP al frontend.

Errores encontrados y corregidos: etiquetas de grupos interferían con los nombres accesibles de botones; el contador de atenciones cambiaba el nombre de navegación; controles de temporizador permitían otra acción antes de confirmar el guardado; suscripción Auth interfería con la demostración en un entorno conectado; Edge Functions se iniciaban en una red Docker distinta del gateway. Se corrigieron manteniendo diseño y reglas de permisos.

## Resultado ejecutado

- `npm run build`: TypeScript y compilación de producción correctos.
- `npm test`: **22 pruebas aprobadas** (7 de dominio, 15 sobre migraciones PostgreSQL/PGlite con roles y RLS).
- `npm run test:e2e`: **8 pruebas aprobadas**, Chromium escritorio y Chromium con dimensiones Pixel 7. El segundo es emulación de tamaño/dispositivo, no una prueba física Android.
- `npm run test:connected`: **7 pruebas aprobadas** contra Supabase local real, incluyendo recorrido en navegador, Auth, RLS con JWT, protección HTTP de archivos, concurrencia, invitación y recuperación por enlace local.
- `npm audit`: 0 vulnerabilidades reportadas después de actualizar Vitest.
- Capturas revisables en `docs/previews/`: inicio de escritorio, expediente y vista móvil; contienen solo datos ficticios.

## Casos solicitados y alcance

| Caso                                | Resultado / evidencia                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encontrar paciente por cédula       | Normalización/unicidad y demostración en ambos tamaños; paciente ficticio creado en navegador, recargado y recuperado por su identificación en Supabase local        |
| Recuperar visita de hace un año     | Registro PostgreSQL de 2025 recuperable; nota ficticia de 2025 visible en historial y filtrable                                                                      |
| Nueva sesión sin duplicar paciente  | Se registran tres atenciones del mismo UUID; permanece un paciente en SQL                                                                                            |
| Tres modalidades de tarifa          | Tarifa 1 y 2 configuradas y aplicadas; modificable/gratuita verificada; etiquetas exactas en navegador                                                               |
| Cambio de tarifa preserva histórico | Nueva configuración conserva ₡57.000 guardados en visita; configuración incompleta rechaza creación                                                                  |
| Temporizador recuperado             | Inicio y tiempo restante conservados en Supabase y navegador tras recargar; pausa recuperada en otra recarga; continuación/finalización verificadas                  |
| Alertas en dispositivos             | Prueba de audio ejecutada sin error de API en Chromium automatizado. **Audibilidad real, Safari iPhone/iPad y alarma con bloqueo pendientes de ensayo físico**       |
| Efectivo, SINPE y saldo             | Abono efectivo ₡20.000, SINPE ₡37.000 pendiente/confirmado; balance calculado con confirmados                                                                        |
| Duplicados, abonos y exceso         | Reintento con mismo UUID genera un movimiento; confirmación repetida es idempotente; exceso se rechaza con bloqueo por visita                                        |
| Receptor histórico SINPE            | Cambiar catálogo conserva el teléfono copiado en el pago                                                                                                             |
| Devoluciones y anulación            | Movimiento enlazado, motivo obligatorio, auditoría y reapertura de saldo; no se puede editar pago directamente                                                       |
| Día/semana/mes en Costa Rica        | Límite UTC 05:59/06:00, inicio lunes y mes; neto excluye pendientes y descuenta devolución por fecha de recepción                                                    |
| Autoría entre usuarios              | Recepción registra, terapeuta realiza/escribe; pagos y eventos registran actor; cambiar autor inicial se rechaza                                                     |
| Restricción clínica                 | Admin/recepción no leen antecedentes/notas por consultas directas y snapshot con JWT reales; escritura clínica denegada a recepción; clínica no lee pagos            |
| Notas finalizadas                   | Motivo obligatorio, original conservado, conflictos rechazados, no se puede revertir a borrador                                                                      |
| Inactivación                        | Usuario inactivo deja de leer inmediatamente por RLS y se conserva su UUID histórico; protegido último administrador                                                 |
| Restauración                        | Exportación binaria PostgreSQL embebido y carga en segunda instancia conserva pacientes, tres versiones de nota y pagos. **Restauración de Supabase real pendiente** |
| Importación                         | Fechas/procedencia, duplicados, lote transaccional y reintento idempotente verificados en SQL                                                                        |
| Agenda                              | Se rechazan citas superpuestas del mismo terapeuta                                                                                                                   |
| Teclado y móvil                     | Escape, foco de ventana y ausencia de desborde global probados; tablas permiten desplazamiento local                                                                 |

Las 22 pruebas de dominio/PGlite siguen usando identidades de prueba controladas. Las pruebas conectadas adicionales sí ejercen Auth/JWT, API, RLS y Edge Function de Supabase local. No verifican SMTP remoto, restauración de un proveedor o dispositivos Apple físicos. No se realizan verificaciones bancarias automáticas.

## Aceptación en el entorno del centro

1. Configurar proyecto, aplicar cinco migraciones, prohibir signup público y probar rechazo de signup mediante API externa, además de ausencia del formulario público.
2. Invitar tres usuarios, aceptar enlaces y crear contraseñas individuales; recuperar una contraseña; probar usuario sin `clinical` por UI **y consulta directa**; comprobar desactivación con token existente.
3. Usar datos ficticios en un entorno separado. Crear paciente, dos terapias en una visita y una sesión con saldo. Abrir en dos dispositivos, pausar/continuar y recargar para comprobar sincronización. Los datos externos se refrescan cada 15 segundos, o inmediatamente con Actualizar.
4. Reintentar el mismo pago tras interrupción de red y realizar cobros simultáneos desde dos cuentas: uno debe impedir exceso de saldo. Los tests de esta entrega no simulan la latencia real ni dos conexiones independientes al proveedor.
5. En Chrome real de computadora, Safari iPhone e iPad: tocar Probar sonido, iniciar sesión corta de ensayo cambiando temporalmente marcas de tiempo en entorno de prueba, mantener pantalla activa y escuchar tres tonos repetidos cada 15 segundos; reconocer/silenciar; probar recarga/segundo dispositivo. No cambiar duraciones productivas 30/60 para este ensayo.
6. Repetir con pestaña en segundo plano y pantalla bloqueada, registrar versión del navegador, OS, volumen, modo silencio y comportamiento. La suspensión/bloqueo puede impedir audio. No ofrecer alarma garantizada; usar temporizador físico si es necesario.
7. Obtener backup del proveedor, restaurar en entorno aislado y comparar identificaciones, conteos, versiones, montos netos, RLS y autoría. No restaurar sobre producción durante un ensayo.
8. Responsable aprueba tarifas, nombres/roles, consentimiento/aviso, conservación, procedimiento de solicitudes y uso de dictado del dispositivo. Documentar decisiones y fecha.

## Limitaciones conocidas

- Se entregó una versión funcional local; no un despliegue compartido externo ni banco conectado. SINPE es registro/verificación humana.
- Sin archivos de expediente, factura electrónica, costos/gastos, conciliación bancaria o recordatorios activos.
- CSV importa pacientes únicamente; XLSX requiere exportación previa y no se importan visitas/notas históricas automáticamente.
- Respaldo local probado; scripts pg_dump y restauración del proveedor requieren PostgreSQL CLI, configuración y ensayo real.
- Solo memoria para expedientes; offline no permite guardar. Un borrador no confirmado se pierde si se cierra la página.
- Snapshot completo permitido por RLS es adecuado para volumen inicial; paginar y agregar en servidor al crecer. Evita la truncación silenciosa de reportes por límites de filas de REST.
- No se hizo una auditoría de accesibilidad WCAG completa ni certificación legal.

El recolector técnico opcional Vector/Logflare se deshabilitó en el entorno local: Docker Desktop resolvía su conexión al daemon mediante una dirección IPv6 inaccesible. El arranque local excluye estos servicios. Esto no afecta los registros de auditoría de la aplicación en PostgreSQL. No se verificó un servicio externo de recopilación de logs.

## Intento de conexión a nube — 1 octubre 2026

Destino solicitado: SistemaTerapias. La CLI devuelve «Access token not provided» al listar proyectos. No se pudo verificar referencia, URL, tablas, políticas, historial ni integración GitHub del destino. La configuración administrativa privada sigue sin completar. No se cambiaron conexiones, no se aplicaron migraciones remotas y no se crearon registros remotos. Los resultados locales anteriores no acreditan pruebas en la nube. Pendientes: iniciar sesión mediante `npx supabase login`, inspeccionar/respaldar el destino, reconciliar migraciones, desplegar función y Auth, comprobar persistencia/RLS con datos de prueba propios y limpiarlos. SMTP externo, restauración del proveedor y audio físico Safari siguen pendientes.
