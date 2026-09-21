"""
backup.py — Backup automático semanal de PostgreSQL para doce-escalones.

Uso manual:   python scripts/backup.py
Uso automático: añadir al Programador de tareas de Windows (ver abajo)

Guarda backups en: backups/doce_escalones_YYYY-MM-DD.sql.gz
Conserva los últimos 8 backups (2 meses), borra los más antiguos.
"""
import os
import sys
import gzip
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

# ── Configuración ─────────────────────────────────────────────────────────────
# Lee del .env si existe, o usa valores por defecto de docker-compose
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"

def leer_env() -> dict:
    env = {
        "POSTGRES_HOST":     "localhost",
        "POSTGRES_PORT":     "5432",
        "POSTGRES_DB":       "doce_escalones",
        "POSTGRES_USER":     "doce_user",
        "POSTGRES_PASSWORD": "doce_pass",
    }
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def hacer_backup() -> Path:
    cfg = leer_env()
    backup_dir = ROOT / "backups"
    backup_dir.mkdir(exist_ok=True)

    fecha = datetime.now().strftime("%Y-%m-%d_%H-%M")
    nombre = backup_dir / f"doce_escalones_{fecha}.sql.gz"

    print(f"[backup] Iniciando backup → {nombre.name}")

    env_proceso = os.environ.copy()
    env_proceso["PGPASSWORD"] = cfg["POSTGRES_PASSWORD"]

    # pg_dump genera SQL plano; lo comprimimos con gzip en streaming
    cmd_dump = [
        "pg_dump",
        "-h", cfg["POSTGRES_HOST"],
        "-p", cfg["POSTGRES_PORT"],
        "-U", cfg["POSTGRES_USER"],
        "-d", cfg["POSTGRES_DB"],
        "--no-password",
        "--format=plain",
        "--encoding=UTF8",
    ]

    try:
        resultado = subprocess.run(
            cmd_dump,
            capture_output=True,
            env=env_proceso,
        )
    except FileNotFoundError:
        print("[backup] ERROR: pg_dump no encontrado.")
        print("         Instala PostgreSQL client tools o añade su carpeta al PATH.")
        print("         Ruta típica: C:\\Program Files\\PostgreSQL\\16\\bin")
        sys.exit(1)

    if resultado.returncode != 0:
        err = resultado.stderr.decode("utf-8", errors="replace")
        print(f"[backup] ERROR en pg_dump:\n{err}")
        sys.exit(1)

    # Comprimir y guardar
    with gzip.open(nombre, "wb") as f:
        f.write(resultado.stdout)

    tamanio_kb = nombre.stat().st_size // 1024
    print(f"[backup] OK — {tamanio_kb} KB comprimidos")

    return nombre

def limpiar_backups_antiguos(mantener: int = 8):
    backup_dir = ROOT / "backups"
    backups = sorted(backup_dir.glob("doce_escalones_*.sql.gz"), reverse=True)
    sobrantes = backups[mantener:]
    for f in sobrantes:
        f.unlink()
        print(f"[backup] Eliminado backup antiguo: {f.name}")
    if sobrantes:
        print(f"[backup] {len(sobrantes)} backup(s) antiguo(s) eliminados")

if __name__ == "__main__":
    print(f"[backup] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} — doce-escalones backup")
    archivo = hacer_backup()
    limpiar_backups_antiguos(mantener=8)
    print(f"[backup] Completado: {archivo}")
