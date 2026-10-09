"""
Scheduler simple en un hilo de background.

- Backup diario a las 03:00 (una sola vez por día)
- Monitorización de discos a las 08:00 (una sola vez por día)
- Watchdog: cada 6h comprueba que el último backup OK es < 30h
- Rotación automática de backups >30 días
- Cola de tickets pendientes de impresora: reintento cada 60s
"""
import os
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool

from app.services import backup_service, disk_monitor_service
from app.services.email_service import (
    enviar_alerta_backup_fallido,
    enviar_email,
    enviar_backup_por_email,
)
from app.services.impresora_service import (
    impresora_disponible,
    imprimir_varias_copias,
    ImpresoraError,
)


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

# ── Email periódico con backup adjunto ──
# Se envía cada N días (configurable en .env: BACKUP_EMAIL_DIAS).
# Se ejecuta después del backup de las 03:00, a las 04:00.
HORA_EMAIL_BACKUP = 4

# ── Cola de tickets pendientes de impresora ──
# Reintenta cada 60s mientras haya pendientes.
# Los tickets con más de 30 días se descartan sin imprimir.
INTERVALO_IMPRESORA_S      = 60
DIAS_MAX_TICKET_PENDIENTE  = 30


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


# ── Estado del email periódico (persistido en disco) ──

def _estado_email_path() -> str:
    """Ruta al archivo que guarda cuándo se envió el último email."""
    # Lo guardamos junto a los backups locales
    media_dir = os.path.dirname(backup_service.LOCAL_BACKUP_DIR)
    return os.path.join(media_dir, ".backup_email_state.json")


def _toca_enviar_email() -> bool:
    """Devuelve True si han pasado BACKUP_EMAIL_DIAS desde el último envío."""
    from app.core.config import settings
    import json

    dias = int(getattr(settings, "BACKUP_EMAIL_DIAS", 7) or 7)
    if dias <= 0:
        return False  # desactivado

    path = _estado_email_path()
    if not os.path.exists(path):
        return True
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        ultimo = datetime.fromisoformat(data["ultimo_envio"])
        return (datetime.now() - ultimo).days >= dias
    except Exception:
        return True


def _marcar_email_enviado():
    """Guarda la fecha del último envío exitoso."""
    import json
    path = _estado_email_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"ultimo_envio": datetime.now().isoformat()}, f)
    except Exception as e:
        print(f"[email-backup] ⚠️  No se pudo guardar estado: {e}")


def _loop_backup_email():
    """
    Envía por email el backup más reciente cada N días (por defecto 7).

    Se ejecuta a las HORA_EMAIL_BACKUP (04:00) cada hora comprobando
    si toca. Si el backend se reinicia, no se pierde el estado porque
    se guarda en disco.
    """
    from app.core.config import settings

    # Espera inicial (deja arrancar el backend + backup 03:00 ya hecho)
    for _ in range(120):
        if not _activo:
            return
        time.sleep(1)

    while _activo:
        try:
            ahora = datetime.now()

            # Solo intentar a partir de HORA_EMAIL_BACKUP
            if ahora.hour >= HORA_EMAIL_BACKUP:
                if _toca_enviar_email():
                    bkps = backup_service.listar_backups()
                    auto_bkps = [b for b in bkps if b["tipo"] == "auto"]

                    if not auto_bkps:
                        print("[email-backup] ⚠️  No hay backups automáticos para enviar")
                    else:
                        ultimo = auto_bkps[0]
                        ruta = backup_service.obtener_ruta_backup(ultimo["nombre"])

                        if not ruta:
                            print(f"[email-backup] ⚠️  No se encontró el archivo {ultimo['nombre']}")
                        else:
                            ok, err = enviar_backup_por_email(
                                ruta_archivo   = ruta,
                                nombre_archivo = ultimo["nombre"],
                                tamano_mb      = ultimo["tamano_mb"],
                                fecha_str      = ultimo["fecha_str"],
                            )
                            if ok:
                                _marcar_email_enviado()
                                dias = int(getattr(settings, "BACKUP_EMAIL_DIAS", 7) or 7)
                                print(
                                    f"[email-backup] ✅ Backup enviado por email: "
                                    f"{ultimo['nombre']} (próximo en ~{dias} días)"
                                )
                            else:
                                print(f"[email-backup] ⚠️  Error al enviar email: {err}")
        except Exception as e:
            print(f"[email-backup] ⚠️  Error: {e}")

        # Comprobar cada hora
        for _ in range(3600):
            if not _activo:
                break
            time.sleep(1)


# ── Cola de tickets pendientes de impresora ──

# Engine dedicado del scheduler (NullPool).
# Se crea DENTRO del hilo de la impresora para que sus conexiones queden
# atadas al event loop de ese hilo y no colisionen con el pool global de
# uvicorn (que vive en otro loop → "Future attached to a different loop").
_scheduler_engine = None
_scheduler_sessionmaker = None


def _init_scheduler_engine():
    """Crea (una sola vez) el engine del scheduler, atado al loop del hilo."""
    global _scheduler_engine, _scheduler_sessionmaker
    if _scheduler_engine is not None:
        return
    url = os.getenv("DATABASE_URL")
    if not url:
        try:
            from app.core.config import settings as _s
            url = getattr(_s, "DATABASE_URL", None)
        except Exception:
            url = None
    if not url:
        # Fallback: mismo default que database.py
        url = (
            "postgresql+asyncpg://doce_user:doce_pass@localhost:5432/"
            "doce_escalones?ssl=disable"
        )
    _scheduler_engine = create_async_engine(
        url,
        echo=False,
        poolclass=NullPool,
    )
    _scheduler_sessionmaker = async_sessionmaker(
        bind=_scheduler_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


def _loop_impresora():
    """
    Bucle que reintenta imprimir los tickets pendientes cada 60s.

    Usa un event loop PROPIO del hilo (persistente) y un engine con
    NullPool. Esto es importante porque SQLAlchemy async + asyncpg atan
    las conexiones al event loop donde se crean: con asyncio.run() en
    cada ciclo cerraríamos el loop y las conexiones quedarían huérfanas.

    Solo actúa si:
      - Hay tickets pendientes en BD.
      - La impresora responde a TCP.
    """
    import asyncio

    # Event loop persistente para este hilo
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        # Espera inicial: no molestar al arrancar (30s)
        for _ in range(30):
            if not _activo:
                return
            time.sleep(1)

        # Engine dedicado, creado DENTRO del loop de este hilo
        _init_scheduler_engine()

        while _activo:
            try:
                loop.run_until_complete(_procesar_cola_tickets())
            except Exception as e:
                print(f"[impresora] ⚠️  Error procesando cola: {e}")

            # Dormir INTERVALO_IMPRESORA_S, troceado para poder parar rápido
            for _ in range(INTERVALO_IMPRESORA_S):
                if not _activo:
                    break
                time.sleep(1)
    finally:
        # Cerrar el engine antes de cerrar el loop
        if _scheduler_engine is not None:
            try:
                loop.run_until_complete(_scheduler_engine.dispose())
            except Exception:
                pass
        try:
            loop.close()
        except Exception:
            pass


async def _procesar_cola_tickets():
    """
    Comprueba si hay tickets pendientes y, si la impresora responde,
    los imprime. Descarta los que tengan más de DIAS_MAX_TICKET_PENDIENTE.

    Usa el engine dedicado del scheduler (NullPool, atado al loop del hilo).
    """
    from datetime import datetime, timedelta, timezone
    from app.models.models import TicketPendiente
    from app.services.ticket_service import generar_ticket_bytes
    from app.api.routes.cobros import (
        _get_cobro_completo,
        _construir_datos_ticket,
        _get_config,
    )

    _init_scheduler_engine()

    async with _scheduler_sessionmaker() as db:
        # 1. ¿Hay pendientes?
        pendientes = (await db.execute(
            select(TicketPendiente)
            .where(TicketPendiente.impreso == False)  # noqa: E712
            .order_by(TicketPendiente.creado_en.asc())
        )).scalars().all()

        if not pendientes:
            return

        # 2. Descartar los muy antiguos (> DIAS_MAX_TICKET_PENDIENTE días)
        limite = (
            datetime.now(timezone.utc).replace(tzinfo=None)
            - timedelta(days=DIAS_MAX_TICKET_PENDIENTE)
        )
        descartados = 0
        activos = []
        for tp in pendientes:
            if tp.creado_en and tp.creado_en < limite:
                tp.impreso = True
                tp.impreso_en = datetime.now(timezone.utc).replace(tzinfo=None)
                tp.ultimo_error = (
                    f"Descartado tras {DIAS_MAX_TICKET_PENDIENTE} días sin imprimir"
                )
                descartados += 1
            else:
                activos.append(tp)

        if descartados:
            await db.commit()
            print(
                f"[impresora] 🧹 Descartados {descartados} tickets pendientes "
                f"(> {DIAS_MAX_TICKET_PENDIENTE} días)"
            )

        if not activos:
            return

        # 3. ¿Responde la impresora?
        if not impresora_disponible():
            return  # sigue apagada, esperamos al próximo ciclo

        # 4. Imprimir todos los pendientes activos
        cfg = await _get_config(db)
        impresos = 0

        for tp in activos:
            cobro = await _get_cobro_completo(db, tp.cobro_id)
            if not cobro:
                tp.impreso = True
                tp.impreso_en = datetime.now(timezone.utc).replace(tzinfo=None)
                tp.ultimo_error = "Cobro no encontrado"
                continue

            try:
                datos = _construir_datos_ticket(cobro, cfg)
                ticket_bytes = generar_ticket_bytes(datos)
                imprimir_varias_copias(ticket_bytes, copias=tp.copias or 2)

                tp.impreso = True
                tp.impreso_en = datetime.now(timezone.utc).replace(tzinfo=None)
                impresos += 1
            except ImpresoraError as e:
                tp.intentos = (tp.intentos or 0) + 1
                tp.ultimo_error = str(e)[:500]
                break  # si falla una, no seguimos
            except Exception as e:
                tp.intentos = (tp.intentos or 0) + 1
                tp.ultimo_error = f"Error inesperado: {e}"[:500]
                break

        await db.commit()
        if impresos:
            print(f"[impresora] ✅ Impresos {impresos} tickets pendientes")


def iniciar():
    """Arranca los hilos de backup, monitorización, watchdog e impresora."""
    global _hilos, _activo
    if _activo:
        return
    _activo = True
    _hilos = [
        threading.Thread(target=_loop_backup,          daemon=True, name='backup-scheduler'),
        threading.Thread(target=_loop_disco,           daemon=True, name='disk-scheduler'),
        threading.Thread(target=_loop_watchdog_backup, daemon=True, name='backup-watchdog'),
        threading.Thread(target=_loop_backup_email,    daemon=True, name='backup-email'),
        threading.Thread(target=_loop_impresora,       daemon=True, name='impresora-scheduler'),
    ]
    for h in _hilos:
        h.start()
    print(f"[scheduler] ✅ Backup automático activo — diario a las {HORA_BACKUP:02d}:{MINUTO_BACKUP:02d}")
    print(f"[scheduler] ✅ Monitor de discos activo — diario a las {HORA_DISCO:02d}:{MINUTO_DISCO:02d}")
    print(f"[scheduler] ✅ Watchdog de backups activo — cada {INTERVALO_WATCHDOG_H}h, umbral {HORAS_MAX_SIN_BACKUP}h")
    from app.core.config import settings
    _dias_email = int(getattr(settings, "BACKUP_EMAIL_DIAS", 7) or 7)
    if _dias_email > 0:
        print(f"[scheduler] ✅ Envío de backup por email activo — cada {_dias_email} días a las {HORA_EMAIL_BACKUP:02d}:00")
    print(f"[scheduler] ✅ Cola de tickets pendientes activa — reintento cada {INTERVALO_IMPRESORA_S}s")


def parar():
    """Detiene los hilos (al apagar el backend)."""
    global _activo
    _activo = False