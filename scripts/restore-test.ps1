param([Parameter(Mandatory=$true)][string]$BackupFile,[Parameter(Mandatory=$true)][string]$TestHost,[int]$TestPort=5432,[Parameter(Mandatory=$true)][string]$TestDatabase,[Parameter(Mandatory=$true)][string]$TestUser,[Parameter(Mandatory=$true)][string]$Confirmation)
$ErrorActionPreference='Stop'
if ($Confirmation -ne 'BASE_AISLADA_DE_PRUEBA' -or $TestDatabase -notmatch 'prueba|test|restore|restauracion') { throw 'El destino debe ser una base aislada de prueba explícita.' }
Get-Command pg_restore -ErrorAction Stop | Out-Null
$resolvedBackup=(Resolve-Path -LiteralPath $BackupFile).Path
& pg_restore --host=$TestHost --port=$TestPort --username=$TestUser --dbname=$TestDatabase --no-owner --no-acl --exit-on-error --single-transaction $resolvedBackup
if ($LASTEXITCODE -ne 0) { throw 'La restauración falló y debe investigarse; no se confirma recuperación.' }
Write-Output 'Restauración de prueba terminada. Ejecutar verificaciones de conteos, sumas, RLS y autoría antes de declararla aceptada.'
