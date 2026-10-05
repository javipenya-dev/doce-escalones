"""
CRUD de citas para la agenda integrada.
Solo accesible para admins (excepto /export.ics que es público).
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import Cita, Alumno, Usuario
from app.schemas.schemas import CitaCreate, CitaUpdate, CitaOut

router = APIRouter()


def _serialize(cita: Cita, alumno: Optional[Alumno], profesor: Usuario) -> CitaOut:
    """Combina Cita + nombres calculados."""
    nombre_alumno = None
    if alumno:
        nombre_alumno = f"{alumno.nombre} {alumno.apellidos}".strip()
    elif cita.alumno_texto:
        nombre_alumno = cita.alumno_texto

    return CitaOut(
        id              = cita.id,
        fecha           = cita.fecha,
        hora_inicio     = cita.hora_inicio,
        hora_fin        = cita.hora_fin,
        alumno_id       = cita.alumno_id,
        alumno_texto    = cita.alumno_texto,
        alumno_nombre   = nombre_alumno,
        profesor_id     = cita.profesor_id,
        profesor_nombre = f"{profesor.nombre} {profesor.apellidos}".strip(),
        profesor_color  = profesor.color,
        observaciones   = cita.observaciones,
    )


def _escapar_ical(texto: str) -> str:
    """Escapa caracteres especiales según RFC 5545."""
    if not texto:
        return ""
    return (texto
            .replace("\\", "\\\\")
            .replace(",", "\\,")
            .replace(";", "\\;")
            .replace("\n", "\\n")
            .replace("\r", ""))


# ── LISTAR ──────────────────────────────────────────────────

@router.get("", response_model=list[CitaOut])
async def listar_citas(
    desde:       Optional[date] = Query(None),
    hasta:       Optional[date] = Query(None),
    profesor_id: Optional[int]  = Query(None),
    alumno_id:   Optional[int]  = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Listado de citas con filtros."""
    stmt = (
        select(Cita, Alumno, Usuario)
        .outerjoin(Alumno, Cita.alumno_id == Alumno.id)
        .join(Usuario, Cita.profesor_id == Usuario.id)
        .order_by(Cita.fecha, Cita.hora_inicio)
    )

    if desde:
        stmt = stmt.where(Cita.fecha >= desde)
    if hasta:
        stmt = stmt.where(Cita.fecha <= hasta)
    if profesor_id:
        stmt = stmt.where(Cita.profesor_id == profesor_id)
    if alumno_id:
        stmt = stmt.where(Cita.alumno_id == alumno_id)

    rows = (await db.execute(stmt)).all()
    return [_serialize(c, a, p) for c, a, p in rows]


# ── EXPORT .ICS (PÚBLICO) ───────────────────────────────────
# ⚠️ IMPORTANTE: debe ir ANTES de /{cita_id} para que FastAPI no
# interprete "export.ics" como un cita_id (sería error de tipo).

@router.get("/export.ics", include_in_schema=True)
async def exportar_ics(db: AsyncSession = Depends(get_db)):
    """
    Exporta TODAS las citas en formato iCalendar (.ics).

    Endpoint PÚBLICO (sin auth) — los calendarios móviles (Google
    Calendar, Apple Calendar, etc.) no pueden enviar tokens Bearer
    al suscribirse.

    URL de suscripción:
      - WiFi academia:  http://192.168.1.212:8001/citas/export.ics
      - Tailscale:      http://100.88.238.34:8001/citas/export.ics
    """
    stmt = (
        select(Cita, Alumno, Usuario)
        .outerjoin(Alumno, Cita.alumno_id == Alumno.id)
        .join(Usuario, Cita.profesor_id == Usuario.id)
        .order_by(Cita.fecha, Cita.hora_inicio)
    )
    rows = (await db.execute(stmt)).all()

    ahora_utc = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    lineas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//12 Escalones//Agenda//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:12 Escalones - Agenda",
        "X-WR-TIMEZONE:Europe/Madrid",
    ]

    for cita, alumno, profesor in rows:
        # Nombre del alumno (prioriza FK, fallback a texto)
        if alumno:
            alumno_nombre = f"{alumno.nombre} {alumno.apellidos}".strip()
        else:
            alumno_nombre = cita.alumno_texto or "—"

        prof_nombre = f"{profesor.nombre} {profesor.apellidos}".strip()

        # Fechas en hora local (floating time, sin Z → el calendario
        # del móvil lo interpreta como hora local automáticamente)
        fecha_str = cita.fecha.strftime("%Y%m%d")
        hi = cita.hora_inicio.strftime("%H%M%S")
        hf = cita.hora_fin.strftime("%H%M%S")

        summary = f"Clase: {alumno_nombre}"
        desc = f"Profesor: {prof_nombre}"
        if cita.observaciones:
            desc += f"\\n{cita.observaciones}"

        lineas.extend([
            "BEGIN:VEVENT",
            f"UID:cita-{cita.id}@12escalones",
            f"DTSTAMP:{ahora_utc}",
            f"DTSTART:{fecha_str}T{hi}",
            f"DTEND:{fecha_str}T{hf}",
            f"SUMMARY:{_escapar_ical(summary)}",
            f"DESCRIPTION:{_escapar_ical(desc)}",
            "LOCATION:12 Escalones",
            "END:VEVENT",
        ])

    lineas.append("END:VCALENDAR")

    ics_content = "\r\n".join(lineas) + "\r\n"

    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="agenda_12escalones.ics"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


# ── OBTENER ────────────────────────────────────────────────

@router.get("/{cita_id}", response_model=CitaOut)
async def obtener_cita(
    cita_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    row = (await db.execute(
        select(Cita, Alumno, Usuario)
        .outerjoin(Alumno, Cita.alumno_id == Alumno.id)
        .join(Usuario, Cita.profesor_id == Usuario.id)
        .where(Cita.id == cita_id)
    )).first()

    if not row:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    cita, alumno, prof = row
    return _serialize(cita, alumno, prof)


# ── CREAR ──────────────────────────────────────────────────

@router.post("", response_model=CitaOut, status_code=status.HTTP_201_CREATED)
async def crear_cita(
    data: CitaCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    if data.hora_fin <= data.hora_inicio:
        raise HTTPException(
            status_code=400,
            detail="La hora de fin debe ser posterior a la de inicio",
        )
    if not data.alumno_id and not data.alumno_texto:
        raise HTTPException(
            status_code=400,
            detail="Debes elegir un alumno o escribir un nombre",
        )

    prof = (await db.execute(
        select(Usuario).where(Usuario.id == data.profesor_id, Usuario.activo == True)
    )).scalar_one_or_none()
    if not prof:
        raise HTTPException(status_code=404, detail="Profesor no encontrado o inactivo")

    alumno = None
    if data.alumno_id:
        alumno = (await db.execute(
            select(Alumno).where(Alumno.id == data.alumno_id)
        )).scalar_one_or_none()
        if not alumno:
            raise HTTPException(status_code=404, detail="Alumno no encontrado")

    cita = Cita(
        fecha         = data.fecha,
        hora_inicio   = data.hora_inicio,
        hora_fin      = data.hora_fin,
        alumno_id     = data.alumno_id,
        alumno_texto  = data.alumno_texto,
        profesor_id   = data.profesor_id,
        observaciones = data.observaciones,
    )
    db.add(cita)
    await db.commit()
    await db.refresh(cita)

    return _serialize(cita, alumno, prof)


# ── EDITAR ─────────────────────────────────────────────────

@router.put("/{cita_id}", response_model=CitaOut)
async def editar_cita(
    cita_id: int,
    data: CitaUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    cita = (await db.execute(select(Cita).where(Cita.id == cita_id))).scalar_one_or_none()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if data.fecha         is not None: cita.fecha         = data.fecha
    if data.hora_inicio   is not None: cita.hora_inicio   = data.hora_inicio
    if data.hora_fin      is not None: cita.hora_fin      = data.hora_fin
    if data.alumno_id     is not None: cita.alumno_id     = data.alumno_id
    if data.alumno_texto  is not None: cita.alumno_texto  = data.alumno_texto
    if data.profesor_id   is not None: cita.profesor_id   = data.profesor_id
    if data.observaciones is not None: cita.observaciones = data.observaciones

    if cita.hora_fin <= cita.hora_inicio:
        raise HTTPException(status_code=400, detail="Hora de fin inválida")
    if not cita.alumno_id and not cita.alumno_texto:
        raise HTTPException(status_code=400, detail="Falta alumno")

    await db.commit()
    await db.refresh(cita)

    alumno = None
    if cita.alumno_id:
        alumno = (await db.execute(
            select(Alumno).where(Alumno.id == cita.alumno_id)
        )).scalar_one_or_none()
    prof = (await db.execute(
        select(Usuario).where(Usuario.id == cita.profesor_id)
    )).scalar_one_or_none()

    return _serialize(cita, alumno, prof)


# ── ELIMINAR ───────────────────────────────────────────────

@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_cita(
    cita_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    cita = (await db.execute(select(Cita).where(Cita.id == cita_id))).scalar_one_or_none()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    await db.delete(cita)
    await db.commit()