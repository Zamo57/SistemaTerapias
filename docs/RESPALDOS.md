# Respaldo y restauración

Responsable del centro: asignar una persona titular y otra suplente. Decidir pérdida máxima aceptable y tiempo de recuperación. Punto inicial propuesto: copia diaria, ensayo mensual y después de migraciones importantes; ajustar según volumen. Cifrar respaldos y guardarlos fuera del equipo de atención con acceso limitado. No incluirlos en Git.

Supabase Pro publica respaldos diarios con retención de 7 días; Free no incluye backups automáticos. La copia de base no equivale a respaldo de futuros archivos de Storage. [Respaldos oficiales](https://supabase.com/docs/guides/platform/backups), [planes](https://supabase.com/pricing).

## Ensayo automatizado disponible

`npm test` ejecuta las migraciones reales sobre PostgreSQL embebido, registra pacientes, notas, pagos y auditoría, exporta `dumpDataDir`, crea otra base desde ese respaldo y verifica sus registros. Esta restauración **sí se probó**. No prueba respaldos del proveedor, Auth externo, SMTP ni archivos. El ensayo de restauración del proyecto Supabase real queda pendiente de credenciales/configuración.

## Copia externa para PostgreSQL

Usar PostgreSQL CLI de versión compatible y conexión directa/TLS al proyecto con permisos de respaldo, nunca la clave pública de frontend. Guardar credenciales en un archivo `pgpass` protegido, no en el chat, repositorio o línea de comando. `scripts/backup.ps1` usa variables de conexión `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` y `PGPASSFILE`; genera un dump custom completo y comprueba su índice con pg_restore. La copia incluye información de salud y autenticación; cifrar antes de transferir. El script no programa tareas ni afirma que un backup de producción haya ocurrido.

```powershell
./scripts/backup.ps1 -OutputDirectory 'C:/RespaldoSeguroCentro'
```

## Restaurar en entorno de ensayo

Nunca apuntar al proyecto en uso. Preparar una base PostgreSQL vacía/aislada compatible con las extensiones y roles de Supabase, o usar la restauración oficial en proyecto de ensayo. Con PostgreSQL CLI se puede usar `scripts/restore-test.ps1` con destino explícito y la confirmación textual `BASE_AISLADA_DE_PRUEBA`; falla ante errores y no ejecuta limpieza destructiva. Un dump administrado puede requerir roles/extensiones del proveedor: no ignorar errores ni intentar forzar una restauración parcial en producción.

```powershell
./scripts/restore-test.ps1 -BackupFile 'C:/RespaldoSeguroCentro/centro-FECHA.dump' -TestHost 'localhost' -TestPort 5432 -TestDatabase 'centro_restauracion_prueba' -TestUser 'postgres' -Confirmation 'BASE_AISLADA_DE_PRUEBA'
```

Comparar conteos y sumas de pagos, abrir visita antigua, comprobar versiones de notas, permisos, autoría, tarifa aplicada y temporizador. Registrar fecha de copia/restauración, responsable, resultado y duración, sin contenido clínico. Comprobar Auth y secretos por separado en Supabase; URLs, SMTP, Edge Functions y variables del hosting no forman parte del frontend ni del dump de tablas.

Para incidente real, responsable autoriza restauración, detener escrituras, conservar copia actual antes del cambio, elegir punto de recuperación, seguir procedimiento oficial, verificar totales/roles/atenciones y documentar la pérdida temporal. Eliminar el entorno de ensayo solo después de revisión y autorización.
