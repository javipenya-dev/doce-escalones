from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import Optional

from app.models.models import Alumno, Hermanos, PackAlumno, ResumenMensual
from app.schemas.schemas import AlumnoCreate, AlumnoUpdate


async def crear_alumno(db: AsyncSession, data: AlumnoCreate) -> Alumno:
    """Crea un nuevo alumno en la base de datos."""
    alumno = Alumno(**data.model_dump())
    db.add(alumno)
    await db.flush()   # Obtenemos el ID sin hacer commit todavía
    await db.refresh(alumno)
    return alumno


async def obtener_alumno(db: AsyncSession, alumno_id: int) -> Optional[Alumno]:
    """Obtiene un alumno por ID."""
    result = await db.execute(
        select(Alumno)
        .where(Alumno.id == alumno_id)
        .options(selectinload(Alumno.packs))
    )
    return result.scalar_one_or_none()


async def listar_alumnos(
    db: AsyncSession,
    activo: Optional[bool] = True,
    nombre: Optional[str] = None,
) -> list[Alumno]:
    """Lista alumnos con filtros opcionales."""
    query = select(Alumno)

    if activo is not None:
        query = query.where(Alumno.activo == activo)

    if nombre:
        termino = f"%{nombre}%"
        query = query.where(
            or_(
                Alumno.nombre.ilike(termino),
                Alumno.apellidos.ilike(termino),
            )
        )

    query = query.order_by(Alumno.apellidos, Alumno.nombre)
    result = await db.execute(query)
    return result.scalars().all()


async def actualizar_alumno(
    db: AsyncSession, alumno: Alumno, data: AlumnoUpdate
) -> Alumno:
    """Actualiza los campos de un alumno."""
    update_data = data.model_dump(exclude_unset=True)
    for campo, valor in update_data.items():
        setattr(alumno, campo, valor)
    await db.flush()
    await db.refresh(alumno)
    return alumno


async def obtener_hermanos(db: AsyncSession, alumno_id: int) -> list[Alumno]:
    """Devuelve la lista de alumnos hermanos del alumno dado."""
    result = await db.execute(
        select(Alumno).where(
            or_(
                Alumno.id.in_(
                    select(Hermanos.alumno_id_2).where(Hermanos.alumno_id_1 == alumno_id)
                ),
                Alumno.id.in_(
                    select(Hermanos.alumno_id_1).where(Hermanos.alumno_id_2 == alumno_id)
                ),
            )
        )
    )
    return result.scalars().all()


async def vincular_hermanos(
    db: AsyncSession, alumno_id_1: int, alumno_id_2: int
) -> None:
    """Vincula dos alumnos como hermanos. Ordena los IDs para respetar el CHECK."""
    if alumno_id_1 == alumno_id_2:
        raise ValueError("Un alumno no puede ser hermano de sí mismo")

    # Garantizar orden correcto para el CHECK de la BD
    id1, id2 = sorted([alumno_id_1, alumno_id_2])

    # Comprobar si ya existe el vínculo
    existing = await db.execute(
        select(Hermanos).where(
            Hermanos.alumno_id_1 == id1,
            Hermanos.alumno_id_2 == id2,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Ya están vinculados como hermanos")

    hermanos = Hermanos(alumno_id_1=id1, alumno_id_2=id2)
    db.add(hermanos)
    await db.flush()


async def desvincular_hermanos(
    db: AsyncSession, alumno_id_1: int, alumno_id_2: int
) -> None:
    """Elimina el vínculo de hermanos entre dos alumnos."""
    id1, id2 = sorted([alumno_id_1, alumno_id_2])
    result = await db.execute(
        select(Hermanos).where(
            Hermanos.alumno_id_1 == id1,
            Hermanos.alumno_id_2 == id2,
        )
    )
    hermanos = result.scalar_one_or_none()
    if hermanos:
        await db.delete(hermanos)
        await db.flush()


async def tiene_hermanos_activos_este_mes(
    db: AsyncSession, alumno_id: int, anio: int, mes: int
) -> bool:
    """
    Comprueba si el alumno tiene hermanos con packs activos este mes.
    Usado para aplicar el descuento del 10%.
    """
    hermanos = await obtener_hermanos(db, alumno_id)
    if not hermanos:
        return False

    hermano_ids = [h.id for h in hermanos]

    result = await db.execute(
        select(ResumenMensual).where(
            ResumenMensual.alumno_id.in_(hermano_ids),
            ResumenMensual.anio == anio,
            ResumenMensual.mes == mes,
        )
    )
    return result.scalar_one_or_none() is not None
