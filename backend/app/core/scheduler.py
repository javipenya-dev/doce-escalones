"""
Scheduler simple en un hilo de background.

- Ejecuta el backup automático todos los días a las 03:00.
- Rota los backups >30 días.
- En caso de fallo, envía un email de aviso.
"""
import threading
import time
from datetime import datetime, timedelta

from app.services import backup_service
from app.services.email_service import enviar_alerta_backup_fallido

_hilo: threading.Thread | None = None
_activo = False

HORA_BACKUP = 3     # 03:00
MINUTO_BACKUP = 0


def _segundos_hasta(hora: int, minuto: int) -> tuple[float, datetime]:
    ahora = datetime.now()
    proxima = ahora.replace(hour=hora, minute=minuto, second=0, microsecond=0)
    if proxima <= ahora:
        proxima += timedelta(days=1)
    return (proxima - ahora).total_seconds(), proxima


def _loop():
    global _activo
    while _activo:
        segundos, proxima = _segundos_hasta(HORA_BACKUP, MINUTO_BACKUP)
        print(f"[scheduler] 💾 Próximo backup automático: {proxima.strftime('%d/%m/%Y %H:%M')}")

        # Dormir en tramos de 60s para poder parar rápido
        while _activo and segundos > 5:
            time.sleep(min(60, segundos))
            segundos, _ = _segundos_hasta(HORA_BACKUP, MINUTO_BACKUP)
            if segundos > 86000:  # acabamos de pasar la hora
                break

        if not _activo:
            break

        # ── Ejecutar backup ──
        print("[scheduler] ▶ Ejecutando backup automático...")
        ok, resultado = backup_service.crear_backup('auto')

        if ok:
            backup_service.rotar_backups_auto()
        else:
            # Enviar email de alerta
            try:
                enviar_alerta_backup_fallido(
                    error=str(resultado),
                    fecha=datetime.now().strftime('%d/%m/%Y %H:%M'),
                )
                print("[scheduler] 📧 Email de alerta enviado")
            except Exception as e:
                print(f"[scheduler] ⚠️  No se pudo enviar el email: {e}")

        # Pausa de 1 min para no repetir la misma hora
        time.sleep(60)


def iniciar():
    global _hilo, _activo
    if _activo:
        return
    _activo = True
    _hilo = threading.Thread(target=_loop, daemon=True, name='backup-scheduler')
    _hilo.start()
    print(f"[scheduler] ✅ Backup automático activo — diario a las {HORA_BACKUP:02d}:{MINUTO_BACKUP:02d}")


def parar():
    global _activo
    _activo = False