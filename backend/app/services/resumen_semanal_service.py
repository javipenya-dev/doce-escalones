"""
Servicio que genera y envía el resumen semanal (lunes por la mañana).
"""
import json
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import (
    Usuario, Alumno, Asistencia, ResumenMensual,
    PackAlumno, Cobro, TipoClase, Tarifa,
)
from app.services.email_service import enviar_email


# ── QUERIES ──────────────────────────────────────────────────────────────────

async def _pagos_pendientes(db: AsyncSession) -> list[dict]:
    """
    Alumnos con pack contratado (tarifa real) sin cobro este mes.
    Devuelve [{alumno, importe, tarifa_nombre}].
    """
    hoy = date.today()

    cobros_mes = await db.execute(
        select(Cobro.alumno_id).where(
            and_(
                func.extract("year", Cobro.fecha) == hoy.year,
                func.extract("month", Cobro.fecha) == hoy.month,
                Cobro.anulado == False,
            )
        ).distinct()
    )
    alumnos_con_cobro = {row[0] for row in cobros_mes.all()}

    result = await db.execute(
        select(PackAlumno, Alumno, Tarifa)
        .join(Alumno, PackAlumno.alumno_id == Alumno.id)
        .outerjoin(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            PackAlumno.activo == True,
            PackAlumno.tarifa_id.is_not(None),
            Alumno.activo == True,
        )
    )

    por_alumno: dict[int, dict] = {}
    for pack, alumno, tarifa in result.all():
        if alumno.id in alumnos_con_cobro:
            continue
        if alumno.id in por_alumno:
            continue
        por_alumno[alumno.id] = {
            "alumno_id": alumno.id,
            "nombre": f"{alumno.nombre} {alumno.apellidos}",
            "importe": float(tarifa.precio_base) if tarifa else 0.0,
            "tarifa": tarifa.nombre if tarifa else "—",
        }

    lista = sorted(por_alumno.values(), key=lambda x: -x["importe"])
    return lista


async def _recaudado_mes(db: AsyncSession) -> dict:
    """Total cobrado este mes + desglose por método de pago."""
    hoy = date.today()

    # Total
    total_result = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            and_(
                func.extract("year", Cobro.fecha) == hoy.year,
                func.extract("month", Cobro.fecha) == hoy.month,
                Cobro.anulado == False,
            )
        )
    )
    total = float(total_result.scalar() or 0)

    # Nº cobros
    n_result = await db.execute(
        select(func.count(Cobro.id)).where(
            and_(
                func.extract("year", Cobro.fecha) == hoy.year,
                func.extract("month", Cobro.fecha) == hoy.month,
                Cobro.anulado == False,
            )
        )
    )
    num_cobros = n_result.scalar() or 0

    return {"total": total, "num_cobros": num_cobros}


async def _alumnos_inactivos(db: AsyncSession, dias: int = 14) -> list[dict]:
    """
    Alumnos activos con pack activo que no tienen asistencias en los
    últimos `dias`.
    """
    fecha_limite = date.today() - timedelta(days=dias)

    # Alumnos con actividad reciente
    con_actividad = await db.execute(
        select(Asistencia.alumno_id)
        .where(Asistencia.fecha >= fecha_limite)
        .distinct()
    )
    ids_con_actividad = {row[0] for row in con_actividad.all()}

    # Alumnos con pack activo
    result = await db.execute(
        select(Alumno)
        .join(PackAlumno, PackAlumno.alumno_id == Alumno.id)
        .where(
            Alumno.activo == True,
            PackAlumno.activo == True,
        )
        .distinct()
        .order_by(Alumno.apellidos, Alumno.nombre)
    )

    inactivos = []
    for alumno in result.scalars().all():
        if alumno.id in ids_con_actividad:
            continue
        inactivos.append({
            "alumno_id": alumno.id,
            "nombre": f"{alumno.nombre} {alumno.apellidos}",
        })

    return inactivos


async def _actividad_semana(db: AsyncSession) -> dict:
    """Asistencias y horas de los últimos 7 días."""
    hoy = date.today()
    hace_7 = hoy - timedelta(days=7)

    result = await db.execute(
        select(
            func.count(Asistencia.id),
            func.coalesce(func.sum(Asistencia.duracion_min), 0),
        ).where(Asistencia.fecha >= hace_7)
    )
    num, total_min = result.one()

    # Por profesor
    por_prof_result = await db.execute(
        select(Usuario.nombre, Usuario.apellidos, func.count(Asistencia.id))
        .join(Asistencia, Asistencia.profesor_id == Usuario.id)
        .where(Asistencia.fecha >= hace_7)
        .group_by(Usuario.id, Usuario.nombre, Usuario.apellidos)
        .order_by(func.count(Asistencia.id).desc())
    )
    por_profesor = [
        {"profesor": f"{n} {a}", "clases": c}
        for n, a, c in por_prof_result.all()
    ]

    return {
        "num_asistencias": num or 0,
        "total_horas": round(float(total_min) / 60.0, 1),
        "por_profesor": por_profesor,
    }


# ── CONSTRUCCIÓN DEL HTML ────────────────────────────────────────────────────

def _construir_html(datos: dict) -> str:
    hoy_str = date.today().strftime("%d/%m/%Y")

    # Pagos pendientes
    pagos = datos["pagos"]
    if pagos:
        pagos_filas = "".join([
            f"""<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{p['nombre']}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">{p['tarifa']}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;color:#DC2626;">{p['importe']:.2f}€</td>
            </tr>"""
            for p in pagos
        ])
        total_pend = sum(p['importe'] for p in pagos)
        pagos_bloque = f"""
        <h2 style="color:#DC2626;margin:0 0 12px 0;font-size:18px;">⚠️ Pagos pendientes ({len(pagos)})</h2>
        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#FEE2E2;">
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#991B1B;">Alumno</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#991B1B;">Tarifa</th>
              <th style="padding:8px 10px;text-align:right;font-size:12px;color:#991B1B;">Importe</th>
            </tr>
          </thead>
          <tbody>{pagos_filas}</tbody>
          <tfoot>
            <tr style="background:#FEF2F2;">
              <td colspan="2" style="padding:8px 10px;font-weight:bold;">TOTAL pendiente</td>
              <td style="padding:8px 10px;text-align:right;font-weight:bold;color:#DC2626;">{total_pend:.2f}€</td>
            </tr>
          </tfoot>
        </table>
        """
    else:
        pagos_bloque = '<p style="color:#16A34A;font-weight:bold;">✅ No hay pagos pendientes este mes</p>'

    # Actividad
    act = datos["actividad"]
    if act["por_profesor"]:
        profs_filas = "".join([
            f"""<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{p['profesor']}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">{p['clases']} clases</td>
            </tr>"""
            for p in act["por_profesor"]
        ])
        profs_bloque = f"""
        <table style="width:100%;border-collapse:collapse;margin-top:12px;background:white;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#F3F4F6;">
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#374151;">Profesor</th>
              <th style="padding:8px 10px;text-align:right;font-size:12px;color:#374151;">Clases</th>
            </tr>
          </thead>
          <tbody>{profs_filas}</tbody>
        </table>
        """
    else:
        profs_bloque = ""

    # Inactivos
    inact = datos["inactivos"]
    if inact:
        inact_filas = "".join([
            f'<li style="padding:4px 0;border-bottom:1px solid #f3f3f3;">{i["nombre"]}</li>'
            for i in inact[:30]  # máximo 30
        ])
        mas = f'<p style="color:#999;font-size:12px;">... y {len(inact)-30} más</p>' if len(inact) > 30 else ""
        inact_bloque = f"""
        <h2 style="color:#F59E0B;margin:24px 0 12px 0;font-size:18px;">😴 Alumnos sin clases en 14 días ({len(inact)})</h2>
        <ul style="list-style:none;padding:12px;background:white;border:1px solid #eee;border-radius:6px;margin:0;">
          {inact_filas}
        </ul>
        {mas}
        """
    else:
        inact_bloque = '<p style="color:#16A34A;font-weight:bold;">🎉 Todos los alumnos activos han tenido clase en las últimas 2 semanas</p>'

    # Recaudación
    rec = datos["recaudado"]

    # HTML completo
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#F9F9F9;">
      <!-- Header -->
      <div style="background:#111;color:white;padding:24px 28px;border-radius:12px 12px 0 0;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;background:#E75F00;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;">🎓</div>
          <div>
            <h1 style="margin:0;font-size:22px;letter-spacing:0.5px;">12 ESCALONES</h1>
            <p style="margin:0;font-size:11px;color:#999;letter-spacing:1px;">RESUMEN SEMANAL</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:28px;background:#F9F9F9;">

        <p style="margin:0 0 24px 0;color:#444;font-size:14px;">
          Resumen de la semana del <strong>{hoy_str}</strong>
        </p>

        <!-- Stats grandes -->
        <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
          <div style="flex:1;min-width:140px;background:white;padding:16px;border-radius:8px;border-left:4px solid #E75F00;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Recaudado (mes)</div>
            <div style="font-size:24px;font-weight:800;color:#E75F00;margin-top:4px;">{rec['total']:.0f}€</div>
            <div style="font-size:11px;color:#999;margin-top:2px;">{rec['num_cobros']} cobros</div>
          </div>
          <div style="flex:1;min-width:140px;background:white;padding:16px;border-radius:8px;border-left:4px solid #3B82F6;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Clases (7 días)</div>
            <div style="font-size:24px;font-weight:800;color:#3B82F6;margin-top:4px;">{act['num_asistencias']}</div>
            <div style="font-size:11px;color:#999;margin-top:2px;">{act['total_horas']} horas</div>
          </div>
        </div>

        {pagos_bloque}

        <h2 style="color:#374151;margin:24px 0 12px 0;font-size:18px;">📈 Actividad por profesor (7 días)</h2>
        {profs_bloque}

        {inact_bloque}

      </div>

      <!-- Footer -->
      <div style="background:#333;color:#999;padding:16px 28px;text-align:center;font-size:11px;border-radius:0 0 12px 12px;">
        Enviado automáticamente por el sistema de 12 Escalones · cada lunes 9:00
      </div>
    </div>
    """


# ── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

async def enviar_resumen_semanal(db: AsyncSession) -> tuple[bool, str | None]:
    """
    Genera el resumen semanal y lo envía por email.
    Devuelve (ok, error).
    """
    emails = [e.strip() for e in (settings.BACKUP_EMAILS or "").split(',') if e.strip()]
    if not emails:
        return False, "Sin destinatarios configurados (BACKUP_EMAILS)"

    try:
        pagos        = await _pagos_pendientes(db)
        recaudado    = await _recaudado_mes(db)
        inactivos    = await _alumnos_inactivos(db, dias=14)
        actividad    = await _actividad_semana(db)

        datos = {
            "pagos":      pagos,
            "recaudado":  recaudado,
            "inactivos":  inactivos,
            "actividad":  actividad,
        }

        html = _construir_html(datos)
        asunto = f"📊 Resumen semanal · {date.today().strftime('%d/%m/%Y')} · 12 Escalones"
        return enviar_email(emails, asunto, html)

    except Exception as e:
        return False, f"{type(e).__name__}: {e}"