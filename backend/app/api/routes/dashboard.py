import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, exists
from sqlalchemy.orm import selectinload
from datetime import date, datetime, time

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import (
    Usuario, Alumno, Asistencia, ResumenMensual,
    PackAlumno, Cobro, CobroPack, TipoClase, Tarifa, CategoriaEnum,
)
from app.schemas.schemas import (
    DashboardAhora, StatsGenerales, ClaseEnCurso, AlumnoDashboard,
    DeudaAcumuladaOut,
)
from app.services.asistencias_service import (
    calcular_estado,
    calcular_margen_y_tope,
)

router = APIRouter()


async def _buscar_tarifa_superior(
    db: AsyncSession,
    tarifa_actual: Tarifa | None,
) -> Tarifa | None:
    """
    Dado un pack actual, busca la siguiente tarifa superior del mismo tipo.
    - Normal / Inglés → siguiente con MÁS horas_semanales
    - Sesión → siguiente con MÁS num_sesiones
    Devuelve None si no hay superior o no hay tarifa de referencia.
    """
    if tarifa_actual is None:
        return None

    base = select(Tarifa).where(
        Tarifa.categoria == tarifa_actual.categoria,
        Tarifa.activo == True,
        Tarifa.id != tarifa_actual.id,
    )

    if tarifa_actual.categoria in (CategoriaEnum.normal, CategoriaEnum.ingles):
        if not tarifa_actual.horas_semanales:
            return None
        stmt = (
            base.where(Tarifa.horas_semanales > tarifa_actual.horas_semanales)
            .order_by(Tarifa.horas_semanales.asc())
            .limit(1)
        )
    else:  # sesion
        if not tarifa_actual.num_sesiones:
            return None
        stmt = (
            base.where(Tarifa.num_sesiones > tarifa_actual.num_sesiones)
            .order_by(Tarifa.num_sesiones.asc())
            .limit(1)
        )

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ── SEMÁFORO ──────────────────────────────────────────────────────────────────

def calcular_semaforo(
    resumen: ResumenMensual | None,
    tiene_cobro_mes: bool,
    tiene_pack_contratado: bool = False,
) -> tuple[str, float | None]:
    """
    Devuelve (estado, importe_debido).
    importe_debido solo se rellena si el estado es 'rojo' y no hay cobro.
    """
    if resumen is None:
        if tiene_pack_contratado and not tiene_cobro_mes:
            return "rojo", None
        return "verde", None

    horas_consumidas    = float(resumen.horas_consumidas or 0)
    sesiones_consumidas = resumen.sesiones_consumidas or 0
    horas_contratadas   = float(resumen.horas_contratadas) if resumen.horas_contratadas else None
    sesiones_contratadas = resumen.sesiones_contratadas

    tiene_pack      = tiene_pack_contratado or horas_contratadas is not None or sesiones_contratadas is not None
    tiene_actividad = horas_consumidas > 0 or sesiones_consumidas > 0
    if (tiene_pack or tiene_actividad) and not tiene_cobro_mes:
        return "rojo", None

    es_sesion = sesiones_contratadas is not None
    estado, _ = calcular_estado(
        horas_consumidas     = horas_consumidas,
        horas_contratadas    = horas_contratadas,
        sesiones_consumidas  = sesiones_consumidas,
        sesiones_contratadas = sesiones_contratadas,
        semanas_en_mes       = resumen.semanas_en_mes or 4,
        tiene_pago_pendiente = False,
        es_sesion            = es_sesion,
    )
    return estado, None


async def _cobros_del_mes(db: AsyncSession, anio: int, mes: int) -> set[int]:
    """
    Devuelve el set de alumno_ids que tienen cobro válido en el mes,
    agrupando por FECHA DE OPERACIÓN (no la de creación del cobro).
    """
    result = await db.execute(
        select(Cobro.alumno_id).where(
            and_(
                func.extract("year",  Cobro.fecha_operacion) == anio,
                func.extract("month", Cobro.fecha_operacion) == mes,
                Cobro.anulado == False,
            )
        ).distinct()
    )
    return {row[0] for row in result.all()}


async def _horas_extra_cobradas_mes(
    db: AsyncSession, anio: int, mes: int
) -> dict[int, float]:
    """
    Para cada alumno con cobro NO anulado este mes, suma las `horas_cubiertas`
    de sus conceptos_extra.
    """
    result = await db.execute(
        select(Cobro.alumno_id, Cobro.conceptos_json).where(
            and_(
                func.extract("year",  Cobro.fecha_operacion) == anio,
                func.extract("month", Cobro.fecha_operacion) == mes,
                Cobro.anulado == False,
                Cobro.conceptos_json.isnot(None),
            )
        )
    )
    por_alumno: dict[int, float] = {}
    for alumno_id, cjson in result.all():
        try:
            for c in json.loads(cjson):
                hc = c.get("horas_cubiertas")
                if hc:
                    por_alumno[alumno_id] = por_alumno.get(alumno_id, 0.0) + float(hc)
        except Exception:
            pass
    return por_alumno


async def _sumar_tasas_examen_mes(db: AsyncSession, anio: int, mes: int) -> float:
    """
    Suma los importes de tasas de examen del mes:
    - conceptos_extra con es_tasa_examen=True
    - packs vinculados a una tarifa con es_tasa_examen=True
    Esas cantidades NO cuentan como beneficio.
    """
    total = 0.0

    # 1) Tasas cobradas como concepto libre
    result = await db.execute(
        select(Cobro.conceptos_json).where(
            and_(
                func.extract("year",  Cobro.fecha_operacion) == anio,
                func.extract("month", Cobro.fecha_operacion) == mes,
                Cobro.anulado == False,
                Cobro.conceptos_json.isnot(None),
            )
        )
    )
    for (cjson,) in result.all():
        try:
            for c in json.loads(cjson):
                if c.get("es_tasa_examen"):
                    total += float(c.get("importe", 0))
        except Exception:
            pass

    # 2) Tasas cobradas como pack (tarifa marcada como es_tasa_examen)
    result_packs = await db.execute(
        select(func.coalesce(func.sum(CobroPack.importe), 0))
        .join(Cobro, CobroPack.cobro_id == Cobro.id)
        .join(PackAlumno, CobroPack.pack_alumno_id == PackAlumno.id)
        .join(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            and_(
                func.extract("year",  Cobro.fecha_operacion) == anio,
                func.extract("month", Cobro.fecha_operacion) == mes,
                Cobro.anulado == False,
                Tarifa.es_tasa_examen == True,
            )
        )
    )
    total += float(result_packs.scalar() or 0)

    return total


# ── HELPERS HORARIOS ──────────────────────────────────────────────────────────

def _generar_horas_clase(hora_inicio: time | None, duracion_min: int | None) -> list[str]:
    """
    Devuelve la lista de horas (HH:MM:SS) en las que debe aparecer esta clase:
    - SIEMPRE incluye la hora REAL de inicio (sin redondear hacia abajo)
    - Añade cada hora en punto que la clase atraviese

    Ejemplos:
      10:00 + 120min → ['10:00:00', '11:00:00']
      10:30 +  60min → ['10:30:00', '11:00:00']
      15:45 +  60min → ['15:45:00', '16:00:00']
      10:00 +  60min → ['10:00:00']
    """
    if not hora_inicio:
        return ["sin_hora"]
    try:
        inicio_min = hora_inicio.hour * 60 + hora_inicio.minute
        dur = duracion_min or 60
        fin_min = inicio_min + dur

        slots = [hora_inicio.strftime("%H:%M:%S")]

        # Primera hora en punto DESPUÉS del inicio
        primer_mark = ((inicio_min // 60) + 1) * 60
        cursor = primer_mark
        while cursor < fin_min:
            h = (cursor // 60) % 24
            slots.append(f"{h:02d}:00:00")
            cursor += 60

        return slots
    except Exception:
        return ["sin_hora"]


# ── STATS ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsGenerales)
async def stats_generales(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    hoy = date.today()
    mes_actual  = hoy.month
    anio_actual = hoy.year

    r = await db.execute(select(func.count()).where(Alumno.activo == True))
    alumnos_activos = r.scalar() or 0

    r3 = await db.execute(select(func.count()).where(Asistencia.fecha == hoy))
    asistencias_hoy = r3.scalar() or 0

    r4 = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            and_(
                func.extract("month", Cobro.fecha_operacion) == mes_actual,
                func.extract("year",  Cobro.fecha_operacion) == anio_actual,
                Cobro.anulado == False,
            )
        )
    )
    recaudado_bruto = float(r4.scalar() or 0)

    tasas_examen_mes = await _sumar_tasas_examen_mes(db, anio_actual, mes_actual)
    recaudado_mes = recaudado_bruto - tasas_examen_mes

    cobros_mes = await _cobros_del_mes(db, anio_actual, mes_actual)

    result = await db.execute(
        select(PackAlumno, ResumenMensual, Alumno, Tarifa)
        .join(Alumno, PackAlumno.alumno_id == Alumno.id)
        .outerjoin(
            ResumenMensual,
            and_(
                ResumenMensual.pack_alumno_id == PackAlumno.id,
                ResumenMensual.anio == anio_actual,
                ResumenMensual.mes  == mes_actual,
            ),
        )
        .outerjoin(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            PackAlumno.activo == True,
            PackAlumno.tarifa_id.is_not(None),
            Alumno.activo == True,
        )
    )
    rows = result.all()

    por_alumno: dict[int, list] = {}
    for pack, resumen, alumno, tarifa in rows:
        por_alumno.setdefault(alumno.id, []).append((pack, resumen, tarifa))

    pagos_pendientes  = 0
    importe_pendiente = 0.0

    for alumno_id, packs_info in por_alumno.items():
        tiene_cobro = alumno_id in cobros_mes
        if tiene_cobro:
            continue

        con_resumen = [(p, r, t) for (p, r, t) in packs_info if r is not None]
        if con_resumen:
            _, resumen, tarifa_principal = max(
                con_resumen, key=lambda x: float(x[1].horas_consumidas or 0)
            )
        else:
            _, resumen, tarifa_principal = packs_info[0]

        estado, _ = calcular_semaforo(
            resumen, tiene_cobro, tiene_pack_contratado=True
        )
        if estado == "rojo":
            pagos_pendientes += 1
            if tarifa_principal:
                importe_pendiente += float(tarifa_principal.precio_base)

    return StatsGenerales(
        alumnos_activos    = alumnos_activos,
        pagos_pendientes   = pagos_pendientes,
        importe_pendiente  = importe_pendiente,
        asistencias_hoy    = asistencias_hoy,
        recaudado_mes      = recaudado_mes,
    )


# ── AHORA ─────────────────────────────────────────────────────────────────────

@router.get("/ahora", response_model=DashboardAhora)
async def dashboard_ahora(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    hoy = date.today()
    cobros_mes = await _cobros_del_mes(db, hoy.year, hoy.month)
    horas_extra_cobradas = await _horas_extra_cobradas_mes(db, hoy.year, hoy.month)

    result = await db.execute(
        select(Asistencia, Alumno, Usuario, TipoClase)
        .join(Alumno,    Asistencia.alumno_id    == Alumno.id)
        .join(Usuario,   Asistencia.profesor_id  == Usuario.id)
        .join(TipoClase, Asistencia.tipo_clase_id == TipoClase.id)
        .where(Asistencia.fecha == hoy)
        .order_by(Asistencia.hora_inicio)
    )
    rows = result.all()

    alumno_ids = {alumno.id for _, alumno, _, _ in rows}
    packs_por_alumno: dict[int, list] = {}
    if alumno_ids:
        packs_result = await db.execute(
            select(PackAlumno, ResumenMensual, Tarifa)
            .outerjoin(
                ResumenMensual,
                and_(
                    ResumenMensual.pack_alumno_id == PackAlumno.id,
                    ResumenMensual.anio == hoy.year,
                    ResumenMensual.mes  == hoy.month,
                ),
            )
            .outerjoin(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
            .where(
                PackAlumno.alumno_id.in_(alumno_ids),
                PackAlumno.activo == True,
            )
        )
        for pack, resumen, tarifa in packs_result.all():
            packs_por_alumno.setdefault(pack.alumno_id, []).append(
                (pack, resumen, tarifa)
            )

    alumno_dashboard_cache: dict[int, AlumnoDashboard] = {}
    clases_unicas_set: set[tuple[int, int, str]] = set()

    def _get_alumno_dashboard(alumno):
        if alumno.id in alumno_dashboard_cache:
            return alumno_dashboard_cache[alumno.id]

        packs_info = packs_por_alumno.get(alumno.id, [])

        con_resumen = [(p, r, t) for (p, r, t) in packs_info if r is not None]
        if con_resumen:
            _, resumen, _ = max(con_resumen, key=lambda x: float(x[1].horas_consumidas or 0))
        elif packs_info:
            _, resumen, _ = packs_info[0]
        else:
            resumen = None

        horas_mes = float(resumen.horas_consumidas or 0) if resumen else 0.0
        sesiones_mes = (resumen.sesiones_consumidas or 0) if resumen else 0
        horas_contratadas = (
            float(resumen.horas_contratadas)
            if resumen and resumen.horas_contratadas
            else None
        )
        sesiones_contratadas = resumen.sesiones_contratadas if resumen else None

        if sesiones_contratadas is None and horas_contratadas:
            margen, tope = calcular_margen_y_tope(horas_contratadas)
        else:
            margen, tope = 0.0, 0.0

        tiene_cobro = alumno.id in cobros_mes
        tiene_pack = len(packs_info) > 0
        estado, importe_debido = calcular_semaforo(
            resumen, tiene_cobro, tiene_pack_contratado=tiene_pack
        )

        horas_exceso_residual = None
        if estado == "naranja":
            exceso_actual = float(horas_mes) - float(horas_contratadas or 0)
            cubierto = horas_extra_cobradas.get(alumno.id, 0.0)
            residual = max(0.0, exceso_actual - cubierto)
            if residual <= 0:
                estado = "verde"
            else:
                horas_exceso_residual = residual

        out = AlumnoDashboard(
            id                    = alumno.id,
            nombre                = alumno.nombre,
            apellidos             = alumno.apellidos,
            estado                = estado,
            horas_mes             = horas_mes,
            sesiones_mes          = sesiones_mes,
            horas_contratadas     = horas_contratadas,
            sesiones_contratadas  = sesiones_contratadas,
            importe_debido        = importe_debido,
            margen_horas          = margen,
            tope_horas            = tope,
            horas_exceso_residual = horas_exceso_residual,
        )
        alumno_dashboard_cache[alumno.id] = out
        return out

        clases: dict[str, ClaseEnCurso] = {}
    for asistencia, alumno, profesor, tipo_clase in rows:
        # Expandir la asistencia a TODAS las horas en las que está activa:
        # su hora real de inicio + cada hora en punto que cruza.
        horas = _generar_horas_clase(asistencia.hora_inicio, asistencia.duracion_min)

        # Registrar la clase única (sin expansión) para el contador
        hora_real = (
            asistencia.hora_inicio.strftime("%H:%M:%S")
            if asistencia.hora_inicio
            else "sin_hora"
        )
        clases_unicas_set.add((profesor.id, tipo_clase.id, hora_real))

        for hora_str in horas:
            key = f"{profesor.id}-{tipo_clase.id}-{hora_str}"
            if key not in clases:
                clases[key] = ClaseEnCurso(
                    profesor_id     = profesor.id,
                    profesor_nombre = f"{profesor.nombre} {profesor.apellidos}",
                    tipo_clase      = tipo_clase.nombre,
                    hora_inicio     = hora_str,
                    alumnos         = [],
                )

            alumno_obj = _get_alumno_dashboard(alumno)
            if not any(a.id == alumno.id for a in clases[key].alumnos):
                clases[key].alumnos.append(alumno_obj)

    # Ordenar por hora real ascendente (y por profesor como desempate)
    clases_list = sorted(
        clases.values(),
        key=lambda c: (c.hora_inicio or "99:99", c.profesor_nombre),
    )

    total = len(alumno_dashboard_cache)

    return DashboardAhora(
        clases_en_curso     = clases_list,
        total_alumnos_ahora = total,
        total_clases_unicas = len(clases_unicas_set),
    )


# ── MES ───────────────────────────────────────────────────────────────────────

@router.get("/mes", response_model=list[AlumnoDashboard])
async def dashboard_mes(
    anio: int = Query(default=None),
    mes:  int = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    hoy  = date.today()
    anio = anio or hoy.year
    mes  = mes  or hoy.month

    cobros_mes = await _cobros_del_mes(db, anio, mes)
    horas_extra_cobradas = await _horas_extra_cobradas_mes(db, anio, mes)

    result = await db.execute(
        select(PackAlumno, ResumenMensual, Alumno, Tarifa)
        .join(Alumno, PackAlumno.alumno_id == Alumno.id)
        .outerjoin(
            ResumenMensual,
            and_(
                ResumenMensual.pack_alumno_id == PackAlumno.id,
                ResumenMensual.anio == anio,
                ResumenMensual.mes  == mes,
            ),
        )
        .outerjoin(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            PackAlumno.activo == True,
            Alumno.activo == True,
        )
        .order_by(Alumno.apellidos, Alumno.nombre)
    )
    rows = result.all()

    por_alumno: dict[int, tuple[Alumno, list]] = {}
    for pack, resumen, alumno, tarifa in rows:
        if alumno.id not in por_alumno:
            por_alumno[alumno.id] = (alumno, [])
        por_alumno[alumno.id][1].append((pack, resumen, tarifa))

    alumnos_dashboard = []
    for alumno_id, (alumno, packs_info) in por_alumno.items():
        tiene_cobro = alumno_id in cobros_mes

        con_resumen = [(p, r, t) for (p, r, t) in packs_info if r is not None]
        if con_resumen:
            _, resumen, _ = max(
                con_resumen, key=lambda x: float(x[1].horas_consumidas or 0)
            )
        else:
            _, resumen, _ = packs_info[0]

        horas_mes    = sum(float(r.horas_consumidas or 0) for (_, r, _) in packs_info if r is not None)
        sesiones_mes = sum((r.sesiones_consumidas or 0) for (_, r, _) in packs_info if r is not None)
        horas_contratadas = sum(
            float(r.horas_contratadas)
            for (_, r, _) in packs_info if r is not None and r.horas_contratadas
        ) or None
        sesiones_contratadas = sum(
            r.sesiones_contratadas
            for (_, r, _) in packs_info if r is not None and r.sesiones_contratadas
        ) or None

        estado, importe_debido = calcular_semaforo(
            resumen, tiene_cobro, tiene_pack_contratado=True
        )

        horas_exceso_residual = None
        if estado == "naranja":
            exceso_actual = float(horas_mes) - float(horas_contratadas or 0)
            cubierto = horas_extra_cobradas.get(alumno_id, 0.0)
            residual = max(0.0, exceso_actual - cubierto)
            if residual <= 0:
                estado = "verde"
                importe_debido = None
            else:
                horas_exceso_residual = residual

        if estado == "rojo" and not importe_debido:
            con_resumen_full = [(p, r, t) for (p, r, t) in packs_info if r is not None]
            if con_resumen_full:
                _, _, tarifa_principal = max(
                    con_resumen_full, key=lambda x: float(x[1].horas_consumidas or 0)
                )
            else:
                _, _, tarifa_principal = packs_info[0]
            if tarifa_principal:
                importe_debido = float(tarifa_principal.precio_base)

        if sesiones_contratadas is None and horas_contratadas:
            margen, tope = calcular_margen_y_tope(horas_contratadas)
        else:
            margen, tope = 0.0, 0.0

        alumnos_dashboard.append(AlumnoDashboard(
            id                    = alumno.id,
            nombre                = alumno.nombre,
            apellidos             = alumno.apellidos,
            estado                = estado,
            horas_mes             = horas_mes,
            sesiones_mes          = sesiones_mes,
            horas_contratadas     = horas_contratadas,
            sesiones_contratadas  = sesiones_contratadas,
            importe_debido        = importe_debido,
            margen_horas          = margen,
            tope_horas            = tope,
            horas_exceso_residual = horas_exceso_residual,
        ))

    orden = {"rojo": 0, "naranja": 1, "verde": 2, "amarillo": 3}
    alumnos_dashboard.sort(key=lambda a: orden.get(a.estado, 9))

    return alumnos_dashboard


# ── ALERTAS SEMÁFORO ──────────────────────────────────────────────────────────

@router.get("/alertas-semaforo", response_model=list[AlumnoDashboard])
async def obtener_alertas_semaforo(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    hoy = date.today()
    cobros_mes = await _cobros_del_mes(db, hoy.year, hoy.month)
    horas_extra_cobradas = await _horas_extra_cobradas_mes(db, hoy.year, hoy.month)

    result = await db.execute(
        select(PackAlumno, ResumenMensual, Alumno, Tarifa)
        .join(Alumno, PackAlumno.alumno_id == Alumno.id)
        .outerjoin(
            ResumenMensual,
            and_(
                ResumenMensual.pack_alumno_id == PackAlumno.id,
                ResumenMensual.anio == hoy.year,
                ResumenMensual.mes  == hoy.month,
            ),
        )
        .outerjoin(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            PackAlumno.activo == True,
            PackAlumno.tarifa_id.is_not(None),
            Alumno.activo == True,
        )
    )
    rows = result.all()

    por_alumno: dict[int, tuple[Alumno, list]] = {}
    for pack, resumen, alumno, tarifa in rows:
        if alumno.id not in por_alumno:
            por_alumno[alumno.id] = (alumno, [])
        por_alumno[alumno.id][1].append((pack, resumen, tarifa))

    alertas_dashboard = []
    for alumno_id, (alumno, packs_info) in por_alumno.items():
        tiene_cobro = alumno_id in cobros_mes

        con_resumen = [(p, r, t) for (p, r, t) in packs_info if r is not None]
        if con_resumen:
            _, resumen_principal, tarifa_principal = max(
                con_resumen, key=lambda x: float(x[1].horas_consumidas or 0)
            )
        else:
            _, resumen_principal, tarifa_principal = packs_info[0]

        estado, importe_debido = calcular_semaforo(
            resumen_principal, tiene_cobro, tiene_pack_contratado=True
        )

        if estado != "verde":
            horas_mes    = sum(float(r.horas_consumidas or 0) for (_, r, _) in packs_info if r is not None)
            sesiones_mes = sum((r.sesiones_consumidas or 0) for (_, r, _) in packs_info if r is not None)
            horas_contratadas = sum(
                float(r.horas_contratadas) for (_, r, _) in packs_info if r is not None and r.horas_contratadas
            ) or None
            sesiones_contratadas = sum(
                r.sesiones_contratadas for (_, r, _) in packs_info if r is not None and r.sesiones_contratadas
            ) or None

            horas_exceso_residual = None
            if estado == "naranja":
                exceso_actual = float(horas_mes) - float(horas_contratadas or 0)
                cubierto = horas_extra_cobradas.get(alumno_id, 0.0)
                residual = max(0.0, exceso_actual - cubierto)
                if residual <= 0:
                    continue
                horas_exceso_residual = residual

            if estado == "rojo" and not importe_debido and tarifa_principal:
                importe_debido = float(tarifa_principal.precio_base)

            if sesiones_contratadas is None and horas_contratadas:
                margen, tope = calcular_margen_y_tope(horas_contratadas)
            else:
                margen, tope = 0.0, 0.0

            tarifa_sup = None
            if estado == "naranja":
                tarifa_sup = await _buscar_tarifa_superior(db, tarifa_principal)

            alertas_dashboard.append(AlumnoDashboard(
                id                    = alumno.id,
                nombre                = alumno.nombre,
                apellidos             = alumno.apellidos,
                estado                = estado,
                horas_mes             = horas_mes,
                sesiones_mes          = sesiones_mes,
                horas_contratadas     = horas_contratadas,
                sesiones_contratadas  = sesiones_contratadas,
                importe_debido        = importe_debido,
                margen_horas          = margen,
                tope_horas            = tope,
                tarifa_sugerida_id     = tarifa_sup.id if tarifa_sup else None,
                tarifa_sugerida_nombre = tarifa_sup.nombre if tarifa_sup else None,
                tarifa_sugerida_precio = float(tarifa_sup.precio_base) if tarifa_sup else None,
                tarifa_sugerida_horas  = float(tarifa_sup.horas_semanales) if tarifa_sup and tarifa_sup.horas_semanales else None,
                tarifa_actual_precio   = float(tarifa_principal.precio_base) if tarifa_principal else None,
                horas_exceso_residual  = horas_exceso_residual,
            ))

    orden_criticidad = {"rojo": 0, "naranja": 1, "amarillo": 2}
    alertas_dashboard.sort(key=lambda a: orden_criticidad.get(a.estado, 9))

    return alertas_dashboard


# ── DEUDAS ACUMULADAS ─────────────────────────────────────────────────────────

@router.get("/deudas-acumuladas", response_model=list[DeudaAcumuladaOut])
async def deudas_acumuladas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    result = await db.execute(
        select(PackAlumno, Alumno)
        .join(Alumno, PackAlumno.alumno_id == Alumno.id)
        .where(
            PackAlumno.tarifa_id.is_(None),
            PackAlumno.categoria_pendiente.is_not(None),
            Alumno.activo == True,
        )
    )
    packs_pendientes = result.all()

    if not packs_pendientes:
        return []

    deudas = []
    for pack, alumno in packs_pendientes:
        asist_result = await db.execute(
            select(
                func.count(Asistencia.id),
                func.coalesce(func.sum(Asistencia.duracion_min), 0),
                func.min(Asistencia.fecha),
                func.max(Asistencia.fecha),
            ).where(Asistencia.pack_alumno_id == pack.id)
        )
        num_asistencias, total_min, primera, ultima = asist_result.one()

        if num_asistencias == 0:
            continue

        es_sesion = pack.categoria_pendiente == "sesion"
        total_horas = 0.0 if es_sesion else float(total_min) / 60.0
        total_sesiones = int(num_asistencias) if es_sesion else 0

        meses_result = await db.execute(
            select(func.count(func.distinct(
                func.concat(
                    func.extract("year", Asistencia.fecha),
                    "-",
                    func.extract("month", Asistencia.fecha),
                )
            ))).where(Asistencia.pack_alumno_id == pack.id)
        )
        meses_afectados = meses_result.scalar() or 1

        deudas.append(DeudaAcumuladaOut(
            pack_id=pack.id,
            alumno_id=alumno.id,
            alumno_nombre=f"{alumno.nombre} {alumno.apellidos}",
            categoria_pendiente=pack.categoria_pendiente,
            primera_asistencia=primera,
            ultima_asistencia=ultima,
            total_horas=total_horas,
            total_sesiones=total_sesiones,
            num_asistencias=int(num_asistencias),
            meses_afectados=int(meses_afectados),
        ))

    deudas.sort(key=lambda d: d.primera_asistencia or date.max)
    return deudas