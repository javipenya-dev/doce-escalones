"""
Servicio de monitorización de discos.

Detecta el uso de todos los discos/particiones montados (Windows, Linux, USB)
y avisa por email si alguno supera los umbrales.

- 80% → AVISO
- 90% → URGENTE
"""
import os
import platform
from datetime import datetime, timedelta
from typing import Optional

try:
    import psutil
    PSUTIL_DISPONIBLE = True
except ImportError:
    PSUTIL_DISPONIBLE = False

from app.services import backup_service


# ── Umbrales ─────────────────────────────────────────────────
UMBRAL_AVISO   = 80.0   # %
UMBRAL_URGENTE = 90.0   # %
HORAS_ENTRE_AVISOS = 23  # evitar spamear (1 email/día como máximo)


# ── Detección de discos ──────────────────────────────────────

def _listar_discos() -> list[dict]:
    """
    Devuelve lista de discos montados con info básica:
    [{'nombre': 'C:', 'mountpoint': 'C:\\', 'tipo': 'fixed'}, ...]
    """
    discos = []

    if not PSUTIL_DISPONIBLE:
        # Fallback: solo C: en Windows o / en Linux
        if platform.system() == "Windows":
            discos.append({'nombre': 'C:', 'mountpoint': 'C:\\', 'tipo': 'fixed'})
        else:
            discos.append({'nombre': '/', 'mountpoint': '/', 'tipo': 'fixed'})
        return discos

    for part in psutil.disk_partitions(all=False):
        # Saltar CD/DVD y unidades sin tipo
        if 'cdrom' in part.opts or not part.fstype:
            continue
        # Saltar snap en Linux (Raspberry)
        if part.mountpoint.startswith('/snap'):
            continue

        # Nombre amigable
        if platform.system() == "Windows":
            nombre = part.device.rstrip('\\')   # "C:\\" → "C:"
        else:
            nombre = part.mountpoint

        discos.append({
            'nombre': nombre,
            'mountpoint': part.mountpoint,
            'tipo': part.fstype or 'unknown',
        })

    return discos


def obtener_uso_discos() -> list[dict]:
    """
    Devuelve uso de cada disco:
    [{'nombre': 'C:', 'total_gb': 500, 'usado_gb': 420, 'libre_gb': 80,
      'porcentaje': 84.0, 'estado': 'aviso'}, ...]
    """
    resultado = []

    for disco in _listar_discos():
        try:
            uso = psutil.disk_usage(disco['mountpoint']) if PSUTIL_DISPONIBLE else None
            if not uso:
                # Fallback sin psutil
                import shutil
                uso = shutil.disk_usage(disco['mountpoint'])

            pct = round((uso.used / uso.total) * 100, 1)

            if pct >= UMBRAL_URGENTE:
                estado = 'urgente'
            elif pct >= UMBRAL_AVISO:
                estado = 'aviso'
            else:
                estado = 'ok'

            resultado.append({
                'nombre':      disco['nombre'],
                'total_gb':    round(uso.total / (1024**3), 1),
                'usado_gb':    round(uso.used  / (1024**3), 1),
                'libre_gb':    round(uso.free  / (1024**3), 1),
                'porcentaje':  pct,
                'estado':      estado,
            })
        except (PermissionError, OSError):
            continue

    return resultado


# ── Control de spam ──────────────────────────────────────────

ESTADO_FILE = os.path.join(backup_service.BACKUP_DIR, "disk_monitor.state")


def _leer_ultimo_aviso() -> Optional[datetime]:
    if not os.path.exists(ESTADO_FILE):
        return None
    try:
        with open(ESTADO_FILE, 'r') as f:
            contenido = f.read().strip()
            return datetime.fromisoformat(contenido)
    except Exception:
        return None


def _guardar_ultimo_aviso():
    try:
        with open(ESTADO_FILE, 'w') as f:
            f.write(datetime.now().isoformat())
    except Exception:
        pass


def _puede_avisar() -> bool:
    ultimo = _leer_ultimo_aviso()
    if ultimo is None:
        return True
    return datetime.now() - ultimo > timedelta(hours=HORAS_ENTRE_AVISOS)


# ── Comprobación principal ───────────────────────────────────

def verificar_y_alertar() -> dict:
    """
    Comprueba todos los discos. Si alguno supera el 80%, envía email
    (respetando el límite de 1 aviso cada 23h). Siempre escribe en el log.
    """
    from app.services.email_service import enviar_alerta_disco

    discos = obtener_uso_discos()
    if not discos:
        backup_service._log("[disk] Sin discos detectados para monitorizar")
        return {'total': 0, 'alertados': 0, 'discos': []}

    discos_con_problema = [d for d in discos if d['estado'] in ('aviso', 'urgente')]

    # Log siempre (aunque no haya problema)
    resumen = ", ".join(f"{d['nombre']}: {d['porcentaje']}%" for d in discos)
    if discos_con_problema:
        backup_service._log(f"[disk] ⚠️  Discos con espacio bajo → {resumen}")
    else:
        backup_service._log(f"[disk] ✅ Todos los discos OK → {resumen}")

    if not discos_con_problema:
        return {'total': len(discos), 'alertados': 0, 'discos': discos}

    # Solo enviamos 1 email al día máximo
    if not _puede_avisar():
        backup_service._log("[disk] (aviso omitido — ya se envió uno en las últimas 23h)")
        return {'total': len(discos), 'alertados': 0, 'discos': discos, 'motivo': 'spam_guard'}

    # Enviar email
    hay_urgente = any(d['estado'] == 'urgente' for d in discos_con_problema)
    ok, error = enviar_alerta_disco(discos=discos_con_problema, urgente=hay_urgente)

    if ok:
        _guardar_ultimo_aviso()
        backup_service._log(f"[disk] 📧 Email de alerta enviado ({len(discos_con_problema)} discos)")
        return {'total': len(discos), 'alertados': len(discos_con_problema), 'discos': discos}

    backup_service._log(f"[disk] ❌ Error al enviar email de alerta: {error}")
    return {'total': len(discos), 'alertados': 0, 'error': error, 'discos': discos}