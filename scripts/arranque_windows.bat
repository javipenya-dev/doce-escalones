@echo off
:: ============================================================
:: arranque_windows.bat
:: Arranca doce-escalones al encender el PC (docker-compose up)
::
:: INSTALACIÓN:
::   1. Abre el Programador de tareas de Windows
::   2. Crear tarea básica → "doce-escalones arranque"
::   3. Desencadenador: Al iniciar sesión
::   4. Acción: Iniciar programa → esta ruta completa del .bat
::   5. Marcar "Ejecutar con los privilegios más altos"
:: ============================================================

echo [doce-escalones] Arrancando servicios...

:: Ir a la carpeta del proyecto (ajusta esta ruta)
cd /d "%~dp0.."

:: Esperar 10 segundos a que Docker Desktop haya iniciado
timeout /t 10 /nobreak > nul

:: Arrancar contenedores en segundo plano
docker-compose up -d

if %errorlevel% == 0 (
    echo [doce-escalones] OK — servicios arrancados
) else (
    echo [doce-escalones] ERROR al arrancar. Comprueba que Docker Desktop esta en ejecucion.
    pause
)
