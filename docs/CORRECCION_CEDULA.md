# Autocompletado en Cloudflare — 1 de octubre de 2026

Dominio verificado mediante la API de Cloudflare con la cuenta autenticada: `https://sistematerapias.terapia.workers.dev`. Proyecto Supabase: `onyonqjatljkbytdxjmz`.

## Causa reproducida

El frontend pedía `/api/cedula/<documento>` en el mismo dominio. Vite tiene un proxy para esa ruta y `vercel.json` tiene un rewrite, pero Cloudflare no utiliza ninguna de esas configuraciones. La prueba con una identificación ficticia recibió HTTP 200 y HTML de la SPA; el parser JSON fallaba antes de llegar a Supabase. Esto explica que los logs del Gateway no mostraran la función y no acredita una caída de GoMeta.

Además, OPTIONS en la Edge Function respondía `Access-Control-Allow-Origin` con el dominio anterior, incompatible con el origen actual.

## Corrección

- En producción, `src/patientLookup.ts` llama directamente a `${VITE_SUPABASE_URL}/functions/v1/cedula/<documento>` con sesión y clave pública; en desarrollo conserva el proxy de Vite.
- `APP_ORIGIN` remoto se actualizó al dominio actual. La función no tiene fallback al dominio antiguo. JWT y `staff()` siguen verificándose en el servidor.
- La interfaz distingue sesión expirada, permisos, límites, timeout, respuesta no JSON y fallo de servicio. La captura manual permanece disponible.
- No se modificaron tablas, migraciones, SMTP ni la cuenta del propietario. Caché, RLS, cuotas compartidas y límite por usuario se conservan.
- `wrangler.jsonc` permite reproducir el despliegue estático con SPA fallback.

## Verificación ejecutada

51 pruebas unitarias, incluyendo regresión de la URL de producción y timeout simulado; 26 E2E en Chromium escritorio y móvil; compilación TypeScript/Vite.

Prueba adicional desde Chromium abierto en el dominio público: sesiones ficticias temporales con roles recepción, atención y administración; validación de entrada, 401 sin sesión/JWT inválido, caché privada, paciente existente, formulario real autocompletado desde caché y campos editables sin guardar. Se verifica también 403 al inactivar un perfil de prueba. Se limpiaron únicamente los registros creados por la prueba. El contador de solicitudes externas no aumentó: **no se consultó GoMeta**.

Para repetir la comprobación remota sin llamadas externas (requiere configuración administrativa privada, ignorada por Git):

```powershell
$env:VERIFY_PUBLIC_ORIGIN='https://sistematerapias.terapia.workers.dev'
node scripts/verify-cedula-local.mjs --remote
```

Para publicar, usar las variables públicas del proyecto correcto y nunca claves administrativas:

```powershell
$env:VITE_PUBLIC_APP_URL='https://sistematerapias.terapia.workers.dev'
npm run build
npx wrangler deploy
npx supabase functions deploy cedula --project-ref onyonqjatljkbytdxjmz
```

Pendiente: el propietario prueba su propia cédula desde Registro rápido. La interfaz indica «Respuesta recibida de GoMeta» solo cuando hubo consulta externa, y «Datos de caché» cuando no la hubo. Encontrar el nombre no guarda al paciente automáticamente.
