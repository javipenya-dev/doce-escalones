"""
Scheduler simple en un hilo de background.

- Backup diario a las 03:00 (una sola vez por día)
- Monitorización de discos a las 08:00 (una sola vez por día)
- Rotación automática de backups >30 días
"""
import threading
import time
from datetime import datetime, timedelta

from app.services import backup_service, disk_monitor_service
from app.services.email_service import enviar_alerta_backup_fallido

_activo = False
_hilos: list[threading.Thread] = []

# Guardamos el último día en que se ejecutó cada tarea para no repetirla
_ultimo_backup_dia: "datetime.date | None" = None
_ultimo_disco_dia: "datetime.date | None" = None

HORA_BACKUP   = 3
MINUTO_BACKUP = 0
HORA_DISCO    = 8
MINUTO_DISCO  = 0


def _segundos_hasta(hora: int, minuto: int) -> tuple[float, datetime]:
    """Calcula los segundos que faltan hasta la próxima hora:minuto."""
    ahora = datetime.now()
    proxima = ahora.replace(hour=hora, minute=minuto, second=0, microsecond=0)
    if proxima <= ahora:
        proxima += timedelta(days=1)
    return (proxima - ahora).total_seconds(), proxima


def _loop_backup():
    """Bucle que ejecuta el backup diario (una sola vez por día)."""
    global _ultimo_backup_dia
    while _activo:
        segundos, proxima = _segundos_hasta(HORA_BACKUP, MINUTO_BACKUP)
        print(f"[scheduler] 💾 Próximo backup automático: {proxima.strftime('%d/%m/%Y %H:%M')}")

        while _activo and segundos > 5:
            time.sleep(min(60, segundos))
            if datetime.now() >= proxima:
                break
            segundos, _ = _segundos_hasta(HORA_BACKUP, MINUTO_BACKUP)

        if not _activo:
            break

        hoy = datetime.now().date()
        if _ultimo_backup_dia != hoy:
            print("[scheduler] ▶ Ejecutando backup automático...")
            ok, resultado = backup_service.crear_backup('auto')

            if ok:
                backup_service.rotar_backups_auto()
                _ultimo_backup_dia = hoy
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
    """Bucle que revisa el espacio en disco (una sola vez por día)."""
    global _ultimo_disco_dia
    while _activo:
        segundos, proxima = _segundos_hasta(HORA_DISCO, MINUTO_DISCO)
        print(f"[scheduler] 💽 Próxima revisión de discos: {proxima.strftime('%d/%m/%Y %H:%M')}")

        while _activo and segundos > 5:
            time.sleep(min(60, segundos))
            if datetime.now() >= proxima:
                break
            segundos, _ = _segundos_hasta(HORA_DISCO, MINUTO_DISCO)

        if not _activo:
            break

        hoy = datetime.now().date()
        if _ultimo_disco_dia != hoy:
            print("[scheduler] ▶ Comprobando espacio en discos...")
            try:
                resultado = disk_monitor_service.verificar_y_alertar()
                print(f"[scheduler] ✔ Discos: {resultado}")
                _ultimo_disco_dia = hoy
            except Exception as e:
                print(f"[scheduler] ⚠️  Error al monitorizar discos: {e}")

        time.sleep(60)


def iniciar():
    """Arranca los hilos de backup y monitorización."""
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
    """Detiene los hilos (al apagar el backend)."""
    global _activo
    _activo = False