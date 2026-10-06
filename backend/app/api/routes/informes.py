"""
Endpoints de informes:
- GET /informes/mensual?anio=YYYY&mes=MM      → informe del mes
- GET /informes/evolucion?anio=YYYY            → 12 meses del año
- GET /informes/mensual/pdf?anio=YYYY&mes=MM   → descarga PDF del informe
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from calendar import month_abbr
from datetime import date

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import (
    Usuario, Cobro, CobroPago, Asistencia, ResumenMensual,
    TipoClase, Alumno, PackAlumno, Tarifa,
)
from app.schemas.schemas import (
    InformeMensualOut, InformeProfesorRow, InformeAlumnoRow,
    InformeEvolucionOut, EvolucionMesOut, ProductividadProfesorRow,
)
from app.services.informe_pdf_service import generar_informe_pdf

router = APIRouter()


def _rango_mes(anio: int, mes: int):
    """Devuelve (primer_dia, primer_dia_mes_siguiente)."""
    ini = date(anio, mes, 1)
    fin = date(anio + 1, 1, 1) if mes == 12 else date(anio, mes + 1, 1)
    return ini, fin


def _mes_anterior(anio: int, mes: int):
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


@router.get("/mensual", response_model=InformeMensualOut)
async def informe_mensual(
    anio: int = Query(...),
    mes:  int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    fecha_ini, fecha_fin = _rango_mes(anio, mes)

    # ── Recaudación y conteo de cobros ──────────────────────────
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

    # ── Anulados del mes ────────────────────────────────────────
    r_anul = await db.execute(
        select(
            func.coalesce(func.sum(Cobro.total), 0),
            func.count(Cobro.id),
        ).where(
            Cobro.fecha >= fecha_ini,
            Cobro.fecha <  fecha_fin,
            Cobro.anulado == True,
        )
    )
    total_anulado, num_anulados = r_anul.one()

    # ── Alumnos activos (con actividad ese mes) ─────────────────
    r_alumnos = await db.execute(
        select(func.count(func.distinct(ResumenMensual.alumno_id))).where(
            ResumenMensual.anio == anio,
            ResumenMensual.mes  == mes,
            ResumenMensual.horas_consumidas + ResumenMensual.sesiones_consumidas > 0,
        )
    )
    alumnos_activos = r_alumnos.scalar() or 0

    # ── Totales horas/sesiones ──────────────────────────────────
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

    # ── Desglose por forma de pago ──────────────────────────────
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
    formas_pago = {
        "efectivo":      {"total": 0.0, "num_cobros": 0},
        "tarjeta":       {"total": 0.0, "num_cobros": 0},
        "bizum":         {"total": 0.0, "num_cobros": 0},
        "transferencia": {"total": 0.0, "num_cobros": 0},
    }
    for fila in r_pagos.all():
        key = (fila.forma_pago.value if hasattr(fila.forma_pago, 'value') else str(fila.forma_pago)).lower()
        if key in formas_pago:
            formas_pago[key] = {
                "total": float(fila.total),
                "num_cobros": int(fila.num_cobros),
            }

    # Cobros mixtos
    r_mixtos = await db.execute(
        select(
            CobroPago.cobro_id,
            func.coalesce(func.sum(CobroPago.importe), 0).label("total"),
        )
        .join(Cobro, CobroPago.cobro_id == Cobro.id)
        .where(
            Cobro.fecha >= fecha_ini,
            Cobro.fecha <  fecha_fin,
            Cobro.anulado == False,
        )
        .group_by(CobroPago.cobro_id)
        .having(func.count(CobroPago.id) > 1)
    )
    mixtos = r_mixtos.all()
    cobros_mixtos = len(mixtos)
    total_mixtos = sum(float(m.total) for m in mixtos)

    # ── Desglose por profesor ───────────────────────────────────
    r_prof = await db.execute(
        select(
            Asistencia.profesor_id,
            Usuario.nombre.label("nombre"),
            Usuario.apellidos.label("apellidos"),
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
        .group_by(Asistencia.profesor_id, Usuario.nombre, Usuario.apellidos, TipoClase.categoria)
        .order_by(Usuario.nombre)
    )

    profesores: dict[int, dict] = {}
    for fila in r_prof.all():
        pid = fila.profesor_id
        if pid not in profesores:
            profesores[pid] = {
                "profesor_id": pid,
                "nombre": f"{fila.nombre} {fila.apellidos}".strip(),
                "horas_normal": 0.0,
                "horas_ingles": 0.0,
                "sesiones": 0,
                "horas_totales": 0.0,
                "total_clases": 0,
            }
        cat = (fila.categoria.value if hasattr(fila.categoria, 'value') else str(fila.categoria or "")).lower()
        if cat == "normal":
            profesores[pid]["horas_normal"] += float(fila.horas)
        elif cat == "ingles":
            profesores[pid]["horas_ingles"] += float(fila.horas)
        elif cat == "sesion":
            profesores[pid]["sesiones"] += int(fila.n_clases)
        profesores[pid]["total_clases"] += int(fila.n_clases)

    # ✅ Calcular horas_totales por profesor
    por_profesor = []
    for v in profesores.values():
        v["horas_totales"] = round(v["horas_normal"] + v["horas_ingles"], 2)
        por_profesor.append(InformeProfesorRow(**v))

    # ── Top 10 alumnos (por horas totales) ──────────────────────
    r_top = await db.execute(
        select(
            ResumenMensual.alumno_id,
            func.coalesce(func.sum(ResumenMensual.horas_consumidas), 0).label('horas'),
            func.coalesce(func.sum(ResumenMensual.sesiones_consumidas), 0).label('sesiones'),
        )
        .where(
            ResumenMensual.anio == anio,
            ResumenMensual.mes == mes,
        )
        .group_by(ResumenMensual.alumno_id)
        .order_by(func.sum(ResumenMensual.horas_consumidas).desc(),
                  func.sum(ResumenMensual.sesiones_consumidas).desc())
        .limit(10)
    )
    top_filas = r_top.all()

    # Cobros por alumno en ese mes
    r_cobros_al = await db.execute(
        select(
            Cobro.alumno_id,
            func.coalesce(func.sum(Cobro.total), 0).label('importe'),
            func.count(Cobro.id).label('num'),
        )
        .where(
            Cobro.fecha >= fecha_ini,
            Cobro.fecha <  fecha_fin,
            Cobro.anulado == False,
        )
        .group_by(Cobro.alumno_id)
    )
    cobros_por_alumno = {
        row.alumno_id: (float(row.importe), int(row.num))
        for row in r_cobros_al.all()
    }

    top_alumnos = []
    if top_filas:
        ids = [r.alumno_id for r in top_filas]
        r_nombres = await db.execute(
            select(Alumno.id, Alumno.nombre, Alumno.apellidos).where(Alumno.id.in_(ids))
        )
        nombres = {row.id: f"{row.nombre} {row.apellidos}" for row in r_nombres.all()}

        for r in top_filas:
            importe, num = cobros_por_alumno.get(r.alumno_id, (0.0, 0))
            top_alumnos.append(InformeAlumnoRow(
                alumno_id=r.alumno_id,
                nombre=nombres.get(r.alumno_id, '—'),
                horas=float(r.horas),
                sesiones=int(r.sesiones),
                importe_pagado=importe,
                num_cobros=num,
            ))

    # ── Recaudado mes anterior y mismo mes año anterior ─────────
    anio_ant, mes_ant = _mes_anterior(anio, mes)
    ini_ant, fin_ant = _rango_mes(anio_ant, mes_ant)

    r_rec_mes_ant = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            Cobro.fecha >= ini_ant,
            Cobro.fecha <  fin_ant,
            Cobro.anulado == False,
        )
    )
    recaudado_mes_anterior = float(r_rec_mes_ant.scalar() or 0)

    ini_yy, fin_yy = _rango_mes(anio - 1, mes)
    r_rec_yy = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            Cobro.fecha >= ini_yy,
            Cobro.fecha <  fin_yy,
            Cobro.anulado == False,
        )
    )
    recaudado_anio_anterior = float(r_rec_yy.scalar() or 0)

    # ── Productividad por profesor ──────────────────────────────
    r_prod = await db.execute(
        select(
            Asistencia.profesor_id,
            Asistencia.duracion_min,
            Tarifa.precio_base,
            Tarifa.horas_semanales,
            Tarifa.num_sesiones,
            Tarifa.es_bono_sesion,
            Tarifa.categoria,
            ResumenMensual.semanas_en_mes,
        )
        .join(PackAlumno, Asistencia.pack_alumno_id == PackAlumno.id)
        .join(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .outerjoin(ResumenMensual, and_(
            ResumenMensual.pack_alumno_id == PackAlumno.id,
            ResumenMensual.anio == anio,
            ResumenMensual.mes == mes,
        ))
        .where(
            Asistencia.fecha >= fecha_ini,
            Asistencia.fecha <  fecha_fin,
        )
    )

    productividad: dict[int, dict] = {}
    for row in r_prod.all():
        horas_asist = float(row.duracion_min) / 60.0
        cat_str = (row.categoria.value if hasattr(row.categoria, 'value') else str(row.categoria or '')).lower()
        es_sesion = bool(row.es_bono_sesion) or cat_str == "sesion"

        if es_sesion:
            num_ses = float(row.num_sesiones) if row.num_sesiones else 0.0
            precio_base = float(row.precio_base)
            precio_unit = precio_base / num_ses if num_ses > 0 else 0.0
            importe = precio_unit
            sesion_count = 1
            horas_count = 0.0
        else:
            semanas = float(row.semanas_en_mes) if row.semanas_en_mes else 4.0
            horas_sem = float(row.horas_semanales) if row.horas_semanales else 0.0
            horas_pack = horas_sem * semanas
            precio_base = float(row.precio_base)
            precio_unit = precio_base / horas_pack if horas_pack > 0 else 0.0
            importe = horas_asist * precio_unit
            sesion_count = 0
            horas_count = horas_asist

        pid = row.profesor_id
        if pid not in productividad:
            productividad[pid] = {'horas': 0.0, 'sesiones': 0, 'importe': 0.0}
        productividad[pid]['horas'] += horas_count
        productividad[pid]['sesiones'] += sesion_count
        productividad[pid]['importe'] += importe

    total_generado = sum(v['importe'] for v in productividad.values())

    por_productividad = []
    if productividad:
        ids_prof = list(productividad.keys())
        r_nombres_prof = await db.execute(
            select(Usuario.id, Usuario.nombre, Usuario.apellidos).where(Usuario.id.in_(ids_prof))
        )
        nombres_prof = {
            row.id: f"{row.nombre} {row.apellidos}".strip()
            for row in r_nombres_prof.all()
        }
        for pid, datos in productividad.items():
            por_productividad.append(ProductividadProfesorRow(
                profesor_id=pid,
                nombre=nombres_prof.get(pid, f'Profesor {pid}'),
                horas_totales=round(datos['horas'], 2),
                sesiones_totales=datos['sesiones'],
                importe_generado=round(datos['importe'], 2),
                porcentaje=round((datos['importe'] / total_generado * 100) if total_generado > 0 else 0, 1),
            ))
        por_productividad.sort(key=lambda x: x.importe_generado, reverse=True)

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
        recaudado_mes_anterior=recaudado_mes_anterior,
        recaudado_anio_anterior=recaudado_anio_anterior,
        total_anulado=float(total_anulado),
        num_anulados=int(num_anulados),
        top_alumnos=top_alumnos,
        por_productividad=por_productividad,
    )


# ── Evolución anual (12 meses) ──────────────────────────────────

@router.get("/evolucion", response_model=InformeEvolucionOut)
async def informe_evolucion(
    anio: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    """Recaudación de los 12 meses del año (para gráfico de evolución)."""
    ini = date(anio, 1, 1)
    fin = date(anio + 1, 1, 1)

    r = await db.execute(
        select(
            func.extract('month', Cobro.fecha).label('mes'),
            func.coalesce(func.sum(Cobro.total), 0).label('total'),
            func.count(Cobro.id).label('num'),
        )
        .where(
            Cobro.fecha >= ini,
            Cobro.fecha <  fin,
            Cobro.anulado == False,
        )
        .group_by(func.extract('month', Cobro.fecha))
        .order_by(func.extract('month', Cobro.fecha))
    )

    por_mes = {int(row.mes): (float(row.total), int(row.num)) for row in r.all()}

    meses = []
    total_anio = 0.0
    for m in range(1, 13):
        total, num = por_mes.get(m, (0.0, 0))
        total_anio += total
        meses.append(EvolucionMesOut(
            mes=m,
            mes_label=month_abbr[m],
            recaudado=total,
            num_cobros=num,
        ))

    return InformeEvolucionOut(anio=anio, meses=meses, total_anio=total_anio)


# ── PDF ─────────────────────────────────────────────────────────

@router.get("/mensual/pdf")
async def informe_mensual_pdf(
    anio: int = Query(...),
    mes:  int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    """Genera el PDF del informe mensual."""
    informe = await informe_mensual(anio=anio, mes=mes, db=db, _=_)

    pdf_bytes = generar_informe_pdf(informe)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="informe-{anio}-{mes:02d}.pdf"'
        },
    )