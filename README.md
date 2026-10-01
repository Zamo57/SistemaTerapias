# Centro · Administración de terapias

Aplicación en español para un centro pequeño en Costa Rica. React + TypeScript + Vite, PostgreSQL y Supabase Auth. La carpeta estaba vacía. No se reutilizó código de otros proyectos.

## Versión funcional de prueba conectada

### Nube solicitada: pendiente de autenticación (1 octubre 2026)

El destino solicitado es **SistemaTerapias**, asociado según el panel del propietario a `Zamo57/SistemaTerapias`. Todavía no se verificaron su referencia ni su URL: `supabase projects list` informa que falta autenticación de la CLI. La sesión del navegador y la autenticación de GitHub no autentican la CLI de Supabase. La aplicación conserva su conexión local; no se ejecutaron migraciones ni pruebas remotas.

Desde una terminal propia en esta carpeta, ejecutar `npx supabase login` y completar el flujo de navegador con la cuenta propietaria. No enviar tokens por chat ni guardarlos en Git. [Autenticación oficial](https://supabase.com/docs/guides/platform/personal-access-tokens).

Antes de desplegar: identificar el proyecto exacto y comprobar su asociación con GitHub; inspeccionar tablas, políticas e historial; respaldar los datos existentes; revisar si la integración GitHub ya aplica migraciones y reconciliar las cinco migraciones locales con el destino. No aplicar la migración inicial sobre tablas existentes sin revisar compatibilidad, ni ejecutar un reset remoto. Conectar el frontend después de esa comprobación; mantener los datos ficticios locales en Docker. Las pruebas remotas deberán crear datos identificados y eliminar únicamente sus propios registros.

Función administrativa, autenticación por invitación, pruebas remotas de persistencia/RLS, cuentas reales, SMTP externo y respaldos del proveedor continúan pendientes. Conectar Supabase cambia el backend; publicar la web requiere además alojamiento y configuración HTTPS.

**Dirección: http://localhost:5174.** Está conectada a Supabase local en Docker (PostgreSQL 17, Auth, API y Edge Functions reales). No pulsar Explorar demostración para probar guardados: ingresar con una cuenta ficticia.

Las tres cuentas de prueba y sus **contraseñas aleatorias distintas** están en `.local/test-accounts.json`, archivo privado excluido de Git y bloqueado por el servidor HTTP. Abrirlo en el editor local. Los correos son `admin.prueba@centro.example`, `terapeuta.prueba@centro.example` y `recepcion.prueba@centro.example`. Administración no tiene permiso clínico; recepción incluye cobros. Ninguna contraseña real o clave privilegiada se publica en esta documentación.

Para reiniciar el entorno, mantener Docker Desktop activo:

```powershell
npm ci
npm run local:start
npm run local:setup
```

Luego, en dos terminales independientes:

```powershell
npm run local:functions
```

```powershell
npm run dev:local
```

`local:start` usa una red Docker del proyecto que publica servicios solo en 127.0.0.1; no modifica otros proyectos. `local:setup` genera `.env.local` y las cuentas ficticias de forma reutilizable, conserva pacientes y contraseñas existentes y solo completa tarifas vacías. Las migraciones se aplican al iniciar una base nueva. Los registros viven en PostgreSQL y su volumen Docker; recargar o cerrar el navegador no los borra. `db reset` reinicializa la base, por lo que no sirve para reiniciar conservando datos.

Solo para prueba local: Tarifa 1 usa ₡31.000/30 min y ₡57.000/60 min; Tarifa 2 usa ₡33.000/30 min y ₡61.000/60 min. Son escenarios ficticios configurables, **no precios confirmados del negocio**. Las migraciones de producción mantienen las tarifas vacías.

Panel local Supabase: http://localhost:54323. Buzón capturador: http://localhost:54324; las invitaciones y recuperaciones de prueba no salen a destinatarios externos. El frontend muestra una franja permanente de prueba con persistencia real. El botón Explorar demostración conserva su modo separado de solo lectura, sin guardar datos.

```powershell
npm run test:connected
```

Ejecuta pruebas contra Auth/API/PostgreSQL/Edge Function locales, con datos ficticios y claves leídas por el proceso de prueba desde `.local/`. Incluye navegador, recargas, notas, tarifas, temporizador, pagos, reportes, RLS, concurrencia, inactivación, invitación y recuperación. Los tokens y contraseñas no se incluyen en trazas de navegador. No se admite un servidor externo para estas pruebas.

## Alta segura de los tres usuarios reales

Está preparada, **no ejecutada**. Editar `config/team.json` (copia privada de `config/team.example.json`): tres nombres, correos, permisos y origen HTTPS real. Cada cuenta puede combinar permisos; asignar `clinical` explícitamente solo a quien deba leer notas. No introducir contraseñas en ese archivo.

1. Preparar el proyecto Supabase compartido y aplicar las migraciones. En el dashboard configurar SMTP, bloquear registro público y permitir el origen HTTPS en Auth.
2. En `.env.admin.local`, ya preparado desde `.env.admin.example`, introducir localmente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Es una credencial administrativa, solo para el script de servidor; nunca usar prefijo VITE ni pegarla en el chat. El archivo está excluido de Git y del acceso HTTP.
3. Ejecutar `npm run team:check`: valida los tres integrantes sin crear cuentas ni enviar correos.
4. Cuando nombres, correos y SMTP estén listos, `npm run team:invite` envía invitaciones y crea sus perfiles. Cada persona abre su enlace y define una contraseña individual. Si una cuenta ya existe, no se reemplazan silenciosamente su contraseña o permisos. Un alta parcial requiere revisión explícita, sin reenviar automáticamente.
5. Para el frontend compartido introducir **solo URL y clave pública** en `.env.local`: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Este archivo local tiene prioridad sobre `.env`; al cambiar a remoto reemplazar su contenido conscientemente y ajustar/eliminar `VITE_ENVIRONMENT_LABEL`. Reiniciar Vite o recompilar el hosting. El script `local:setup` rechaza sobrescribir una configuración que apunte a otro servidor.
6. Desplegar `invite-user` y fijar `APP_ORIGIN` en secretos del servidor si se usarán nuevas invitaciones desde Configuración. Comprobar envío real y recuperación con cada destinatario. Nada de esta prueba local certifica SMTP externo.

La [guía oficial de desarrollo local](https://supabase.com/docs/guides/local-development) sustenta el uso de CLI/Docker y servicios locales. Las claves privilegiadas se usan exclusivamente en los scripts administrativos y la Edge Function; Vite impide servir `.local`, `.env*` y el archivo privado del equipo. Los archivos estáticos de `dist/` no contienen estos archivos.

## Ejecutar

Requisitos: Node 22.9 o superior y npm. Dependencias fijadas en `package-lock.json`.

```powershell
npm ci
npm run dev
```

Abrir la dirección que indique Vite. Sin credenciales muestra configuración y **Explorar demostración**: datos ficticios, solo lectura, exclusivamente en memoria. No equivale a una base de datos operativa. La demostración incluye la visita del miércoles 30/09/2026 a las 10:00 de Costa Rica, antecedentes, notas, terapia, autoría separada y pago en efectivo; también una visita de 2025.

## Configurar la base compartida

1. Crear un proyecto Supabase del centro. Elegir región y responsables conforme a la política de datos del negocio. No se ha creado ni desplegado un proyecto externo desde esta entrega.
2. Copiar `.env.example` a `.env`. Configurar `VITE_SUPABASE_URL` y la clave **pública** `VITE_SUPABASE_ANON_KEY` (anon o publishable). La clave pública está protegida por RLS. Nunca colocar service-role, secret key, contraseñas de PostgreSQL o credenciales SMTP en variables VITE.
3. Aplicar, en orden, los archivos de `supabase/migrations/` en el SQL Editor. Cada migración es transaccional; aplicar una sola vez en un proyecto nuevo. No contiene datos de pacientes ni precios asumidos. Usar historial de migraciones de Supabase CLI en despliegues posteriores.
4. En Auth, deshabilitar **Allow new users to sign up** y acceso anónimo. Mantener email/password para usuarios invitados. Configurar contraseña mínima de 10 caracteres, límites de intentos y confirmación de correo. Configurar Site URL y URLs de redirección con el origen HTTPS final; en desarrollo agregar el origen de Vite. [Configuración oficial](https://supabase.com/docs/guides/auth/general-configuration).
5. Crear el primer usuario en Auth → Users → Add user. Copiar su UUID y ejecutar desde SQL Editor, reemplazando nombre y UUID:

```sql
insert into public.profiles(id,name,permissions)
values ('UUID-REAL-DE-AUTH','Nombre pendiente de confirmar',array['admin','clinical','reception','finance']);
```

Otorgar `clinical` solo si esa persona necesita acceso al expediente clínico. La combinación del ejemplo sirve para poner en marcha; no es obligatoria para un administrador. Crear las otras dos cuentas con permisos individuales, sin usar una contraseña compartida. 6. Configurar SMTP de producción para invitaciones y recuperación. La aplicación permite definir nueva contraseña al recibir un enlace de invitación o recuperación. Probar enlaces reales antes de utilizar expedientes. 7. Para invitar desde la aplicación, desplegar `supabase/functions/invite-user/index.ts` usando Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref REFERENCIA_DEL_PROYECTO
npx supabase secrets set APP_ORIGIN=https://dominio-del-centro.example
npx supabase functions deploy invite-user
```

La función valida el JWT con Auth y consulta el permiso administrativo del usuario; usa la clave privilegiada únicamente en servidor. El origen de redirección se fija en `APP_ORIGIN`, no se acepta del cliente. Supabase proporciona las variables de servidor estándar. Revisar logs sin expedientes ni tokens. [Usuarios e invitaciones](https://supabase.com/docs/guides/auth/users), [contraseñas y recuperación](https://supabase.com/docs/guides/auth/passwords). 8. En Configuración: nombre/color/logo HTTPS, catálogo de terapias, números SINPE, plantillas y tarifas para 30/60 minutos. Tarifa 1 y Tarifa 2 empiezan vacías. ₡57.000 es referencia de una hora, sin asignación automática a ninguna tarifa. No se supone una tarifa de media hora. 9. Reiniciar Vite tras editar `.env`. Ingresar con cada cuenta y ejecutar la lista de aceptación de `docs/VERIFICACIONES.md`.

## Arquitectura y decisiones

La interfaz es una SPA: este sistema interno no requiere posicionamiento web ni renderizado de servidor. React/TypeScript facilita formularios mantenibles y validación de tipos; Vite genera archivos estáticos para hosting HTTPS. [Documentación React](https://react.dev/learn/build-a-react-app-from-scratch). Supabase reduce mantenimiento de autenticación y PostgreSQL; la autorización efectiva reside en RLS y funciones SQL, según la [documentación de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

`src/domain.ts` contiene dinero, fechas de Costa Rica, saldos y reconstrucción de tiempo. `src/data.ts` concentra acceso parametrizado a Supabase y datos ficticios. `src/App.tsx` coordina navegación, lectura y mutaciones; `src/components/` separa expediente, formularios de pacientes, visitas, notas, pagos, reportes, agenda y configuración. `src/AccountPassword.tsx` maneja invitación/recuperación. `src/styles.css` define cristal moderado y diseño adaptable. `supabase/migrations/` define el modelo, políticas y operaciones transaccionales; la función de invitación es la única operación con credencial privilegiada.

La base compartida es la fuente de verdad. El cliente lee un snapshot SQL consistente con RLS, sin truncar reportes a las primeras 1000 filas. Se actualiza después de operaciones y cada 15 segundos en otras pantallas; Actualizar permite consultar de inmediato. No se anuncian cambios como guardados antes de recibir confirmación. Pacientes, antecedentes, sesiones y citas usan versión para detectar conflictos; notas y temporizadores bloquean la visita al mutar. Catálogos/configuración son cambios administrativos simples; coordinar esas ediciones entre administradores.

Los montos son centavos enteros `bigint`, sin multiplicar cantidades con decimales binarios. El máximo por sesión es ₡1.000.000.000. Se admiten dos decimales. Cambios de catálogo no reescriben tarifa, monto o terapias históricos. Un pago usa UUID de idempotencia, restricción única y bloqueo de visita. Las devoluciones enlazan el original; los pagos no se editan ni eliminan desde el cliente. SINPE pendiente no cuenta como cobro.

Las notas se agregan como revisiones inmutables; una nota finalizada exige motivo de corrección y conserva versiones anteriores con RLS clínico. Auditoría registra tabla, ID, actor, operación y hora, sin contenidos clínicos. La autoría inicial de pacientes y atenciones se conserva. Desactivar una cuenta revoca acceso por RLS incluso si su token todavía no expiró.

Se conserva únicamente el token de Auth en `sessionStorage` de la pestaña para sobrevivir recargas; los expedientes no se guardan en localStorage, IndexedDB ni service workers. Cerrar sesión limpia los datos en memoria. No se implementa operación offline: ante desconexión conservar abierta la ventana de notas y reintentar; cerrar una nota no guardada puede perderla. No hay archivos adjuntos ni buckets de almacenamiento; incorporar documentos requiere políticas privadas adicionales.

## Desarrollo y comprobación

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

Las pruebas SQL ejecutan las migraciones reales en PostgreSQL embebido (PGlite), con `auth.uid()` y roles de prueba; no simulan las tablas. `test:e2e` usa la demostración en escritorio/móvil; `test:connected` usa Supabase local real, incluyendo Auth y la Edge Function. La entrega externa de SMTP, el respaldo del proveedor y Safari físico siguen pendientes. Resultados y límites en `docs/VERIFICACIONES.md`.

## Producción y dependencias

Compilar con `npm run build` y publicar `dist/` en hosting HTTPS, con variables públicas configuradas al compilar. `public/_headers` y `vercel.json` incluyen cabeceras para hosts compatibles. Los tres usuarios abren la misma URL y el mismo proyecto Supabase. Configurar permisos del proveedor de hosting y no subir `.env` ni respaldos al repositorio.

Precios consultados el 30/09/2026: Supabase Free USD 0 con cuotas y pausa por inactividad; Pro desde USD 25/mes, con backups diarios retenidos 7 días. El alojamiento, dominio, correo SMTP y exceso de consumo pueden tener costo adicional. No se activaron servicios pagos. [Precios oficiales](https://supabase.com/pricing). Para la operación del centro se debe decidir y probar una estrategia de respaldo independiente; ver `docs/RESPALDOS.md`.

## Entrega por etapas

1. Base y expediente: acceso individual, permisos combinables, pacientes, cédula/DIMEX/pasaporte, antecedentes restringidos, historial y versiones, migraciones/auditoría.
2. Atención y cobros: tres modalidades de tarifa, duración independiente, terapias múltiples, temporizadores persistentes, alertas, efectivo/SINPE, abonos, confirmación y devoluciones.
3. Administración: dashboard, detalle de indicadores, reportes por fechas/profesional/método, exportación financiera sin notas, agenda con reprogramación y detección de choques, importación de **pacientes** por CSV con mapeo/vista previa/duplicados/transacción completa. Excel debe exportarse a CSV UTF-8; no se leen archivos XLSX ni se importan sesiones o notas en esta versión.
4. Planificada, sin activar: comunicaciones oficiales. Ver `docs/ETAPA_4.md`.

Antes de usar datos reales: completar Supabase/SMTP, comprobar recuperación e invitaciones, validar política de privacidad y conservación con el responsable, ejecutar ensayo de respaldo del proveedor y comprobar el sonido en dispositivos reales. No se certifica cumplimiento legal automático. Guía de operación en `docs/GUIA_USO.md`; modelo en `docs/MODELO.md`.
