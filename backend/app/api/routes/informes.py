"""
Endpoints de informes:
- GET /informes/mensual?anio=YYYY&mes=MM      → informe del mes
- GET /informes/evolucion?anio=YYYY            → 12 meses del año
- GET /informes/mensual/pdf?anio=YYYY&mes=MM   → descarga PDF del informe
"""
import json
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from calendar import month_abbr
from datetime import date

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import (
    Usuario, Cobro, CobroPago, CobroPack, Asistencia, ResumenMensual,
    TipoClase, Alumno, PackAlumno, Tarifa,
)
from app.schemas.schemas import (
    InformeMensualOut, InformeProfesorRow, InformeAlumnoRow,
    InformeEvolucionOut, EvolucionMesOut, ProductividadProfesorRow,
)
from app.services.informe_pdf_service import generar_informe_pdf

router = APIRouter()


def _rango_mes(anio: int, mes: int):
    ini = date(anio, mes, 1)
    fin = date(anio + 1, 1, 1) if mes == 12 else date(anio, mes + 1, 1)
    return ini, fin


def _mes_anterior(anio: int, mes: int):
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


async def _sumar_tasas_examen_periodo(
    db: AsyncSession, fecha_ini: date, fecha_fin: date
) -> float:
    total = 0.0
    result = await db.execute(
        select(Cobro.conceptos_json).where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == False,
            Cobro.conceptos_json.isnot(None),
        )
    )
    for (cjson,) in result.all():
        try:
            for c in json.loads(cjson):
                if c.get("es_tasa_examen"):
                    cantidad = int(c.get("cantidad", 1) or 1)
                    if cantidad < 1:
                        cantidad = 1
                    total += float(c.get("importe", 0)) * cantidad
        except Exception:
            pass

    result_packs = await db.execute(
        select(func.coalesce(func.sum(CobroPack.importe), 0))
        .join(Cobro, CobroPack.cobro_id == Cobro.id)
        .join(PackAlumno, CobroPack.pack_alumno_id == PackAlumno.id)
        .join(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == False,
            Tarifa.es_tasa_examen == True,
        )
    )
    total += float(result_packs.scalar() or 0)

    return total


async def _sumar_tasas_examen_por_mes(
    db: AsyncSession, anio: int
) -> dict[int, float]:
    ini = date(anio, 1, 1)
    fin = date(anio + 1, 1, 1)
    por_mes: dict[int, float] = {}

    result = await db.execute(
        select(
            func.extract('month', Cobro.fecha_operacion).label('mes'),
            Cobro.conceptos_json,
        ).where(
            Cobro.fecha_operacion >= ini,
            Cobro.fecha_operacion <  fin,
            Cobro.anulado == False,
            Cobro.conceptos_json.isnot(None),
        )
    )
    for mes, cjson in result.all():
        try:
            for c in json.loads(cjson):
                if c.get("es_tasa_examen"):
                    cantidad = int(c.get("cantidad", 1) or 1)
                    if cantidad < 1:
                        cantidad = 1
                    por_mes[int(mes)] = por_mes.get(int(mes), 0.0) + float(c.get("importe", 0)) * cantidad
        except Exception:
            pass

    result_packs = await db.execute(
        select(
            func.extract('month', Cobro.fecha_operacion).label('mes'),
            func.coalesce(func.sum(CobroPack.importe), 0).label('total'),
        )
        .join(Cobro, CobroPack.cobro_id == Cobro.id)
        .join(PackAlumno, CobroPack.pack_alumno_id == PackAlumno.id)
        .join(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            Cobro.fecha_operacion >= ini,
            Cobro.fecha_operacion <  fin,
            Cobro.anulado == False,
            Tarifa.es_tasa_examen == True,
        )
        .group_by(func.extract('month', Cobro.fecha_operacion))
    )
    for mes, total in result_packs.all():
        por_mes[int(mes)] = por_mes.get(int(mes), 0.0) + float(total or 0)

    return por_mes


@router.get("/mensual", response_model=InformeMensualOut)
async def informe_mensual(
    anio: int = Query(...),
    mes:  int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    fecha_ini, fecha_fin = _rango_mes(anio, mes)

    r_rec = await db.execute(
        select(
            func.coalesce(func.sum(Cobro.total), 0),
            func.count(Cobro.id),
        ).where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == False,
        )
    )
    recaudado_bruto, num_cobros = r_rec.one()

    tasas_examen = await _sumar_tasas_examen_periodo(db, fecha_ini, fecha_fin)
    recaudado = float(recaudado_bruto) - tasas_examen

    r_anul = await db.execute(
        select(
            func.coalesce(func.sum(Cobro.total), 0),
            func.count(Cobro.id),
        ).where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == True,
        )
    )
    total_anulado, num_anulados = r_anul.one()

    r_alumnos = await db.execute(
        select(func.count(func.distinct(ResumenMensual.alumno_id))).where(
            ResumenMensual.anio == anio,
            ResumenMensual.mes  == mes,
            ResumenMensual.horas_consumidas + ResumenMensual.sesiones_consumidas > 0,
        )
    )
    alumnos_activos = r_alumnos.scalar() or 0

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

    r_pagos = await db.execute(
        select(
            CobroPago.forma_pago,
            func.coalesce(func.sum(CobroPago.importe), 0).label("total"),
            func.count(func.distinct(CobroPago.cobro_id)).label("num_cobros"),
        )
        .join(Cobro, CobroPago.cobro_id == Cobro.id)
        .where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
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

    r_mixtos = await db.execute(
        select(
            CobroPago.cobro_id,
            func.coalesce(func.sum(CobroPago.importe), 0).label("total"),
        )
        .join(Cobro, CobroPago.cobro_id == Cobro.id)
        .where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == False,
        )
        .group_by(CobroPago.cobro_id)
        .having(func.count(CobroPago.id) > 1)
    )
    mixtos = r_mixtos.all()
    cobros_mixtos = len(mixtos)
    total_mixtos = sum(float(m.total) for m in mixtos)

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

    por_profesor = []
    for v in profesores.values():
        v["horas_totales"] = round(v["horas_normal"] + v["horas_ingles"], 2)
        por_profesor.append(InformeProfesorRow(**v))

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

    r_cobros_al = await db.execute(
        select(
            Cobro.alumno_id,
            func.coalesce(func.sum(Cobro.total), 0).label('importe'),
            func.count(Cobro.id).label('num'),
        )
        .where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
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

    anio_ant, mes_ant = _mes_anterior(anio, mes)
    ini_ant, fin_ant = _rango_mes(anio_ant, mes_ant)

    r_rec_mes_ant = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            Cobro.fecha_operacion >= ini_ant,
            Cobro.fecha_operacion <  fin_ant,
            Cobro.anulado == False,
        )
    )
    recaudado_mes_anterior_bruto = float(r_rec_mes_ant.scalar() or 0)
    tasas_ant = await _sumar_tasas_examen_periodo(db, ini_ant, fin_ant)
    recaudado_mes_anterior = recaudado_mes_anterior_bruto - tasas_ant

    ini_yy, fin_yy = _rango_mes(anio - 1, mes)
    r_rec_yy = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            Cobro.fecha_operacion >= ini_yy,
            Cobro.fecha_operacion <  fin_yy,
            Cobro.anulado == False,
        )
    )
    recaudado_anio_anterior_bruto = float(r_rec_yy.scalar() or 0)
    tasas_yy = await _sumar_tasas_examen_periodo(db, ini_yy, fin_yy)
    recaudado_anio_anterior = recaudado_anio_anterior_bruto - tasas_yy

    # ── Productividad por profesor ──────────────────────────────
    # Solo cuentan asistencias cuyo pack ha sido PAGADO este mes.
    # "Pagado" =
    #   a) el pack está directamente vinculado a un cobro del mes, o
    #   b) el alumno dueño del pack ha pagado algo este mes
    #      (cubre el caso "cobré N sesiones sueltas y luego asigné el pack").

    # a) Packs directamente vinculados a cobros del mes
    paid_packs_result = await db.execute(
        select(CobroPack.pack_alumno_id)
        .join(Cobro, CobroPack.cobro_id == Cobro.id)
        .where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == False,
            CobroPack.pack_alumno_id.isnot(None),
        )
    )
    paid_packs = {row[0] for row in paid_packs_result.all() if row[0] is not None}

    # b) Packs ACTIVOS de alumnos que han pagado algo este mes
    alumnos_pagaron_result = await db.execute(
        select(Cobro.alumno_id)
        .where(
            Cobro.fecha_operacion >= fecha_ini,
            Cobro.fecha_operacion <  fecha_fin,
            Cobro.anulado == False,
        )
        .distinct()
    )
    alumnos_pagaron = {row[0] for row in alumnos_pagaron_result.all()}

    if alumnos_pagaron:
        packs_pagadores_result = await db.execute(
            select(PackAlumno.id)
            .where(
                PackAlumno.alumno_id.in_(alumnos_pagaron),
                PackAlumno.activo == True,
                PackAlumno.tarifa_id.isnot(None),
            )
        )
        paid_packs.update({
            row[0] for row in packs_pagadores_result.all() if row[0] is not None
        })

    productividad: dict[int, dict] = {}

    if paid_packs:
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
                Asistencia.pack_alumno_id.in_(paid_packs),
            )
        )

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

    # Mostrar TODOS los profesores con actividad este mes,
    # rellenando con 0 los que no tengan aún ningún pack pagado.
    por_productividad = []
    for prof in por_profesor:
        datos = productividad.get(
            prof.profesor_id,
            {'horas': 0.0, 'sesiones': 0, 'importe': 0.0},
        )
        por_productividad.append(ProductividadProfesorRow(
            profesor_id=prof.profesor_id,
            nombre=prof.nombre,
            horas_totales=round(datos['horas'], 2),
            sesiones_totales=datos['sesiones'],
            importe_generado=round(datos['importe'], 2),
            porcentaje=round(
                (datos['importe'] / total_generado * 100) if total_generado > 0 else 0,
                1,
            ),
        ))
    por_productividad.sort(key=lambda x: x.importe_generado, reverse=True)

    return InformeMensualOut(
        anio=anio,
        mes=mes,
        mes_label=f"{month_abbr[mes]} {anio}",
        recaudado=recaudado,
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


@router.get("/evolucion", response_model=InformeEvolucionOut)
async def informe_evolucion(
    anio: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    ini = date(anio, 1, 1)
    fin = date(anio + 1, 1, 1)

    r = await db.execute(
        select(
            func.extract('month', Cobro.fecha_operacion).label('mes'),
            func.coalesce(func.sum(Cobro.total), 0).label('total'),
            func.count(Cobro.id).label('num'),
        )
        .where(
            Cobro.fecha_operacion >= ini,
            Cobro.fecha_operacion <  fin,
            Cobro.anulado == False,
        )
        .group_by(func.extract('month', Cobro.fecha_operacion))
        .order_by(func.extract('month', Cobro.fecha_operacion))
    )

    por_mes = {int(row.mes): (float(row.total), int(row.num)) for row in r.all()}

    tasas_por_mes = await _sumar_tasas_examen_por_mes(db, anio)

    meses = []
    total_anio = 0.0
    for m in range(1, 13):
        total_bruto, num = por_mes.get(m, (0.0, 0))
        total = total_bruto - tasas_por_mes.get(m, 0.0)
        total_anio += total
        meses.append(EvolucionMesOut(
            mes=m,
            mes_label=month_abbr[m],
            recaudado=total,
            num_cobros=num,
        ))

    return InformeEvolucionOut(anio=anio, meses=meses, total_anio=total_anio)


@router.get("/mensual/pdf")
async def informe_mensual_pdf(
    anio: int = Query(...),
    mes:  int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _:   Usuario = Depends(get_current_admin),
):
    informe = await informe_mensual(anio=anio, mes=mes, db=db, _=_)

    pdf_bytes = generar_informe_pdf(informe)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="informe-{anio}-{mes:02d}.pdf"'
        },
    )