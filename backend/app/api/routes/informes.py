"""
Endpoint: GET /informes/mensual?anio=YYYY&mes=MM
Devuelve recaudación, asistencias, desglose por profesor y formas de pago del mes.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from calendar import month_abbr
 
from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import (
    Usuario, Cobro, CobroPago, Asistencia, ResumenMensual, TipoClase
)
from app.schemas.schemas import InformeMensualOut, InformeProfesorRow
from datetime import date
 
router = APIRouter()
 
 
@router.get("/mensual", response_model=InformeMensualOut)
async def informe_mensual(
    anio: int = Query(...),
    mes:  int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    fecha_ini = date(anio, mes, 1)
    fecha_fin = date(anio + 1, 1, 1) if mes == 12 else date(anio, mes + 1, 1)
 
    # Recaudación y conteo de cobros
    r_rec = await db.execute(
        select(
            func.coalesce(func.sum(Cobro.total), 0),
            func.count(Cobro.id),
        ).where(
            Cobro.fecha >= fecha_ini,
            Cobro.fecha <  fecha_fin,
            Cobro.anulado == False,
        )
    )
    recaudado, num_cobros = r_rec.one()
 
    # Alumnos únicos con actividad ese mes
    r_alumnos = await db.execute(
        select(func.count(func.distinct(ResumenMensual.alumno_id))).where(
            ResumenMensual.anio == anio,
            ResumenMensual.mes  == mes,
            ResumenMensual.horas_consumidas + ResumenMensual.sesiones_consumidas > 0,
        )
    )
    alumnos_activos = r_alumnos.scalar() or 0
 
    # Totales de horas y sesiones del mes
    r_totales = await db.execute(
        select(
            func.coalesce(func.sum(ResumenMensual.horas_consumidas), 0),
            func.coalesce(func.sum(ResumenMensual.sesiones_consumidas), 0),
        ).where(
            ResumenMensual.anio == anio,
            ResumenMensual.mes  == mes,
        )
    )
    horas_total, sesiones_total = r_totales.one()
 
    # ── NUEVO: Desglose por forma de pago ─────────────────────────────────────
    # Unimos CobroPago con Cobro para filtrar por fecha y no anulado
    r_pagos = await db.execute(
        select(
            CobroPago.forma_pago,
            func.coalesce(func.sum(CobroPago.importe), 0).label("total"),
            func.count(func.distinct(CobroPago.cobro_id)).label("num_cobros"),
        )
        .join(Cobro, CobroPago.cobro_id == Cobro.id)
        .where(
            Cobro.fecha >= fecha_ini,
            Cobro.fecha <  fecha_fin,
            Cobro.anulado == False,
        )
        .group_by(CobroPago.forma_pago)
        .order_by(func.sum(CobroPago.importe).desc())
    )
    filas_pagos = r_pagos.all()
 
    # Construir dict con todas las formas de pago (aunque sean 0)
    formas_pago = {
        "efectivo": {"total": 0.0, "num_cobros": 0},
        "tarjeta":  {"total": 0.0, "num_cobros": 0},
        "bizum":    {"total": 0.0, "num_cobros": 0},
        "transferencia": {"total": 0.0, "num_cobros": 0},
    }
    for fila in filas_pagos:
        key = (fila.forma_pago or "").lower()
        if key in formas_pago:
            formas_pago[key] = {
                "total": float(fila.total),
                "num_cobros": int(fila.num_cobros),
            }
 
    # Detectar cobros mixtos (cobros con más de una forma de pago)
    r_mixtos = await db.execute(
        select(
            func.count(func.distinct(CobroPago.cobro_id)).label("num"),
            func.coalesce(func.sum(CobroPago.importe), 0).label("total"),
        )
        .join(Cobro, CobroPago.cobro_id == Cobro.id)
        .where(
            Cobro.fecha >= fecha_ini,
            Cobro.fecha <  fecha_fin,
            Cobro.anulado == False,
        )
        .having(func.count(CobroPago.id) > 1)
        .group_by(CobroPago.cobro_id)
    )
    mixtos_filas = r_mixtos.all()
    cobros_mixtos = len(mixtos_filas)
    total_mixtos = sum(float(f.total) for f in mixtos_filas)
 
    # ── Desglose por profesor ──────────────────────────────────────────────────
    r_prof = await db.execute(
        select(
            Asistencia.profesor_id,
            Usuario.nombre.label("nombre"),
            TipoClase.categoria,
            func.count(Asistencia.id).label("n_clases"),
            func.coalesce(func.sum(Asistencia.duracion_min) / 60.0, 0).label("horas"),
        )
        .join(Usuario,   Asistencia.profesor_id   == Usuario.id)
        .join(TipoClase, Asistencia.tipo_clase_id == TipoClase.id)
        .where(
            Asistencia.fecha >= fecha_ini,
            Asistencia.fecha <  fecha_fin,
        )
        .group_by(Asistencia.profesor_id, Usuario.nombre, TipoClase.categoria)
        .order_by(Usuario.nombre)
    )
    filas = r_prof.all()
 
    profesores: dict[int, dict] = {}
    for fila in filas:
        pid = fila.profesor_id
        if pid not in profesores:
            profesores[pid] = {
                "profesor_id": pid,
                "nombre": fila.nombre,
                "horas_normal": 0.0,
                "horas_ingles": 0.0,
                "sesiones": 0,
                "total_clases": 0,
            }
        cat = (fila.categoria or "").lower()
        if cat == "normal":
            profesores[pid]["horas_normal"] += float(fila.horas)
        elif cat in ("ingles", "inglés"):
            profesores[pid]["horas_ingles"] += float(fila.horas)
        elif cat in ("sesion", "sesión"):
            profesores[pid]["sesiones"] += int(fila.n_clases)
        profesores[pid]["total_clases"] += int(fila.n_clases)
 
    por_profesor = [InformeProfesorRow(**v) for v in profesores.values()]
 
    return InformeMensualOut(
        anio=anio,
        mes=mes,
        mes_label=f"{month_abbr[mes]} {anio}",
        recaudado=float(recaudado),
        num_cobros=int(num_cobros),
        alumnos_activos=int(alumnos_activos),
        horas_total=float(horas_total),
        sesiones_total=int(sesiones_total),
        por_profesor=por_profesor,
        formas_pago=formas_pago,
        cobros_mixtos=cobros_mixtos,
        total_mixtos=total_mixtos,
    )