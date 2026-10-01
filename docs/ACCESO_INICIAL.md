# Primera cuenta y prueba privada del formulario

Usar el flujo administrativo existente, sin registro público ni contraseñas compartidas. `config/team.json` y `.env.admin.local` son privados, excluidos de Git y HTTP. Completar nombre y correo del primer integrante; el permiso `admin` no incluye notas clínicas ni necesita agregarse `clinical` para probar la consulta de identificación.

`npm run team:first:check` valida exclusivamente esa primera identidad, sin crear ni enviar. `npm run team:first:invite` crea su invitación y perfil usando la credencial de servidor existente. No exige inventar las otras dos personas. Si ya existe una cuenta administrativa diferente, se detiene: las siguientes altas deben usar el flujo normal autenticado. Si una identidad ya existe, se conservan su contraseña y permisos. Un alta parcial exige revisar Auth/perfil antes de reintentar.

El origen de retorno de producción es https://sistematerapias.terapia.workers.dev. Cada persona define su propia contraseña. En desarrollo local se usa http://localhost:5174 y se mantiene separado. La URL del backend sigue siendo https://onyonqjatljkbytdxjmz.supabase.co.

La inspección de configuración no mostró ajustes SMTP personalizados. Esto no acredita una entrega ni un bloqueo concreto: hay que intentar la invitación al correo autorizado y comprobar recepción. El servicio SMTP predeterminado de Supabase solo entrega a miembros del equipo del proyecto y tiene límites bajos; para otros destinatarios se requiere configurar un proveedor SMTP (host, puerto, credenciales y remitente verificado) en Authentication → Email → SMTP Settings. Esas credenciales se introducen en el panel, nunca en el chat o frontend. No deshabilitar Auth, confirmación de correo ni habilitar signup como alternativa. [SMTP oficial](https://supabase.com/docs/guides/auth/auth-smtp).

## Prueba con la propia cédula

1. Ingresar en la URL pública con la contraseña definida mediante invitación. Pacientes → Nuevo paciente. No elegir demostración.
2. Escribir la propia cédula física de nueve dígitos. Si está registrada se ofrece abrir la ficha; no se crea un duplicado. Si es nueva, esperar el resultado.
3. **«Respuesta recibida de GoMeta en esta consulta»** identifica una nueva respuesta externa exitosa. **«Datos de caché (fuente GoMeta). No se consultó el proveedor»** identifica un resultado almacenado. La fuente original de ambos sigue siendo GoMeta; la cabecera no personal `X-Consulta-Origen` distingue el camino empleado.
4. Revisar el nombre y editar temporalmente un campo para comprobar que permanece editable. No pulsar Guardar paciente. Cerrar el formulario descarta esos cambios y no crea una ficha.
5. Abrir nuevamente Nuevo paciente y escribir la misma cédula. Si el primer resultado fue exitoso, debe indicar caché. Si el primero falló o no encontró datos, no se guarda como éxito y no se puede afirmar que la segunda consulta provenga de caché.
6. Comunicar solo si aparecieron los mensajes y si la edición funcionó, sin enviar cédula, nombre, contraseña, enlace de invitación o capturas con datos. La comprobación adicional puede comparar conteos de consultas externas y caché sin leer sus valores personales. Una consulta de caché no debe incrementar el contador externo.

Las pruebas automatizadas de estos mensajes son mocks. La prueba personal live sigue pendiente hasta disponer del acceso y ejecutarla. No guardar automáticamente pacientes ni copiar información personal a documentación o Git.
