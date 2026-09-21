# ============================================================
# arranque_windows.ps1
# Version PowerShell del arranque automatico.
# Mas robusta: espera a que Docker este listo antes de continuar.
#
# INSTALACIÓN:
#   1. Abre el Programador de tareas de Windows
#   2. Crear tarea → Desencadenador: Al iniciar sesion
#   3. Acción: powershell.exe -WindowStyle Hidden -File "ruta\arranque_windows.ps1"
#   4. Marcar "Ejecutar con los privilegios mas altos"
#   5. En "Condiciones", desmarcar "Solo si hay conexion de red AC"
# ============================================================

$logFile = "$PSScriptRoot\..\logs\arranque.log"
$projectDir = Resolve-Path "$PSScriptRoot\.."

# Crear carpeta de logs si no existe
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\..\logs" | Out-Null

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Tee-Object -FilePath $logFile -Append
}

Write-Log "=== doce-escalones arranque ==="
Write-Log "Directorio: $projectDir"

# Esperar a que Docker Desktop este listo (max 60 segundos)
Write-Log "Esperando a Docker Desktop..."
$intentos = 0
do {
    Start-Sleep -Seconds 5
    $intentos++
    $dockerOk = (docker info 2>$null) -ne $null
} while (-not $dockerOk -and $intentos -lt 12)

if (-not $dockerOk) {
    Write-Log "ERROR: Docker Desktop no responde tras 60s. Abortando."
    exit 1
}

Write-Log "Docker listo. Arrancando contenedores..."

Set-Location $projectDir
$resultado = docker-compose up -d 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Log "OK — contenedores arrancados correctamente"
    Write-Log "Panel web disponible en: http://localhost:3000"
} else {
    Write-Log "ERROR al arrancar:"
    Write-Log $resultado
    exit 1
}
