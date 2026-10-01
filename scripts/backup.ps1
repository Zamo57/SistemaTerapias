param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
if (-not $env:PGHOST -or -not $env:PGDATABASE -or -not $env:PGUSER -or -not $env:PGPASSFILE) { throw 'Configurá PGHOST, PGDATABASE, PGUSER y PGPASSFILE protegido.' }
Get-Command pg_dump,pg_restore -ErrorAction Stop | Out-Null
$resolvedDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedDirectory -Force | Out-Null
$backupPath = Join-Path $resolvedDirectory ('centro-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
& pg_dump --format=custom --no-owner --no-acl --file=$backupPath
if ($LASTEXITCODE -ne 0) { throw 'Falló pg_dump; no considerar esta copia como respaldo confirmado.' }
& pg_restore --list $backupPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falló la validación del índice del respaldo.' }
Write-Output ('Copia creada y con índice válido: ' + $backupPath + '. Pendiente cifrado y ensayo de restauración.')
