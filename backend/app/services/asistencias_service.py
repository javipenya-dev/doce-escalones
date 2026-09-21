import calendar
from datetime import date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.models import Asistencia, ResumenMensual, PackAlumno, Tarifa, CategoriaEnum
from app.schemas.schemas import AsistenciaCreate, ResumenMensualOut


# ── GESTIÓN DE PACKS PENDIENTES ─────────────────────────────────────────────

async def get_or_create_pack_pendiente(
    db: AsyncSession,
    alumno_id: int,
    categoria: str,
    profesor_id: Optional[int] = None,
) -> PackAlumno:
    """
    Busca un pack ACTIVO con tarifa real para esa categoría.
    Si no existe, busca o crea uno "pendiente" (tarifa_id=None,
    categoria_pendiente=categoria) para poder seguir registrando
    asistencias sin bloquear al profesor mientras no se haya cobrado.

    Protegido contra condición de carrera: si dos peticiones casi
    simultáneas intentan crear el mismo pack pendiente, el índice
    único parcial de la base de datos (uq_pack_pendiente_alumno_categoria)
    rechazará la segunda inserción; en ese caso simplemente volvemos
    a buscar el que ya se creó.
    """
    # 1. Buscar un pack activo con tarifa real ya asignada
    stmt = (
        select(PackAlumno)
        .join(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(
            PackAlumno.alumno_id == alumno_id,
            PackAlumno.activo == True,
            Tarifa.categoria == categoria,
        )
    )
    result = await db.execute(stmt)
    pack = result.scalar_one_or_none()
    if pack:
        return pack

    # 2. Buscar si ya existe un pack pendiente de esta categoría
    stmt_pendiente = select(PackAlumno).where(
        PackAlumno.alumno_id == alumno_id,
        PackAlumno.categoria_pendiente == categoria,
        PackAlumno.tarifa_id.is_(None),
    )
    result_p = await db.execute(stmt_pendiente)
    pack_pendiente = result_p.scalar_one_or_none()
    if pack_pendiente:
        return pack_pendiente

    # 3. No existe ninguno — crear uno nuevo
    pack_pendiente = PackAlumno(
        alumno_id=alumno_id,
        tarifa_id=None,
        categoria_pendiente=categoria,
        profesor_id=profesor_id,
        activo=True,
    )
    try:
        # SAVEPOINT: si el INSERT falla por carrera, solo se revierte
        # este INSERT, no toda la transacción del request. Con rollback()
        # completo se perderían cambios previos no commiteados.
        async with db.begin_nested():
            db.add(pack_pendiente)
            await db.flush()
        await db.refresh(pack_pendiente)
        return pack_pendiente
    except IntegrityError:
        # Carrera: otra petición lo creó justo antes que nosotros.
        # El SAVEPOINT ya ha revertido solo el insert fallido, así que
        # la transacción principal sigue viva.
        result_retry = await db.execute(stmt_pendiente)
        pack_existente = result_retry.scalar_one_or_none()
        if pack_existente:
            return pack_existente
        # Si ni siquiera así lo encontramos, relanzamos el error original
        raise


# ── LÓGICA DE ASISTENCIAS ───────────────────────────────────────────────────

async def registrar_asistencia(
    db: AsyncSession,
    data: AsistenciaCreate,
    profesor_id: int,
) -> tuple[Asistencia, ResumenMensualOut]:
    """
    Registra una asistencia y actualiza el resumen mensual.
    Devuelve la asistencia creada y el resumen actualizado.
    """
    asistencia = Asistencia(
        alumno_id=data.alumno_id,
        pack_alumno_id=data.pack_alumno_id,
        profesor_id=profesor_id,
        tipo_clase_id=data.tipo_clase_id,
        fecha=data.fecha,
        hora_inicio=data.hora_inicio,
        duracion_min=data.duracion_min,
        es_sesion=data.es_sesion,
        sincronizado=True,
        uuid_local=data.uuid_local,
    )
    db.add(asistencia)
    await db.flush()

    resumen = await _actualizar_resumen_mensual(
        db,
        alumno_id=data.alumno_id,
        pack_alumno_id=data.pack_alumno_id,
        anio=data.fecha.year,
        mes=data.fecha.month,
        duracion_min=data.duracion_min,
        es_sesion=data.es_sesion,
        dia_semana=data.fecha.weekday(),
    )

    await db.refresh(asistencia)
    resumen_out = await _resumen_a_schema(db, resumen)
    return asistencia, resumen_out


async def sync_asistencias_offline(
    db: AsyncSession,
    asistencias: list[AsistenciaCreate],
    profesor_id: int,
) -> dict:
    """
    Procesa un batch de asistencias offline.
    Usa uuid_local como idempotency key para evitar duplicados.
    """
    procesadas = 0
    duplicadas = 0
    errores = []

    for data in asistencias:
        try:
            if data.uuid_local:
                existing = await db.execute(
                    select(Asistencia).where(Asistencia.uuid_local == data.uuid_local)
                )
                if existing.scalar_one_or_none():
                    duplicadas += 1
                    continue

            asistencia = Asistencia(
                alumno_id=data.alumno_id,
                pack_alumno_id=data.pack_alumno_id,
                profesor_id=profesor_id,
                tipo_clase_id=data.tipo_clase_id,
                fecha=data.fecha,
                hora_inicio=data.hora_inicio,
                duracion_min=data.duracion_min,
                es_sesion=data.es_sesion,
                sincronizado=False,
                uuid_local=data.uuid_local,
            )
            db.add(asistencia)
            await db.flush()

            await _actualizar_resumen_mensual(
                db,
                alumno_id=data.alumno_id,
                pack_alumno_id=data.pack_alumno_id,
                anio=data.fecha.year,
                mes=data.fecha.month,
                duracion_min=data.duracion_min,
                es_sesion=data.es_sesion,
                dia_semana=data.fecha.weekday(),
            )
            procesadas += 1

        except Exception as e:
            errores.append(f"Error en uuid {data.uuid_local}: {str(e)}")

    return {"procesadas": procesadas, "duplicadas": duplicadas, "errores": errores}


async def recalcular_resumen_mensual(
    db: AsyncSession,
    alumno_id: int,
    year: int,
    month: int,
) -> Optional[ResumenMensualOut]:
    """
    Recalcula desde cero el resumen mensual de un alumno para un mes
    concreto, recontando todas sus asistencias reales en ese periodo.
    Se usa tras eliminar o editar una asistencia, y también tras asignar
    una tarifa real a un pack pendiente (para que las horas_contratadas
    de meses ya transcurridos se actualicen retroactivamente).
    """
    stmt = select(ResumenMensual).where(
        ResumenMensual.alumno_id == alumno_id,
        ResumenMensual.anio == year,
        ResumenMensual.mes == month,
    )
    result = await db.execute(stmt)
    resumenes = result.scalars().all()
    if not resumenes:
        return None

    primer_dia = date(year, month, 1)
    primer_dia_siguiente = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    ultimo = None
    for resumen in resumenes:
        # 1) Recontar DE VERDAD las asistencias reales de este pack en el
        #    mes, en vez de fiarnos de un contador que se iba sumando/
        #    restando a mano. Esto es lo que faltaba: antes, borrar o
        #    editar una asistencia no movía horas_consumidas/
        #    sesiones_consumidas, así que el semáforo quedaba desincronizado
        #    de la realidad tras un DELETE o un PUT.
        asis_result = await db.execute(
            select(Asistencia).where(
                Asistencia.pack_alumno_id == resumen.pack_alumno_id,
                Asistencia.fecha >= primer_dia,
                Asistencia.fecha < primer_dia_siguiente,
            )
        )
        asistencias = asis_result.scalars().all()

        horas_consumidas = 0.0
        sesiones_consumidas = 0
        for a in asistencias:
            if a.es_sesion:
                sesiones_consumidas += 1
            else:
                horas_consumidas += (a.duracion_min or 0) / 60.0

        resumen.horas_consumidas = horas_consumidas
        resumen.sesiones_consumidas = sesiones_consumidas

        # 2) Recalcular horas/sesiones CONTRATADAS (lo que ya hacía antes
        #    esta función) — usa resumen.semanas_en_mes tal cual está
        #    guardado, sin recalcularlo (ver fix de calcular_semanas_mes
        #    más abajo: ese valor ya no cambia después de crearse).
        pack_result = await db.execute(
            select(PackAlumno).where(PackAlumno.id == resumen.pack_alumno_id)
        )
        pack = pack_result.scalar_one_or_none()

        horas_contratadas = None
        sesiones_contratadas = None
        if pack and pack.tarifa_id:
            tarifa_result = await db.execute(select(Tarifa).where(Tarifa.id == pack.tarifa_id))
            tarifa = tarifa_result.scalar_one_or_none()
            if tarifa:
                if tarifa.categoria in (CategoriaEnum.normal, CategoriaEnum.ingles):
                    horas_contratadas = float(tarifa.horas_semanales or 0) * resumen.semanas_en_mes
                else:
                    sesiones_contratadas = tarifa.num_sesiones

        resumen.horas_contratadas = horas_contratadas
        resumen.sesiones_contratadas = sesiones_contratadas
        await db.flush()
        ultimo = resumen

    await db.refresh(ultimo)
    return await _resumen_a_schema(db, ultimo)


# ── FUNCIONES AUXILIARES ────────────────────────────────────────────────────

async def _actualizar_resumen_mensual(
    db: AsyncSession,
    alumno_id: int,
    pack_alumno_id: int,
    anio: int,
    mes: int,
    duracion_min: int,
    es_sesion: bool,
    dia_semana: int,
) -> ResumenMensual:
    """
    Actualiza (o crea) el resumen mensual del alumno para este pack y mes.
    Se llama cada vez que se registra una asistencia.
    """
    result = await db.execute(
        select(ResumenMensual).where(
            ResumenMensual.pack_alumno_id == pack_alumno_id,
            ResumenMensual.anio == anio,
            ResumenMensual.mes == mes,
        )
    )
    resumen = result.scalar_one_or_none()

    if resumen is None:
        # semanas_en_mes se fija UNA SOLA VEZ, aquí, al crear el resumen
        # — usando el día de la semana de esta primera asistencia. Antes
        # se recalculaba en cada actualización con el día de la asistencia
        # de turno, así que el valor oscilaba según el orden en que se
        # registraran las clases del mes (ej. martes → 5 semanas, jueves
        # → 4 semanas), y como horas_contratadas = horas_semanales ×
        # semanas_en_mes, el importe a cobrar cambiaba según el orden en
        # que se pulsaran los botones. Ahora, una vez fijado, no se toca.
        semanas = calcular_semanas_mes(anio, mes, dia_semana)

        pack_result = await db.execute(
            select(PackAlumno).where(PackAlumno.id == pack_alumno_id)
        )
        pack = pack_result.scalar_one_or_none()

        horas_contratadas = None
        sesiones_contratadas = None
        if pack and pack.tarifa_id:
            tarifa_result = await db.execute(select(Tarifa).where(Tarifa.id == pack.tarifa_id))
            tarifa = tarifa_result.scalar_one_or_none()
            if tarifa:
                if tarifa.categoria in (CategoriaEnum.normal, CategoriaEnum.ingles):
                    horas_contratadas = float(tarifa.horas_semanales or 0) * semanas
                else:
                    sesiones_contratadas = tarifa.num_sesiones

        resumen = ResumenMensual(
            alumno_id=alumno_id,
            pack_alumno_id=pack_alumno_id,
            anio=anio,
            mes=mes,
            horas_consumidas=0.0,
            sesiones_consumidas=0,
            semanas_en_mes=semanas,
            horas_contratadas=horas_contratadas,
            sesiones_contratadas=sesiones_contratadas,
        )
        db.add(resumen)
        await db.flush()

    if es_sesion:
        resumen.sesiones_consumidas = (resumen.sesiones_consumidas or 0) + 1
    else:
        horas = duracion_min / 60.0
        resumen.horas_consumidas = float(resumen.horas_consumidas or 0) + horas

    # NOTA: ya NO se reasigna resumen.semanas_en_mes aquí (antes:
    # "resumen.semanas_en_mes = semanas"). Se fija solo al crear, arriba.
    await db.flush()
    await db.refresh(resumen)
    return resumen


async def _resumen_a_schema(db: AsyncSession, resumen: ResumenMensual) -> ResumenMensualOut:
    """Convierte el modelo ResumenMensual al schema de salida con estado calculado."""
    horas_consumidas = float(resumen.horas_consumidas or 0)
    horas_contratadas = float(resumen.horas_contratadas) if resumen.horas_contratadas else None
    sesiones_consumidas = resumen.sesiones_consumidas or 0
    sesiones_contratadas = resumen.sesiones_contratadas
    semanas = resumen.semanas_en_mes or 4
    es_sesion = sesiones_contratadas is not None

    # Comprobar si el pack asociado a este resumen sigue pendiente de tarifa real.
    pack_result = await db.execute(
        select(PackAlumno).where(PackAlumno.id == resumen.pack_alumno_id)
    )
    pack = pack_result.scalar_one_or_none()
    tiene_pago_pendiente = pack is not None and pack.tarifa_id is None

    estado, horas_extra = calcular_estado(
        horas_consumidas=horas_consumidas,
        horas_contratadas=horas_contratadas,
        sesiones_consumidas=sesiones_consumidas,
        sesiones_contratadas=sesiones_contratadas,
        semanas_en_mes=semanas,
        tiene_pago_pendiente=tiene_pago_pendiente,
        es_sesion=es_sesion,
    )

    return ResumenMensualOut(
        anio=resumen.anio,
        mes=resumen.mes,
        horas_consumidas=horas_consumidas,
        sesiones_consumidas=sesiones_consumidas,
        semanas_en_mes=semanas,
        horas_contratadas=horas_contratadas,
        sesiones_contratadas=sesiones_contratadas,
        estado=estado,
        horas_extra=horas_extra,
    )


def calcular_semanas_mes(anio: int, mes: int, dia_semana: int = None) -> int:
    """
    Calcula si un mes tiene 4 o 5 semanas.
    Si se pasa dia_semana (0=lunes..6=domingo), cuenta cuántas veces
    aparece ese día en el mes (más preciso).
    Sin dia_semana, usa el número de días del mes.
    """
    _, dias_mes = calendar.monthrange(anio, mes)

    if dia_semana is not None:
        return sum(
            1 for d in range(1, dias_mes + 1)
            if date(anio, mes, d).weekday() == dia_semana
        )

    return 5 if dias_mes >= 29 else 4


def calcular_estado(
    horas_consumidas: float,
    horas_contratadas: Optional[float],
    sesiones_consumidas: int,
    sesiones_contratadas: Optional[int],
    semanas_en_mes: int,
    tiene_pago_pendiente: bool,
    es_sesion: bool,
) -> tuple[str, int]:
    """
    Devuelve (estado, horas_extra).
    Estados: verde, rojo, amarillo, naranja
    """
    if tiene_pago_pendiente:
        return "rojo", 0

    if es_sesion:
        consumidas = sesiones_consumidas
        contratadas = sesiones_contratadas or 0
    else:
        consumidas = horas_consumidas
        contratadas = horas_contratadas or 0

    if contratadas == 0:
        return "verde", 0

    horas_extra = 0
    if semanas_en_mes == 5 and not es_sesion and horas_contratadas:
        horas_base = (horas_contratadas / semanas_en_mes) * 4
        horas_extra = round(consumidas - horas_base) if consumidas > horas_base else 0

    if consumidas >= contratadas:
        if horas_extra > 0:
            return "naranja", horas_extra
        return "amarillo", 0  # Pack agotado

    return "verde", 0
