# Enlaces de autenticación en producción

La aplicación pública actual es:

`https://sistematerapias.christianzamora5732-0d2.workers.dev`

Los enlaces de invitación salen de la función `invite-user`, que fija `APP_ORIGIN` en esa URL. Recuperación y cambio de contraseña utilizan `VITE_PUBLIC_APP_URL`; al completar la contraseña el frontend vuelve al flujo normal de inicio de sesión. No se usa una ruta `/auth/callback`: Supabase procesa el hash en la página raíz.

El entorno local conserva `http://localhost:5174` en `.env.local`, `supabase/config.toml` y las configuraciones de Playwright. Esas referencias sirven únicamente para Docker, Edge Functions locales y pruebas; no deben copiarse a los secretos ni variables del despliegue de Cloudflare.

Si Cloudflare cambia el subdominio, actualizar en una misma ventana de despliegue:

1. `VITE_PUBLIC_APP_URL` en las variables de build de Cloudflare.
2. `APP_ORIGIN` en los secretos de la función `invite-user` y `cedula`.
3. `config/team.json` antes de invitar nuevos integrantes.
4. Supabase Dashboard → Authentication → URL Configuration: Site URL y Redirect URLs (`https://NUEVO_HOST/**`).
5. Volver a desplegar el frontend y las funciones, y probar invitación/recuperación desde un iPhone.

No se deben incluir `service_role`, contraseñas SMTP ni otros secretos en `VITE_*`. La publicación del frontend en Cloudflare es independiente de la conexión al proyecto Supabase.

En esta revisión se pudo actualizar Auth y las Edge Functions con la CLI de Supabase. Wrangler no está autenticado en este equipo (`wrangler whoami` solicita `CLOUDFLARE_API_TOKEN`), por lo que el frontend público todavía sirve el bundle anterior hasta que la integración GitHub de Cloudflare procese este commit o se ejecute `npx wrangler deploy` con una sesión local. Configurá `VITE_PUBLIC_APP_URL` en las variables de build de Cloudflare antes del siguiente despliegue.
