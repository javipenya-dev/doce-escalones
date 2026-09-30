"""
Servicio de envío de emails vía SMTP.
Se usa para avisos de backup (fallo o resumen semanal).
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Union

from app.core.config import settings


def enviar_email(
    destinatarios: Union[list[str], str],
    asunto: str,
    cuerpo_html: str,
) -> tuple[bool, Optional[str]]:
    """
    Envía un email HTML vía SMTP (con STARTTLS).

    Devuelve (ok, error_msg). Nunca lanza excepción: si falla, devuelve
    False + mensaje para que el llamador pueda hacer log sin romper.
    """
    if isinstance(destinatarios, str):
        destinatarios = [destinatarios]

    destinatarios = [e.strip() for e in destinatarios if e and e.strip()]
    if not destinatarios:
        return False, "Sin destinatarios"

    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASS:
        return False, "SMTP no configurado (.env incompleto)"

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = asunto
        msg['From'] = settings.SMTP_FROM or settings.SMTP_USER
        msg['To'] = ', '.join(destinatarios)
        msg.attach(MIMEText(cuerpo_html, 'html', 'utf-8'))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.sendmail(
                settings.SMTP_FROM or settings.SMTP_USER,
                destinatarios,
                msg.as_string(),
            )
        return True, None

    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def enviar_alerta_backup_fallido(error: str, fecha: str):
    """Atajo: envía el email de alerta cuando un backup automático falla."""
    emails = [e.strip() for e in settings.BACKUP_EMAILS.split(',') if e.strip()]
    if not emails:
        return False, "Sin destinatarios configurados (BACKUP_EMAILS)"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">❌ Backup automático fallido</h2>
      </div>
      <div style="padding: 20px; background: #F9F9F9; border: 1px solid #ddd;">
        <p><strong>Academia:</strong> 12 Escalones</p>
        <p><strong>Fecha del fallo:</strong> {fecha}</p>
        <p><strong>Error:</strong></p>
        <pre style="background: #FFF; padding: 12px; border-left: 3px solid #DC2626; overflow-x: auto; font-size: 12px;">{error}</pre>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 13px; color: #666;">
          Por favor, revisa el servidor y el archivo de log:
          <br><code>backend/media/backups/backup.log</code>
        </p>
      </div>
      <div style="background: #333; color: #999; padding: 12px; text-align: center; font-size: 11px; border-radius: 0 0 8px 8px;">
        Enviado automáticamente por el sistema de 12 Escalones
      </div>
    </div>
    """
    return enviar_email(emails, "❌ Fallo en el backup automático - 12 Escalones", html)


def enviar_alerta_backup_ok(nombre_archivo: str, tamano_mb: float, fecha: str):
    """
    Atajo: email opcional de confirmación. Solo se enviará si algún día
    decides activarlo (por defecto el scheduler NO lo llama).
    """
    emails = [e.strip() for e in settings.BACKUP_EMAILS.split(',') if e.strip()]
    if not emails:
        return False, "Sin destinatarios"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #16A34A; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">✅ Backup completado</h2>
      </div>
      <div style="padding: 20px; background: #F9F9F9; border: 1px solid #ddd;">
        <p><strong>Archivo:</strong> {nombre_archivo}</p>
        <p><strong>Tamaño:</strong> {tamano_mb} MB</p>
        <p><strong>Fecha:</strong> {fecha}</p>
      </div>
    </div>
    """
    return enviar_email(emails, "✅ Backup completado - 12 Escalones", html)