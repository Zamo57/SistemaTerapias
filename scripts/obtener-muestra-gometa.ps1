# Ejecutar en terminal propia. La entrada oculta no forma parte del comando ni del historial.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$relativePath = '.local/gometa-respuesta-temporal.json'
$samplePath = Join-Path $projectRoot $relativePath
$secureCedula = $null
$cedula = $null
$pointer = [IntPtr]::Zero
$client = $null
$handler = $null
$response = $null
$deadline = $null
$body = $null
$createdFile = $false
$stage = 'preparación'

try {
    Get-Command git -ErrorAction Stop | Out-Null
    # Un archivo ignorado pero ya versionado seguiría publicándose: comprobar ambos casos.
    & git -C $projectRoot check-ignore --quiet --no-index -- $relativePath 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'exclusión' }
    $tracked = & git -C $projectRoot ls-files -- $relativePath 2>$null
    if ($LASTEXITCODE -ne 0 -or $tracked) { throw 'archivo versionado' }
    if (Test-Path -LiteralPath $samplePath) { throw 'muestra existente' }

    $stage = 'validación'
    $secureCedula = Read-Host 'Ingresá tu propia cédula física (9 dígitos; entrada oculta)' -AsSecureString
    # Convertir únicamente en memoria para la solicitud; liberar el buffer nativo enseguida.
    $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCedula)
    try { $cedula = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $pointer = [IntPtr]::Zero
    }
    if ($cedula -cnotmatch '^[0-9]{9}$') { throw 'entrada inválida' }

    $stage = 'consulta'
    Add-Type -AssemblyName System.Net.Http
    $handler = [System.Net.Http.HttpClientHandler]::new()
    # No reenviar una identificación a otro destino mediante redirecciones.
    $handler.AllowAutoRedirect = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(8)
    $deadline = [System.Threading.CancellationTokenSource]::new(8000)
    $client.DefaultRequestHeaders.Accept.ParseAdd('application/json')
    $response = $client.GetAsync(
        ('https://apis.gometa.org/cedulas/' + $cedula),
        [System.Net.Http.HttpCompletionOption]::ResponseContentRead,
        $deadline.Token
    ).GetAwaiter().GetResult()
    if ([int]$response.StatusCode -eq 429) {
        Write-Host 'Límite temporal de GoMeta alcanzado. No se reintentó ni se guardó una muestra.'
        return
    }
    if (-not $response.IsSuccessStatusCode) { throw 'servicio no disponible' }
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    # Validar JSON sin imprimir ni reserializar: conservar exactamente claves y tipos originales.
    $null = ConvertFrom-Json -InputObject $body -ErrorAction Stop

    $stage = 'guardado'
    # Revalidar la exclusión justo antes de escribir; una respuesta nunca se guarda en docs.
    & git -C $projectRoot check-ignore --quiet --no-index -- $relativePath 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'exclusión' }
    $null = New-Item -ItemType Directory -Path (Split-Path $samplePath) -Force
    $stream = [System.IO.File]::Open($samplePath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $createdFile = $true
    try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($body)
        $stream.Write($bytes, 0, $bytes.Length)
        [Array]::Clear($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
    Write-Host 'Muestra guardada en .local/gometa-respuesta-temporal.json, excluida de Git.'
    Write-Host 'No abras ni pegues la respuesta en el chat. Avisá solamente que ejecutaste el script.'
} catch {
    if ($createdFile -and (Test-Path -LiteralPath $samplePath)) {
        Remove-Item -LiteralPath $samplePath -Force -ErrorAction SilentlyContinue
    }
    # Nunca mostrar la excepción original: podría contener la URL con la cédula o el JSON.
    switch ($stage) {
        'preparación' { Write-Host 'No se realizó la consulta: verificá Git, la exclusión de .local/ y que no exista una muestra anterior.' }
        'validación' { Write-Host 'No se realizó la consulta: ingresá exactamente 9 dígitos, sin espacios ni guiones.' }
        'consulta' { Write-Host 'No se guardó una muestra: timeout de 8 segundos, fallo de conexión o respuesta no válida. No hubo reintentos automáticos.' }
        default { Write-Host 'No se guardó una muestra: no se pudo verificar la exclusión o escribir el archivo privado.' }
    }
    exit 1
} finally {
    if ($null -ne $response) { $response.Dispose() }
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $handler) { $handler.Dispose() }
    if ($null -ne $deadline) { $deadline.Dispose() }
    if ($null -ne $secureCedula) { $secureCedula.Dispose() }
    $cedula = $null
    $body = $null
}
