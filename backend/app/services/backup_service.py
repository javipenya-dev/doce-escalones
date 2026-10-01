"""
Servicio de backup y restauración de PostgreSQL.

Se guarda el backup en DOS sitios:
  1) LOCAL:  backend/media/backups/                (siempre, rápido)
  2) EXTERNO: valor de BACKUP_DIR en .env (USB)   (si está configurado)

Estructura en cada directorio:
  <dir>/
    ├── auto/                                    ← Backups automáticos (rotación 30 días)
    ├── manual/                                  ← Backups manuales (no se borran)
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
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Directorio LOCAL (siempre). Va dentro del proyecto en backend/media/backups/
LOCAL_BACKUP_DIR = os.path.join(BASE_DIR, "media", "backups")

# Directorio EXTERNO (configurable en .env → normalmente el USB)
_backup_dir_env = (settings.BACKUP_DIR or "").strip()
EXTERNAL_BACKUP_DIR = _backup_dir_env if _backup_dir_env else None

# Lista de directorios donde se guardarán los backups (local + externo si aplica)
BACKUP_DIRS: list[str] = [LOCAL_BACKUP_DIR]
if EXTERNAL_BACKUP_DIR and os.path.abspath(EXTERNAL_BACKUP_DIR) != os.path.abspath(LOCAL_BACKUP_DIR):
    BACKUP_DIRS.append(EXTERNAL_BACKUP_DIR)

# Para compatibilidad hacia atrás con código antiguo que usa BACKUP_DIR
BACKUP_DIR = LOCAL_BACKUP_DIR

DIAS_RETENCION = 30

# Crear carpetas al arrancar
for _d in BACKUP_DIRS:
    try:
        os.makedirs(os.path.join(_d, "auto"),   exist_ok=True)
        os.makedirs(os.path.join(_d, "manual"), exist_ok=True)
    except Exception:
        # Si no se puede crear (ej. USB desenchufado), no rompemos el arranque
        pass


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


def _log(msg: str, directorio: str | None = None):
    """Escribe una línea en el log + imprímelo por consola.
    Si directorio es None, escribe en el log del directorio LOCAL."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{timestamp}] {msg}\n"
    dirs_a_loguear = [directorio] if directorio else BACKUP_DIRS
    for d in dirs_a_loguear:
        try:
            log_file = os.path.join(d, "backup.log")
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(line)
        except Exception:
            pass
    print(line.rstrip())


# ── Crear backup ─────────────────────────────────────────────

def crear_backup(tipo: str = 'auto') -> tuple[bool, str]:
    """
    Crea un backup comprimido y lo guarda en TODOS los directorios configurados
    (local + externo).

    tipo = 'auto'   → guarda en auto/
    tipo = 'manual' → guarda en manual/

    Devuelve (ok, ruta_del_archivo_LOCAL_o_mensaje_de_error).
    """
    if tipo not in ('auto', 'manual'):
        return False, f"Tipo inválido: {tipo}"

    host, port, user, password, dbname = _parse_db_url()
    ahora = datetime.now()

    if tipo == 'auto':
        nombre = f"backup_{ahora.strftime('%Y-%m-%d_%H-%M')}.sql.gz"
        subdir = "auto"
    else:
        nombre = f"backup_manual_{ahora.strftime('%Y-%m-%d_%H-%M')}.sql.gz"
        subdir = "manual"

    # Generamos el dump UNA VEZ en un archivo temporal
    tmp_dir = LOCAL_BACKUP_DIR
    ruta_tmp_sql = os.path.join(tmp_dir, f"_tmp_{nombre[:-3]}")
    ruta_tmp_gz = os.path.join(tmp_dir, f"_tmp_{nombre}")

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
            '-F', 'p',
            '--no-owner',
            '--no-acl',
            '-f', ruta_tmp_sql,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)

        if r.returncode != 0:
            _log(f"❌ BACKUP {tipo.upper()} FALLIDO: pg_dump returncode={r.returncode}")
            _log(f"   stderr: {r.stderr[:500]}")
            return False, r.stderr or f"pg_dump error {r.returncode}"

        # 2) Comprimir a .gz en el archivo temporal
        with open(ruta_tmp_sql, 'rb') as f_in, gzip.open(ruta_tmp_gz, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)

        try:
            os.remove(ruta_tmp_sql)
        except OSError:
            pass

        size_mb = os.path.getsize(ruta_tmp_gz) / (1024 * 1024)

        # 3) Copiar a TODOS los directorios configurados
        destinos_ok = []
        destinos_fallidos = []
        ruta_local = None

        for d in BACKUP_DIRS:
            try:
                destino_dir = os.path.join(d, subdir)
                os.makedirs(destino_dir, exist_ok=True)
                destino = os.path.join(destino_dir, nombre)
                shutil.copy2(ruta_tmp_gz, destino)
                destinos_ok.append(d)
                if os.path.abspath(d) == os.path.abspath(LOCAL_BACKUP_DIR):
                    ruta_local = destino
            except Exception as e:
                destinos_fallidos.append(f"{d}: {e}")

        # Borramos el temporal de trabajo
        try:
            os.remove(ruta_tmp_gz)
        except OSError:
            pass

        if ruta_local is None:
            _log(f"❌ BACKUP {tipo.upper()} FALLIDO: no se pudo guardar en local")
            return False, "No se pudo guardar en el directorio local"

        _log(f"✅ Backup {tipo} OK: {nombre} ({size_mb:.2f} MB) → guardado en {len(destinos_ok)} sitio(s)")
        if destinos_fallidos:
            for f in destinos_fallidos:
                _log(f"   ⚠️  No se pudo guardar en: {f}")

        return True, ruta_local

    except subprocess.TimeoutExpired:
        _log(f"❌ BACKUP {tipo.upper()} FALLIDO: timeout (>5 min)")
        return False, "Timeout al ejecutar pg_dump (>5 min)"
    except FileNotFoundError:
        _log(f"❌ BACKUP {tipo.upper()} FALLIDO: pg_dump no encontrado en PATH")
        return False, "pg_dump no encontrado. ¿Está PostgreSQL client en el PATH?"
    except Exception as e:
        _log(f"❌ BACKUP {tipo.upper()} FALLIDO: {type(e).__name__}: {e}")
        return False, str(e)
    finally:
        # Limpiar temporales si quedaron
        for f in (ruta_tmp_sql, ruta_tmp_gz):
            try:
                if os.path.exists(f):
                    os.remove(f)
            except OSError:
                pass


# ── Rotación ─────────────────────────────────────────────────

def rotar_backups_auto(dias: int = DIAS_RETENCION) -> list[str]:
    """Borra backups automáticos con más de N días en TODOS los directorios."""
    limite = datetime.now() - timedelta(days=dias)
    borrados = []

    for d in BACKUP_DIRS:
        auto_dir = os.path.join(d, "auto")
        if not os.path.isdir(auto_dir):
            continue

        for f in os.listdir(auto_dir):
            if not f.endswith('.sql.gz'):
                continue
            path = os.path.join(auto_dir, f)
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
    """Devuelve la lista de backups (de todos los directorios) sin duplicados,
    ordenados por fecha desc. Cada entrada indica en cuántos sitios está."""
    por_nombre: dict[str, dict] = {}

    for d in BACKUP_DIRS:
        for tipo, subdir in [('auto', 'auto'), ('manual', 'manual')]:
            directorio = os.path.join(d, subdir)
            if not os.path.isdir(directorio):
                continue

            for f in os.listdir(directorio):
                if not f.endswith('.sql.gz'):
                    continue
                path = os.path.join(directorio, f)
                if not os.path.isfile(path):
                    continue

                stat = os.stat(path)
                if f not in por_nombre:
                    por_nombre[f] = {
                        'nombre':    f,
                        'tipo':      tipo,
                        'tamano_mb': round(stat.st_size / (1024 * 1024), 2),
                        'fecha':     datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'fecha_str': datetime.fromtimestamp(stat.st_mtime).strftime('%d/%m/%Y %H:%M'),
                        'ubicaciones': [d],
                    }
                else:
                    if d not in por_nombre[f]['ubicaciones']:
                        por_nombre[f]['ubicaciones'].append(d)

    out = list(por_nombre.values())
    out.sort(key=lambda x: x['fecha'], reverse=True)
    return out


def obtener_estado() -> dict:
    """Estado general del sistema de backups."""
    todos = listar_backups()

    auto_bkps   = [b for b in todos if b['tipo'] == 'auto']
    manual_bkps = [b for b in todos if b['tipo'] == 'manual']

    espacio_mb = round(sum(b['tamano_mb'] for b in todos), 2)

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
        'directorios':        BACKUP_DIRS,
    }


def leer_log(limite: int = 100) -> list[str]:
    """Últimas N líneas del log (más reciente primero) del directorio LOCAL."""
    log_file = os.path.join(LOCAL_BACKUP_DIR, "backup.log")
    if not os.path.exists(log_file):
        return []
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            lineas = f.readlines()
        return [l.strip() for l in lineas[-limite:]][::-1]
    except Exception:
        return []


# ── Restaurar ────────────────────────────────────────────────

def restaurar_backup(ruta_o_gz: str) -> tuple[bool, Optional[str]]:
    """Restaura la base de datos desde un .sql o .sql.gz.
    ⚠️ PELIGROSO: sobreescribe los datos actuales. Solo admins."""
    if not os.path.exists(ruta_o_gz):
        return False, f"Archivo no encontrado: {ruta_o_gz}"

    host, port, user, password, dbname = _parse_db_url()

    ruta_temporal = ruta_o_gz
    descomprimir  = False

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
    """Borra un backup por nombre en TODOS los directorios donde exista."""
    borrado_alguno = False
    for d in BACKUP_DIRS:
        for subdir in ("auto", "manual"):
            path = os.path.join(d, subdir, nombre)
            if os.path.isfile(path):
                try:
                    os.remove(path)
                    borrado_alguno = True
                except OSError as e:
                    return False, str(e)
    if borrado_alguno:
        _log(f"🗑️  Backup borrado: {nombre}")
        return True, None
    return False, "Archivo no encontrado"


def obtener_ruta_backup(nombre: str) -> Optional[str]:
    """Devuelve la ruta absoluta de un backup por su nombre (busca en todos)."""
    for d in BACKUP_DIRS:
        for subdir in ("auto", "manual"):
            path = os.path.join(d, subdir, nombre)
            if os.path.isfile(path):
                return path
    return None