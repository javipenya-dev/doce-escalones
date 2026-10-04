"""
Scheduler simple en un hilo de background.

- Backup diario a las 03:00 (una sola vez por día)
- Monitorización de discos a las 08:00 (una sola vez por día)
- Watchdog: cada 6h comprueba que el último backup OK es < 30h
- Rotación automática de backups >30 días
"""
import threading
import time
from datetime import datetime, timedelta

from app.services import backup_service, disk_monitor_service
from app.services.email_service import enviar_alerta_backup_fallido, enviar_email

_activo = False
_hilos: list[threading.Thread] = []

# Guardamos el último día en que se ejecutó cada tarea para no repetirla
_ultimo_backup_dia: "datetime.date | None" = None
_ultimo_disco_dia: "datetime.date | None" = None

HORA_BACKUP   = 3
MINUTO_BACKUP = 0
HORA_DISCO    = 8
MINUTO_DISCO  = 0

# ── Configuración del watchdog ──
# Comprueba cada 6h si el último backup automático OK tiene más de 30h.
# Si es así → email de alerta (útil si la Pi se apagó/suspendió a las 03:00).
HORAS_MAX_SIN_BACKUP = 30
INTERVALO_WATCHDOG_H = 6


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


def _loop_watchdog_backup():
    """
    Comprueba periódicamente que hay un backup automático reciente.

    Cubre el caso en que la Pi esté apagada/suspendida a las 03:00 (por
    corte de luz, suspensión accidental, etc.) → el backup no se ejecuta
    y nadie se entera hasta que un humano lo revisa. Con este watchdog,
    si pasan más de HORAS_MAX_SIN_BACKUP horas sin un backup OK, se envía
    un email de alerta a BACKUP_EMAILS.
    """
    from app.core.config import settings

    # Espera inicial: deja que el backend termine de arrancar y ejecuta
    # la primera comprobación pasados 5 min (evita ruido al reiniciar).
    for _ in range(300):
        if not _activo:
            return
        time.sleep(1)

    while _activo:
        try:
            bkps = backup_service.listar_backups()
            auto_bkps = [b for b in bkps if b['tipo'] == 'auto']

            motivo = None

            if not auto_bkps:
                motivo = "No hay ningún backup automático registrado"
            else:
                ultimo = auto_bkps[0]  # ya vienen ordenados desc
                fecha_ultimo = datetime.fromisoformat(ultimo['fecha'])
                horas_sin = (datetime.now() - fecha_ultimo).total_seconds() / 3600

                if horas_sin > HORAS_MAX_SIN_BACKUP:
                    motivo = (
                        f"Último backup OK: {ultimo['fecha_str']} "
                        f"(hace {horas_sin:.1f}h, umbral {HORAS_MAX_SIN_BACKUP}h)"
                    )

            if motivo:
                _enviar_alerta_watchdog(motivo, settings)
            else:
                # Todo OK — log silencioso
                print(f"[watchdog] ✔ Backup reciente OK")

        except Exception as e:
            print(f"[watchdog] ⚠️  Error comprobando backups: {e}")

        # Dormir INTERVALO_WATCHDOG_H horas, pero troceado para poder
        # parar rápido si _activo se pone a False.
        for _ in range(INTERVALO_WATCHDOG_H * 3600):
            if not _activo:
                break
            time.sleep(1)


def _enviar_alerta_watchdog(motivo: str, settings):
    """Envía el email de alerta cuando el watchdog detecta backup ausente."""
    print(f"[watchdog] 🚨 BACKUP AUSENTE — {motivo}")

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">🚨 Alerta: sin backups recientes</h2>
      </div>
      <div style="padding: 20px; background: #F9F9F9; border: 1px solid #ddd;">
        <p><strong>Academia:</strong> 12 Escalones</p>
        <p><strong>Motivo:</strong> {motivo}</p>
        <p><strong>Umbral configurado:</strong> {HORAS_MAX_SIN_BACKUP}h</p>
        <p>Esto suele pasar cuando la Raspberry ha estado apagada o
        suspendida a la hora programada del backup (03:00).</p>
        <p style="background: #FEF3C7; padding: 12px; border-radius: 4px;">
          <strong>Acciones recomendadas:</strong><br>
          1. Comprobar que la Raspberry está encendida<br>
          2. Ver el servicio: <code>systemctl status doce-backend</code><br>
          3. Crear un backup manual desde Configuración del panel<br>
          4. Comprobar que la Pi NO se apaga/suspende de noche
        </p>
      </div>
      <div style="background: #333; color: #999; padding: 12px; text-align: center; font-size: 11px; border-radius: 0 0 8px 8px;">
        Enviado automáticamente por el sistema de 12 Escalones
      </div>
    </div>
    """

    emails = [e.strip() for e in settings.BACKUP_EMAILS.split(',') if e.strip()]
    if not emails:
        print("[watchdog] ⚠️  No hay destinatarios configurados")
        return

    ok, err = enviar_email(
        emails,
        "🚨 Sin backups recientes — 12 Escalones",
        html,
    )
    if ok:
        print("[watchdog] 📧 Email de alerta enviado")
    else:
        print(f"[watchdog] ⚠️  No se pudo enviar el email: {err}")


def iniciar():
    """Arranca los hilos de backup, monitorización y watchdog."""
    global _hilos, _activo
    if _activo:
        return
    _activo = True
    _hilos = [
        threading.Thread(target=_loop_backup, daemon=True, name='backup-scheduler'),
        threading.Thread(target=_loop_disco,  daemon=True, name='disk-scheduler'),
        threading.Thread(target=_loop_watchdog_backup, daemon=True, name='backup-watchdog'),
    ]
    for h in _hilos:
        h.start()
    print(f"[scheduler] ✅ Backup automático activo — diario a las {HORA_BACKUP:02d}:{MINUTO_BACKUP:02d}")
    print(f"[scheduler] ✅ Monitor de discos activo — diario a las {HORA_DISCO:02d}:{MINUTO_DISCO:02d}")
    print(f"[scheduler] ✅ Watchdog de backups activo — cada {INTERVALO_WATCHDOG_H}h, umbral {HORAS_MAX_SIN_BACKUP}h")


def parar():
    """Detiene los hilos (al apagar el backend)."""
    global _activo
    _activo = False