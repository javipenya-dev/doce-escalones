"""
Servicio de backup y restauración de PostgreSQL.

Estructura en disco:
  backend/media/backups/
    ├── auto/                                    ← Backups automáticos (rotación 30 días)
    │   ├── backup_2026-09-29_03-00.sql.gz
    │   └── ...
    ├── manual/                                  ← Backups manuales (no se borran)
    │   ├── backup_manual_2026-09-29_17-45.sql.gz
    │   └── ...
    └── backup.log                               ← Registro de actividad
"""
import os
import gzip
import shutil
import subprocess
from datetime import datetime, timedelta
from urllib.parse import urlparse
from typing import Optional

from app.core.config import settings


# ── Rutas ────────────────────────────────────────────────────
# backup_service.py está en: backend/app/services/backup_service.py
# Con 3 dirname subimos hasta "backend/"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# BACKUP_DIR configurable desde .env. Si está vacío, usa backend/media/backups/
_backup_dir_env = (settings.BACKUP_DIR or "").strip()
BACKUP_DIR = _backup_dir_env if _backup_dir_env else os.path.join(BASE_DIR, "media", "backups")

AUTO_DIR   = os.path.join(BACKUP_DIR, "auto")
MANUAL_DIR = os.path.join(BACKUP_DIR, "manual")
LOG_FILE   = os.path.join(BACKUP_DIR, "backup.log")

DIAS_RETENCION = 30

os.makedirs(AUTO_DIR,   exist_ok=True)
os.makedirs(MANUAL_DIR, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────

def _parse_db_url() -> tuple[str, int, str, str, str]:
    """Extrae (host, port, user, password, dbname) desde DATABASE_URL."""
    url_str = settings.DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://')
    p = urlparse(url_str)
    return (
        p.hostname or 'localhost',
        p.port or 5432,
        p.username or 'postgres',
        p.password or '',
        (p.path or '/').lstrip('/').split('?')[0],
    )


def _log(msg: str):
    """Escribe una línea en el log + imprímelo por consola."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{timestamp}] {msg}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line)
    except Exception:
        pass
    print(line.rstrip())


# ── Crear backup ─────────────────────────────────────────────

def crear_backup(tipo: str = 'auto') -> tuple[bool, str]:
    """
    Crea un backup comprimido.

    tipo = 'auto'   → guarda en auto/
    tipo = 'manual' → guarda en manual/

    Devuelve (ok, ruta_del_archivo_o_mensaje_de_error).
    """
    if tipo not in ('auto', 'manual'):
        return False, f"Tipo inválido: {tipo}"

    host, port, user, password, dbname = _parse_db_url()
    ahora = datetime.now()

    if tipo == 'auto':
        nombre    = f"backup_{ahora.strftime('%Y-%m-%d_%H-%M')}.sql.gz"
        directorio = AUTO_DIR
    else:
        nombre    = f"backup_manual_{ahora.strftime('%Y-%m-%d_%H-%M')}.sql.gz"
        directorio = MANUAL_DIR

    ruta_sql_temporal = os.path.join(directorio, nombre[:-3])   # sin .gz
    ruta_gz           = os.path.join(directorio, nombre)

    env = os.environ.copy()
    env['PGPASSWORD'] = password

    try:
        # 1) pg_dump a .sql plano
        cmd = [
            'pg_dump',
            '-h', host,
            '-p', str(port),
            '-U', user,
            '-d', dbname,
            '-F', 'p',              # plain text
            '--no-owner',
            '--no-acl',
            '-f', ruta_sql_temporal,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)

        if r.returncode != 0:
            _log(f"❌ BACKUP {tipo.upper()} FALLIDO: pg_dump returncode={r.returncode}")
            _log(f"   stderr: {r.stderr[:500]}")
            return False, r.stderr or f"pg_dump error {r.returncode}"

        # 2) Comprimir a .gz
        with open(ruta_sql_temporal, 'rb') as f_in, gzip.open(ruta_gz, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)

        # 3) Borrar .sql temporal
        try:
            os.remove(ruta_sql_temporal)
        except OSError:
            pass

        size_mb = os.path.getsize(ruta_gz) / (1024 * 1024)
        _log(f"✅ Backup {tipo} OK: {nombre} ({size_mb:.2f} MB)")
        return True, ruta_gz

    except subprocess.TimeoutExpired:
        _log(f"❌ BACKUP {tipo.upper()} FALLIDO: timeout (>5 min)")
        return False, "Timeout al ejecutar pg_dump (>5 min)"
    except FileNotFoundError:
        _log(f"❌ BACKUP {tipo.upper()} FALLIDO: pg_dump no encontrado en PATH")
        return False, "pg_dump no encontrado. ¿Está PostgreSQL client en el PATH?"
    except Exception as e:
        _log(f"❌ BACKUP {tipo.upper()} FALLIDO: {type(e).__name__}: {e}")
        return False, str(e)


# ── Rotación ─────────────────────────────────────────────────

def rotar_backups_auto(dias: int = DIAS_RETENCION) -> list[str]:
    """Borra backups automáticos con más de N días. Devuelve los borrados."""
    limite = datetime.now() - timedelta(days=dias)
    borrados = []

    if not os.path.isdir(AUTO_DIR):
        return borrados

    for f in os.listdir(AUTO_DIR):
        if not f.endswith('.sql.gz'):
            continue
        path = os.path.join(AUTO_DIR, f)
        if not os.path.isfile(path):
            continue

        mtime = datetime.fromtimestamp(os.path.getmtime(path))
        if mtime < limite:
            try:
                os.remove(path)
                borrados.append(f)
            except OSError as e:
                _log(f"⚠️  No se pudo borrar {f}: {e}")

    if borrados:
        _log(f"🧹 Rotación: borrados {len(borrados)} backups > {dias} días")

    return borrados


# ── Listar / Estado ──────────────────────────────────────────

def listar_backups() -> list[dict]:
    """Devuelve la lista de backups (auto + manual) ordenados por fecha desc."""
    out = []

    for tipo, directorio in [('auto', AUTO_DIR), ('manual', MANUAL_DIR)]:
        if not os.path.isdir(directorio):
            continue

        for f in os.listdir(directorio):
            if not f.endswith('.sql.gz'):
                continue
            path = os.path.join(directorio, f)
            if not os.path.isfile(path):
                continue

            stat = os.stat(path)
            out.append({
                'nombre':    f,
                'tipo':      tipo,
                'tamano_mb': round(stat.st_size / (1024 * 1024), 2),
                'fecha':     datetime.fromtimestamp(stat.st_mtime).isoformat(),
                'fecha_str': datetime.fromtimestamp(stat.st_mtime).strftime('%d/%m/%Y %H:%M'),
            })

    out.sort(key=lambda x: x['fecha'], reverse=True)
    return out


def obtener_estado() -> dict:
    """Estado general del sistema de backups."""
    todos = listar_backups()

    auto_bkps   = [b for b in todos if b['tipo'] == 'auto']
    manual_bkps = [b for b in todos if b['tipo'] == 'manual']

    espacio_bytes = sum(b['tamano_mb'] for b in todos) * (1024 * 1024)
    espacio_mb    = round(espacio_bytes / (1024 * 1024), 2)

    # Próxima ejecución: hoy 03:00 o mañana 03:00
    ahora = datetime.now()
    proxima = ahora.replace(hour=3, minute=0, second=0, microsecond=0)
    if proxima <= ahora:
        proxima += timedelta(days=1)

    return {
        'total_backups':      len(todos),
        'auto_count':         len(auto_bkps),
        'manual_count':       len(manual_bkps),
        'espacio_mb':         espacio_mb,
        'retencion_dias':     DIAS_RETENCION,
        'ultimo_backup':      todos[0] if todos else None,
        'proxima_ejecucion':  proxima.isoformat(),
        'proxima_ejecucion_str': proxima.strftime('%d/%m/%Y %H:%M'),
    }


def leer_log(limite: int = 100) -> list[str]:
    """Últimas N líneas del log (más reciente primero)."""
    if not os.path.exists(LOG_FILE):
        return []
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            lineas = f.readlines()
        return [l.strip() for l in lineas[-limite:]][::-1]
    except Exception:
        return []


# ── Restaurar ────────────────────────────────────────────────

def restaurar_backup(ruta_o_gz: str) -> tuple[bool, Optional[str]]:
    """
    Restaura la base de datos desde un .sql o .sql.gz.

    ⚠️ PELIGROSO: sobreescribe los datos actuales. Solo admins.
    """
    if not os.path.exists(ruta_o_gz):
        return False, f"Archivo no encontrado: {ruta_o_gz}"

    host, port, user, password, dbname = _parse_db_url()

    ruta_temporal = ruta_o_gz
    descomprimir  = False

    # Si está comprimido, descomprimimos a temporal
    if ruta_o_gz.endswith('.gz'):
        ruta_temporal = ruta_o_gz[:-3]
        try:
            with gzip.open(ruta_o_gz, 'rb') as f_in, open(ruta_temporal, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
            descomprimir = True
        except Exception as e:
            return False, f"Error al descomprimir: {e}"

    env = os.environ.copy()
    env['PGPASSWORD'] = password

    try:
        cmd = [
            'psql',
            '-h', host,
            '-p', str(port),
            '-U', user,
            '-d', dbname,
            '-f', ruta_temporal,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=600)

        if descomprimir:
            try:
                os.remove(ruta_temporal)
            except OSError:
                pass

        if r.returncode != 0:
            _log(f"❌ RESTAURACIÓN FALLIDA: {r.stderr[:500]}")
            return False, r.stderr

        _log(f"✅ Base de datos restaurada desde {os.path.basename(ruta_o_gz)}")
        return True, None

    except subprocess.TimeoutExpired:
        return False, "Timeout al restaurar (>10 min)"
    except FileNotFoundError:
        return False, "psql no encontrado en PATH"
    except Exception as e:
        _log(f"❌ RESTAURACIÓN FALLIDA: {type(e).__name__}: {e}")
        return False, str(e)


def borrar_backup(nombre: str) -> tuple[bool, Optional[str]]:
    """Borra un backup por nombre (busca en auto/ y manual/)."""
    for directorio in (AUTO_DIR, MANUAL_DIR):
        path = os.path.join(directorio, nombre)
        if os.path.isfile(path):
            try:
                os.remove(path)
                _log(f"🗑️  Backup borrado: {nombre}")
                return True, None
            except OSError as e:
                return False, str(e)
    return False, "Archivo no encontrado"


def obtener_ruta_backup(nombre: str) -> Optional[str]:
    """Devuelve la ruta absoluta de un backup por su nombre."""
    for directorio in (AUTO_DIR, MANUAL_DIR):
        path = os.path.join(directorio, nombre)
        if os.path.isfile(path):
            return path
    return None