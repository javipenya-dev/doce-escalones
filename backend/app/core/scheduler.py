"""
Scheduler simple en un hilo de background.

- Backup diario a las 03:00
- Monitorización de discos a las 08:00
- Rotación automática de backups >30 días
"""
import threading
import time
from datetime import datetime, timedelta

from app.services import backup_service, disk_monitor_service
from app.services.email_service import enviar_alerta_backup_fallido

_hilo: threading.Thread | None = None
_activo = False

HORA_BACKUP   = 3
MINUTO_BACKUP = 0
HORA_DISCO    = 8
MINUTO_DISCO  = 0


def _segundos_hasta(hora: int, minuto: int) -> tuple[float, datetime]:
    ahora = datetime.now()
    proxima = ahora.replace(hour=hora, minute=minuto, second=0, microsecond=0)
    if proxima <= ahora:
        proxima += timedelta(days=1)
    return (proxima - ahora).total_seconds(), proxima


def _loop_backup():
    """Bucle que ejecuta el backup diario."""
    while _activo:
        segundos, proxima = _segundos_hasta(HORA_BACKUP, MINUTO_BACKUP)
        print(f"[scheduler] 💾 Próximo backup automático: {proxima.strftime('%d/%m/%Y %H:%M')}")

        while _activo and segundos > 5:
            time.sleep(min(60, segundos))
            segundos, _ = _segundos_hasta(HORA_BACKUP, MINUTO_BACKUP)
            if segundos > 86000:
                break

        if not _activo:
            break

        print("[scheduler] ▶ Ejecutando backup automático...")
        ok, resultado = backup_service.crear_backup('auto')

        if ok:
            backup_service.rotar_backups_auto()
        else:
            try:
                enviar_alerta_backup_fallido(
                    error=str(resultado),
                    fecha=datetime.now().strftime('%d/%m/%Y %H:%M'),
                )
                print("[scheduler] 📧 Email de alerta enviado")
            except Exception as e:
                print(f"[scheduler] ⚠️  No se pudo enviar el email: {e}")

        time.sleep(60)


def _loop_disco():
    """Bucle que revisa el espacio en disco cada día a las 08:00."""
    while _activo:
        segundos, proxima = _segundos_hasta(HORA_DISCO, MINUTO_DISCO)
        print(f"[scheduler] 💽 Próxima revisión de discos: {proxima.strftime('%d/%m/%Y %H:%M')}")

        while _activo and segundos > 5:
            time.sleep(min(60, segundos))
            segundos, _ = _segundos_hasta(HORA_DISCO, MINUTO_DISCO)
            if segundos > 86000:
                break

        if not _activo:
            break

        print("[scheduler] ▶ Comprobando espacio en discos...")
        try:
            resultado = disk_monitor_service.verificar_y_alertar()
            print(f"[scheduler] ✔ Discos: {resultado}")
        except Exception as e:
            print(f"[scheduler] ⚠️  Error al monitorizar discos: {e}")

        time.sleep(60)


_hilos: list[threading.Thread] = []


def iniciar():
    global _hilos, _activo
    if _activo:
        return
    _activo = True
    _hilos = [
        threading.Thread(target=_loop_backup, daemon=True, name='backup-scheduler'),
        threading.Thread(target=_loop_disco,  daemon=True, name='disk-scheduler'),
    ]
    for h in _hilos:
        h.start()
    print(f"[scheduler] ✅ Backup automático activo — diario a las {HORA_BACKUP:02d}:{MINUTO_BACKUP:02d}")
    print(f"[scheduler] ✅ Monitor de discos activo — diario a las {HORA_DISCO:02d}:{MINUTO_DISCO:02d}")


def parar():
    global _activo
    _activo = False