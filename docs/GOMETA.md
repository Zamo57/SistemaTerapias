# Autocompletado por cédula física

Implementado exclusivamente con GoMeta. El servicio es externo, no pertenece al TSE y sugerir un nombre no verifica la identidad del paciente. Revisar sus datos antes de guardar. La consulta solo admite nueve dígitos; DIMEX y pasaportes mantienen captura manual. No se envían antecedentes, notas ni contacto al proveedor.

## Funcionamiento

El formulario espera 400 ms, solicita `GET /api/cedula/:cedula` con JWT y clave pública. Vite redirige al backend configurado; Vercel tiene una reescritura al proyecto SistemaTerapias. No es un servidor nuevo. La Edge Function `cedula` verifica Auth y `staff()` (incluye el estado activo); busca primero el documento en pacientes usando RLS del invocador. Si existe devuelve 409 con su id, ofrece abrir la ficha y no consulta el proveedor. La restricción única de pacientes también evita duplicados por carreras al guardar.

Una caché persistente privada de menos de 30 días devuelve solo cédula, nombre, dos apellidos, fuente y fecha de consulta interna. Sin caché vigente se llama desde el backend a `https://apis.gometa.org/cedulas/<cedula>`, con timeout de ocho segundos y sin reintentos. Se selecciona exactamente el resultado cuya `cedula` coincide, nunca el primer resultado por posición. Se utilizan `firstname1`, `firstname2` (o `firstname`), `lastname1` y `lastname2`, campos presentes en la muestra. `fullname` y el `nombre` superior no se dividen. Si solo están los apellidos juntos se usa un parser conservador; divisiones ambiguas se dejan para revisión manual.

Los campos anteriores sin nombre dividido mantienen su nombre completo; la migración agrega columnas opcionales y no transforma los expedientes existentes. Autocompletar no guarda un paciente. Los tres campos son editables; respuestas atrasadas no sobrescriben ediciones humanas ni datos de otro documento. La demostración no realiza consultas externas.

## Límites y privacidad

PostgreSQL serializa reservas mediante una fila bloqueada: máximo 20 llamadas externas por ventana deslizante de cinco minutos **en todo el proyecto**, además de 20 solicitudes por minuto por usuario activo, incluso para caché y pacientes existentes. Varias instancias comparten los mismos contadores. Una reserva por cédula agrupa consultas simultáneas; quien espera solo lee el estado, sin consumir otra llamada. La reserva expira a los 30 segundos si muere la instancia. Fallos se comparten durante cinco segundos, sin almacenarlos como resultados exitosos.

Un 429 del proveedor bloquea nuevas llamadas externas globalmente según `Retry-After` (segundos o fecha); sin cabecera se esperan cinco minutos. La caché vigente sigue disponible. No se rotan IP. El límite del proyecto no puede controlar tráfico de otros clientes de Supabase que puedan compartir una IP de salida; el 429 del proveedor activa el bloqueo adicional. [Límite documentado por GoMeta](https://apis.gometa.org/cedulas/).

Las cuatro tablas auxiliares tienen RLS y carecen de permisos para anon/authenticated. Solo el backend con service_role puede leer caché o ejecutar las reservas. Los logs propios incluyen motivo, estado y duración, sin identificación, nombres ni JSON original. Los errores del proxy Vite ocultan identificaciones en su texto. No hay claves nuevas del proveedor, ninguna clave administrativa en VITE ni acceso masivo desde el navegador. Las cédulas son necesarias en las URLs solicitadas: el responsable debe revisar además la conservación de logs de acceso del alojamiento/proveedor, sobre la que este código no tiene control.

## Muestra y verificaciones

`docs/respuestas-ejemplo.json` conserva la estructura y tipos de la consulta ejecutada por el propietario. Nombres, identificaciones, situación fiscal y datos auxiliares fueron sustituidos; también un campo auxiliar que repetía un apellido. Se conservaron solo valores técnicos necesarios. `000000000` es un marcador para mocks, nunca una consulta real. El archivo temporal original se eliminó después de comparar los valores personales. El script de captura usa UTF-8 con BOM para mostrar tildes correctamente también en Windows PowerShell.

Pasaron 50 pruebas unitarias/PostgreSQL, 22 de interfaz (escritorio/móvil), siete del flujo local conectado y comprobaciones de la nueva Edge Function con Auth real tanto local como remoto. Las pruebas del proveedor son **simuladas**, no un ensayo live adicional de GoMeta. Los ensayos reales de funciones usan caché ficticia y no consumen el proveedor; se limpian sus propios registros. No consultar números ficticios al servicio público.

## Probar localmente

1. Mantener Docker activo, ejecutar `npm run local:start`. Guardar la configuración remota de `.env.local` en un archivo privado de `.local` antes de alternar.
2. Para base nueva, `npm run local:setup`; para el entorno conservado puede copiarse `.local/env-local-before-cloud` a `.env.local`. La migración 006 ya se aplicó al Docker de este equipo y está registrada en su historial. En una instalación existente distinta aplicar las migraciones locales pendientes con `npx supabase migration up --local`, sin reset ni borrados.
3. Ejecutar `npm run local:functions` y `npm run dev:local` en terminales separadas. Abrir http://localhost:5174 e ingresar con una cuenta local privada de `.local/test-accounts.json`.
4. `npm test`, `npm run test:e2e`, `npm run test:cedula:local` verifican mocks, PostgreSQL, interfaz y función real con caché ficticia. El último comando rechaza destinos remotos por defecto. `npm run test:connected` prueba el flujo de atención con consultas de cédula interceptadas para evitar enviar números ficticios.
5. Para probar datos live usar exclusivamente la propia cédula o una consulta autorizada, nunca los marcadores de prueba. Pacientes → Nuevo paciente: escribir nueve dígitos, revisar sugerencia o abrir ficha existente. Cambiar campos manualmente, guardar solo después de revisar. El script `scripts/obtener-muestra-gometa.ps1` es para capturar otra muestra privada, no es necesario para el flujo normal.
6. Restaurar el archivo privado de configuración remota a `.env.local` y reiniciar Vite al terminar.

## Estado del despliegue

Migración 006 y función cedula activas en Docker **y** en `onyonqjatljkbytdxjmz`. Antes del cambio remoto se revisó el destino y se guardaron dumps en `backups/gometa-20261001` (fuera de Git). No se ejecutó reset ni se trasladaron fixtures locales. La aplicación de este equipo conserva su conexión remota en http://localhost:5174; publicar el frontend HTTPS sigue siendo una tarea distinta. Cuentas reales y SMTP, restauración del proveedor y audio en dispositivos Safari permanecen pendientes.
