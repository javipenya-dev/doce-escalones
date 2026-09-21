# Configurar backup semanal automático en Windows

## Con el Programador de tareas (recomendado)

1. Abre **Programador de tareas** (busca "Task Scheduler" en el menú inicio)
2. Click en **Crear tarea básica...**
3. Nombre: `doce-escalones backup semanal`
4. Desencadenador: **Semanalmente** → elige día y hora (ej. domingo a las 03:00)
5. Acción: **Iniciar un programa**
   - Programa: `python`
   - Argumentos: `scripts/backup.py`
   - Iniciar en: `C:\ruta\a\doce-escalones` ← ajusta esta ruta
6. Finalizar

## Verificar que pg_dump está en el PATH

Abre una terminal y escribe:
```
pg_dump --version
```

Si dice "no se reconoce", añade la carpeta bin de PostgreSQL al PATH:
- `C:\Program Files\PostgreSQL\16\bin`  (ajusta la versión)

## Restaurar un backup

```bash
# Descomprimir y restaurar
gunzip -c backups/doce_escalones_2026-06-15_03-00.sql.gz | psql -h localhost -U doce_user -d doce_escalones
```

O desde PowerShell:
```powershell
$env:PGPASSWORD = "doce_pass"
Get-Content backups\doce_escalones_2026-06-15_03-00.sql.gz | & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U doce_user -d doce_escalones
```
