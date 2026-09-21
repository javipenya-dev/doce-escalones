from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, exists
from sqlalchemy.orm import selectinload
from datetime import date, datetime

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import (
    Usuario, Alumno, Asistencia, ResumenMensual,
    PackAlumno, Cobro, TipoClase, Tarifa
)
from app.schemas.schemas import (
    DashboardAhora, StatsGenerales, ClaseEnCurso, AlumnoDashboard,
    DeudaAcumuladaOut,
)

router = APIRouter()


# ── SEMÁFORO ──────────────────────────────────────────────────────────────────
#
# Verde    → tiene cobro activo (no anulado) registrado este mes
# Rojo     → tiene un pack contratado (con tarifa asignada) este mes sin
#            cobrar todavía -- se paga por adelantado, así que cuenta aunque
#            el alumno aún no haya venido a ninguna clase -- O tiene actividad
#            registrada sin cobro (packs sin horas_contratadas, ej. sesiones sueltas)
# Amarillo → pack agotado: horas consumidas >= horas contratadas (o sesiones)
# Naranja  → mes de 5 semanas (horas extra, no penaliza)
#
# Prioridad: amarillo > naranja > rojo > verde
# (pack agotado es más urgente que falta de pago)

def calcular_semaforo(
    resumen: ResumenMensual | None,
    tiene_cobro_mes: bool,
    tiene_pack_contratado: bool = False,
) -> tuple[str, float | None]:
    """
    Devuelve (estado, importe_debido).
    importe_debido solo se rellena si el estado es 'rojo' y no hay cobro.

    tiene_pack_contratado: True si el alumno tiene al menos un pack activo
    con tarifa ya asignada este mes, exista o no un ResumenMensual todavía
    (es decir, aunque no haya recibido ninguna clase). Se paga por
    adelantado, así que un pack contratado sin cobrar es rojo desde el
    primer día del mes, no solo cuando ya hay consumo registrado.
    """
    if resumen is None:
        if tiene_pack_contratado and not tiene_cobro_mes:
            return "rojo", None
        return "verde", None

    horas_consumidas    = float(resumen.horas_consumidas or 0)
    sesiones_consumidas = resumen.sesiones_consumidas or 0
    horas_contratadas   = float(resumen.horas_contratadas) if resumen.horas_contratadas else None
    sesiones_contratadas = resumen.sesiones_contratadas

    # Amarillo: pack agotado
    if horas_contratadas is not None and horas_consumidas >= horas_contratadas:
        return "amarillo", None
    if sesiones_contratadas is not None and sesiones_consumidas >= sesiones_contratadas:
        return "amarillo", None

    # Naranja: mes de 5 semanas con horas extra
    if resumen.semanas_en_mes == 5:
        extra = 0.0
        if horas_contratadas:
            horas_base = horas_contratadas * 4 / 5  # lo que sería en 4 semanas
            extra = max(0.0, horas_consumidas - horas_base)
        if extra > 0 and tiene_cobro_mes:
            return "naranja", None

    # Rojo: se paga por adelantado. Si el alumno tiene un pack contratado
    # (horas_contratadas o sesiones_contratadas ya calculadas para este mes)
    # y no hay cobro, es rojo aunque todavía no haya recibido ninguna clase.
    # Se mantiene también el caso de "tiene actividad sin cobro" para packs
    # sin horas_contratadas definidas (ej. algún caso de sesión suelta donde
    # ese campo pudiera venir vacío por datos antiguos).
    tiene_pack      = tiene_pack_contratado or horas_contratadas is not None or sesiones_contratadas is not None
    tiene_actividad = horas_consumidas > 0 or sesiones_consumidas > 0
    if (tiene_pack or tiene_actividad) and not tiene_cobro_mes:
        return "rojo", None

    return "verde", None


async def _cobros_del_mes(db: AsyncSession, anio: int, mes: int) -> set[int]:
    """Devuelve el set de alumno_ids que tienen cobro válido en el mes."""
    result = await db.execute(
        select(Cobro.alumno_id).where(
            and_(
                func.extract("year",  Cobro.fecha) == anio,
                func.extract("month", Cobro.fecha) == mes,
                Cobro.anulado == False,
            )
        ).distinct()
    )
    return {row[0] for row in result.all()}


# ── STATS ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsGenerales)
async def stats_generales(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    hoy = date.today()
    mes_actual  = hoy.month
    anio_actual = hoy.year

    # Total alumnos activos
    r = await db.execute(select(func.count()).where(Alumno.activo == True))
    alumnos_activos = r.scalar() or 0

    # Asistencias hoy
    r3 = await db.execute(select(func.count()).where(Asistencia.fecha == hoy))
    asistencias_hoy = r3.scalar() or 0

    # Recaudado este mes
    r4 = await db.execute(
        select(func.coalesce(func.sum(Cobro.total), 0)).where(
            and_(
                func.extract("month", Cobro.fecha) == mes_actual,
                func.extract("year",  Cobro.fecha) == anio_actual,
                Cobro.anulado == False,
            )
        )
    )
    recaudado_mes = float(r4.scalar() or 0)

    # Pagos pendientes: mismo criterio que /alertas-semaforo — partimos
    # de packs activos con tarifa (no de ResumenMensual), para contar
    # también los packs contratados sin actividad todavía.
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

    # Agrupar por alumno
    por_alumno: dict[int, list] = {}
    for pack, resumen, alumno, tarifa in rows:
        por_alumno.setdefault(alumno.id, []).append((pack, resumen, tarifa))

    pagos_pendientes  = 0
    importe_pendiente = 0.0

    for alumno_id, packs_info in por_alumno.items():
        tiene_cobro = alumno_id in cobros_mes
        if tiene_cobro:
            continue

        # Resumen principal: el que tenga más consumo, o el primero
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

    result = await db.execute(
        select(Asistencia, Alumno, Usuario, TipoClase)
        .join(Alumno,    Asistencia.alumno_id    == Alumno.id)
        .join(Usuario,   Asistencia.profesor_id  == Usuario.id)
        .join(TipoClase, Asistencia.tipo_clase_id == TipoClase.id)
        .where(Asistencia.fecha == hoy)
        .order_by(Asistencia.hora_inicio)
    )
    rows = result.all()

    # Cargar en bloque los packs activos de los alumnos que aparecen hoy
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
                PackAlumno.tarifa_id.is_not(None),
            )
        )
        for pack, resumen, tarifa in packs_result.all():
            packs_por_alumno.setdefault(pack.alumno_id, []).append(
                (pack, resumen, tarifa)
            )

    clases: dict[str, ClaseEnCurso] = {}
    for asistencia, alumno, profesor, tipo_clase in rows:
        key = f"{profesor.id}-{tipo_clase.id}"
        if key not in clases:
            clases[key] = ClaseEnCurso(
                profesor_id     = profesor.id,
                profesor_nombre = f"{profesor.nombre} {profesor.apellidos}",
                tipo_clase      = tipo_clase.nombre,
                hora_inicio     = str(asistencia.hora_inicio) if asistencia.hora_inicio else None,
                alumnos         = [],
            )

        packs_info = packs_por_alumno.get(alumno.id, [])

        con_resumen = [(p, r, t) for (p, r, t) in packs_info if r is not None]
        if con_resumen:
            _, resumen, _ = max(
                con_resumen, key=lambda x: float(x[1].horas_consumidas or 0)
            )
        elif packs_info:
            _, resumen, _ = packs_info[0]
        else:
            resumen = None

        horas_mes        = float(resumen.horas_consumidas or 0) if resumen else 0.0
        sesiones_mes     = (resumen.sesiones_consumidas or 0) if resumen else 0
        horas_contratadas = (
            float(resumen.horas_contratadas)
            if resumen and resumen.horas_contratadas
            else None
        )

        tiene_cobro = alumno.id in cobros_mes
        tiene_pack = len(packs_info) > 0
        estado, importe_debido = calcular_semaforo(
            resumen, tiene_cobro, tiene_pack_contratado=tiene_pack
        )

        clases[key].alumnos.append(AlumnoDashboard(
            id                   = alumno.id,
            nombre               = alumno.nombre,
            apellidos            = alumno.apellidos,
            estado               = estado,
            horas_mes            = horas_mes,
            sesiones_mes         = sesiones_mes,
            horas_contratadas    = horas_contratadas,
            sesiones_contratadas = resumen.sesiones_contratadas if resumen else None,
            importe_debido       = importe_debido,
        ))

    clases_list = list(clases.values())
    total = sum(len(c.alumnos) for c in clases_list)

    return DashboardAhora(
        clases_en_curso    = clases_list,
        total_alumnos_ahora = total,
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

    # Partimos de packs activos (no de ResumenMensual) para incluir también
    # los contratados sin actividad todavía este mes.
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

        # Si es rojo y aún no hay importe, estimarlo con precio_base de
        # la tarifa del pack principal (mismo criterio que /alertas-semaforo).
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

        alumnos_dashboard.append(AlumnoDashboard(
            id                   = alumno.id,
            nombre               = alumno.nombre,
            apellidos            = alumno.apellidos,
            estado               = estado,
            horas_mes            = horas_mes,
            sesiones_mes         = sesiones_mes,
            horas_contratadas    = horas_contratadas,
            sesiones_contratadas = sesiones_contratadas,
            importe_debido       = importe_debido,
        ))

    orden = {"rojo": 0, "amarillo": 1, "naranja": 2, "verde": 3}
    alumnos_dashboard.sort(key=lambda a: orden.get(a.estado, 9))

    return alumnos_dashboard


# ── ALERTAS SEMÁFORO ──────────────────────────────────────────────────────────

@router.get("/alertas-semaforo", response_model=list[AlumnoDashboard])
async def obtener_alertas_semaforo(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Devuelve la lista filtrada de alumnos activos cuyo semáforo requiere atención.
    Excluye por completo el estado 'verde' y los ordena por orden de criticidad.

    Parte de los PACKS activos con tarifa asignada (no de ResumenMensual),
    porque un pack recién asignado -- sin ninguna asistencia todavía este
    mes -- no tiene fila en resumen_mensual, y aun así puede deber el pago
    por adelantado (rojo). Si existe un ResumenMensual para ese pack este
    mes, se usa para el consumo real (horas/sesiones/amarillo/naranja).
    """
    hoy = date.today()
    cobros_mes = await _cobros_del_mes(db, hoy.year, hoy.month)

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

    # Agrupamos por alumno (puede tener varios packs activos)
    por_alumno: dict[int, tuple[Alumno, list]] = {}
    for pack, resumen, alumno, tarifa in rows:
        if alumno.id not in por_alumno:
            por_alumno[alumno.id] = (alumno, [])
        por_alumno[alumno.id][1].append((pack, resumen, tarifa))

    alertas_dashboard = []
    for alumno_id, (alumno, packs_info) in por_alumno.items():
        tiene_cobro = alumno_id in cobros_mes

        # Pack "principal" para el semáforo: el que tenga ResumenMensual
        # con más consumo; si ninguno tiene resumen todavía, el primero.
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

            # Si es rojo y aún no hay importe (pack sin resumen, o resumen
            # sin horas_contratadas), lo estimamos con precio_base de la
            # tarifa del pack principal.
            if estado == "rojo" and not importe_debido and tarifa_principal:
                importe_debido = float(tarifa_principal.precio_base)

            alertas_dashboard.append(AlumnoDashboard(
                id                   = alumno.id,
                nombre               = alumno.nombre,
                apellidos            = alumno.apellidos,
                estado               = estado,
                horas_mes            = horas_mes,
                sesiones_mes         = sesiones_mes,
                horas_contratadas    = horas_contratadas,
                sesiones_contratadas = sesiones_contratadas,
                importe_debido       = importe_debido,
            ))

    orden_criticidad = {"amarillo": 0, "naranja": 1, "rojo": 2}
    alertas_dashboard.sort(key=lambda a: orden_criticidad.get(a.estado, 9))

    return alertas_dashboard


# ── DEUDAS ACUMULADAS ─────────────────────────────────────────────────────────
#
# Panel histórico de deudas — independiente del mes actual.
# Mientras alertas-semaforo solo mira el mes en curso (y se "limpia" en cuanto
# cambia el mes), este endpoint recorre TODOS los packs pendientes (sin
# tarifa asignada) de CUALQUIER alumno, sin importar de qué mes son sus
# asistencias. Así un alumno que debe desde hace 2 meses sigue apareciendo
# aquí hasta que el admin le asigne una tarifa real (PATCH /packs/{id}/asignar-tarifa).

@router.get("/deudas-acumuladas", response_model=list[DeudaAcumuladaOut])
async def deudas_acumuladas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Lista TODOS los packs pendientes (sin tarifa asignada) de alumnos
    activos, con el total de horas/sesiones consumidas y el rango de
    fechas de actividad. No depende del mes actual — un alumno que debe
    desde hace varios meses sigue apareciendo aquí hasta que se le
    asigne una tarifa real.
    """
    # 1. Todos los packs pendientes de alumnos activos
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
        # 2. Sumar todas las asistencias reales de ese pack (cualquier mes)
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
            # Pack pendiente creado pero sin ninguna asistencia real todavía
            # (caso raro, pero lo saltamos en vez de mostrar una fila vacía)
            continue

        es_sesion = pack.categoria_pendiente == "sesion"
        total_horas = 0.0 if es_sesion else float(total_min) / 60.0
        total_sesiones = int(num_asistencias) if es_sesion else 0

        # 3. Cuántos meses distintos tienen asistencia (para detectar
        #    deudas que se arrastran de más de un mes)
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

    # Orden: deudas más antiguas primero (más urgentes)
    deudas.sort(key=lambda d: d.primera_asistencia or date.max)
    return deudas