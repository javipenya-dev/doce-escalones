"""
Servicio para reparar los ResumenMensual que falten tras un borrado masivo.

Recorre todas las Asistencias existentes y, para cada combinación
(pack_alumno_id, año, mes), recrea/actualiza el ResumenMensual contando
desde cero.

Llamado desde:
  - `backend/scripts/reparar_resumenes.py` (CLI)
  - `POST /config/admin/reparar-resumenes` (endpoint admin)
"""
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    Asistencia, PackAlumno, ResumenMensual, Tarifa, CategoriaEnum,
)


async def reparar_resumenes(db: AsyncSession) -> dict:
    """
    Devuelve un dict resumen:
      {
        'creados': int,
        'actualizados': int,
        'total_asistencias': int,
        'grupos': int,
      }
    """
    asis_result = await db.execute(select(Asistencia))
    asistencias = asis_result.scalars().all()

    if not asistencias:
        return {
            'creados': 0,
            'actualizados': 0,
            'total_asistencias': 0,
            'grupos': 0,
        }

    # Agrupar por (pack_alumno_id, año, mes)
    grupos: dict[tuple, list] = defaultdict(list)
    for a in asistencias:
        grupos[(a.pack_alumno_id, a.fecha.year, a.fecha.month)].append(a)

    creados = 0
    actualizados = 0

    for (pack_id, anio, mes), lista in grupos.items():
        pack_result = await db.execute(
            select(PackAlumno).where(PackAlumno.id == pack_id)
        )
        pack = pack_result.scalar_one_or_none()
        if not pack:
            continue

        # Contar horas / sesiones
        horas = sum((a.duracion_min or 0) / 60.0 for a in lista if not a.es_sesion)
        sesiones = sum(1 for a in lista if a.es_sesion)

        # Buscar resumen existente
        r_result = await db.execute(
            select(ResumenMensual).where(
                ResumenMensual.pack_alumno_id == pack_id,
                ResumenMensual.anio == anio,
                ResumenMensual.mes == mes,
            )
        )
        resumen = r_result.scalar_one_or_none()

        if resumen:
            resumen.horas_consumidas = horas
            resumen.sesiones_consumidas = sesiones
            actualizados += 1
        else:
            horas_contratadas = None
            sesiones_contratadas = None
            if pack.tarifa_id:
                t_result = await db.execute(
                    select(Tarifa).where(Tarifa.id == pack.tarifa_id)
                )
                tarifa = t_result.scalar_one_or_none()
                if tarifa:
                    if tarifa.categoria in (CategoriaEnum.normal, CategoriaEnum.ingles):
                        horas_contratadas = float(tarifa.horas_semanales or 0) * 4
                    else:
                        sesiones_contratadas = tarifa.num_sesiones

            nuevo = ResumenMensual(
                alumno_id=pack.alumno_id,
                pack_alumno_id=pack_id,
                anio=anio,
                mes=mes,
                horas_consumidas=horas,
                sesiones_consumidas=sesiones,
                semanas_en_mes=4,
                horas_contratadas=horas_contratadas,
                sesiones_contratadas=sesiones_contratadas,
            )
            db.add(nuevo)
            creados += 1

    await db.commit()

    return {
        'creados': creados,
        'actualizados': actualizados,
        'total_asistencias': len(asistencias),
        'grupos': len(grupos),
    }