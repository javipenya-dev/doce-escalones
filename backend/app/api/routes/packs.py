"""
CRUD de packs contratados por alumno.
GET    /packs?alumno_id=          → lista packs de un alumno
POST   /packs                     → asignar tarifa a alumno
POST   /packs/combo               → matricular a un alumno en un combo (2+ tarifas a la vez)
PUT    /packs/{pack_id}           → cambiar profesor, notas, fecha_fin
DELETE /packs/{pack_id}           → baja lógica (activo = False)
PATCH  /packs/{pack_id}/asignar-tarifa → asignar tarifa real a un pack pendiente
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import date
from pydantic import BaseModel

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import PackAlumno, Alumno, Tarifa, Usuario
from app.schemas.schemas import PackAlumnoCreate, PackAlumnoOut

from app.services import asistencias_service
from app.models.models import ResumenMensual, Tarifa

router = APIRouter()


@router.get("", response_model=list[PackAlumnoOut])
async def listar_packs(
    alumno_id: int = Query(...),
    solo_activos: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Lista todos los packs de un alumno, con la tarifa embebida."""
    q = (
        select(PackAlumno)
        .options(selectinload(PackAlumno.tarifa))
        .where(PackAlumno.alumno_id == alumno_id)
        .order_by(PackAlumno.fecha_inicio.desc())
    )
    if solo_activos:
        q = q.where(PackAlumno.activo == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=PackAlumnoOut, status_code=status.HTTP_201_CREATED)
async def crear_pack(
    data: PackAlumnoCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Asigna una tarifa a un alumno creando un nuevo pack."""
    # Verificar que alumno, tarifa y profesor existen
    alumno = await db.get(Alumno, data.alumno_id)
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    tarifa = await db.get(Tarifa, data.tarifa_id)
    if not tarifa or not tarifa.activo:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada o inactiva")

    profesor = await db.get(Usuario, data.profesor_id)
    if not profesor or not profesor.activo:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    pack = PackAlumno(
        alumno_id    = data.alumno_id,
        tarifa_id    = data.tarifa_id,
        profesor_id  = data.profesor_id,
        fecha_inicio = data.fecha_inicio or date.today(),
        notas        = data.notas,
        activo       = True,
    )
    db.add(pack)
    await db.flush()

    result = await db.execute(
        select(PackAlumno)
        .options(selectinload(PackAlumno.tarifa))
        .where(PackAlumno.id == pack.id)
    )
    return result.scalar_one()


class PackComboCreate(BaseModel):
    alumno_id: int
    tarifa_ids: list[int]   # las 2 (o más) tarifas componentes del combo
    profesor_id: int
    fecha_inicio: Optional[date] = None
    notas: Optional[str] = None


@router.post("/combo", response_model=list[PackAlumnoOut], status_code=status.HTTP_201_CREATED)
async def crear_pack_combo(
    data: PackComboCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Matricula a un alumno en un combo, creando un pack activo por cada
    tarifa componente (ej. la parte 'Apoyo' y la parte 'Inglés' de un
    combo) en una sola operación. Todo o nada: si alguna tarifa no
    existe, no se crea ningún pack.
    """
    if len(data.tarifa_ids) < 2:
        raise HTTPException(
            status_code=400,
            detail="Un combo necesita al menos 2 tarifas componentes",
        )

    alumno = await db.get(Alumno, data.alumno_id)
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    profesor = await db.get(Usuario, data.profesor_id)
    if not profesor or not profesor.activo:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    fecha_inicio = data.fecha_inicio or date.today()
    packs_creados = []

    for tarifa_id in data.tarifa_ids:
        tarifa = await db.get(Tarifa, tarifa_id)
        if not tarifa or not tarifa.activo:
            raise HTTPException(
                status_code=404,
                detail=f"Tarifa {tarifa_id} no encontrada o inactiva",
            )
        pack = PackAlumno(
            alumno_id=data.alumno_id,
            tarifa_id=tarifa_id,
            profesor_id=data.profesor_id,
            fecha_inicio=fecha_inicio,
            notas=data.notas,
            activo=True,
        )
        db.add(pack)
        packs_creados.append(pack)

    await db.flush()

    ids = [p.id for p in packs_creados]
    result = await db.execute(
        select(PackAlumno)
        .options(selectinload(PackAlumno.tarifa))
        .where(PackAlumno.id.in_(ids))
    )
    return result.scalars().all()


@router.put("/{pack_id}", response_model=PackAlumnoOut)
async def actualizar_pack(
    pack_id: int,
    profesor_id: Optional[int] = None,
    notas: Optional[str] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Actualiza profesor, notas o fecha de fin de un pack."""
    result = await db.execute(
        select(PackAlumno)
        .options(selectinload(PackAlumno.tarifa))
        .where(PackAlumno.id == pack_id)
    )
    pack = result.scalar_one_or_none()
    if not pack:
        raise HTTPException(status_code=404, detail="Pack no encontrado")

    if profesor_id is not None:
        profesor = await db.get(Usuario, profesor_id)
        if not profesor:
            raise HTTPException(status_code=404, detail="Profesor no encontrado")
        pack.profesor_id = profesor_id

    if notas is not None:
        pack.notas = notas

    if fecha_fin is not None:
        pack.fecha_fin = fecha_fin

    await db.flush()
    await db.refresh(pack)
    return pack


@router.delete("/{pack_id}", status_code=status.HTTP_204_NO_CONTENT)
async def desactivar_pack(
    pack_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Baja lógica del pack (no se borra — queda historial de asistencias)."""
    pack = await db.get(PackAlumno, pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail="Pack no encontrado")
    pack.activo = False
    pack.fecha_fin = date.today()
    await db.flush()


@router.patch("/{pack_id}/asignar-tarifa", response_model=PackAlumnoOut)
async def asignar_tarifa_a_pack_pendiente(
    pack_id: int,
    tarifa_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Convierte un pack pendiente en un pack activo, asignándole la tarifa
    real que el alumno ha contratado/pagado.
    """
    result_pack = await db.execute(
        select(PackAlumno)
        .options(selectinload(PackAlumno.tarifa))
        .where(PackAlumno.id == pack_id)
    )
    pack = result_pack.scalar_one_or_none()
    if not pack:
        raise HTTPException(status_code=404, detail="Pack no encontrado")

    if pack.tarifa_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Este pack ya tiene una tarifa asignada — no es un pack pendiente",
        )

    tarifa = await db.get(Tarifa, tarifa_id)
    if not tarifa or not tarifa.activo:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada o inactiva")

    # Validación clave: la categoría de la tarifa debe coincidir con la
    # categoría con la que se creó el pack pendiente.
    if pack.categoria_pendiente is not None and tarifa.categoria.value != pack.categoria_pendiente:
        raise HTTPException(
            status_code=400,
            detail=(
                f"La tarifa elegida es de categoría '{tarifa.categoria.value}', "
                f"pero este pack tiene asistencias registradas como "
                f"'{pack.categoria_pendiente}'. Elige una tarifa de esa categoría."
            ),
        )

    pack.tarifa_id = tarifa.id
    pack.categoria_pendiente = None
    await db.flush()

    # Recalcular retroactivamente todos los meses en los que este pack
    # ya tenía asistencias (estaban con horas_contratadas=None al ser
    # pendiente; ahora que ya hay tarifa, deben quedar con el valor real).
    meses_result = await db.execute(
        select(ResumenMensual.anio, ResumenMensual.mes)
        .where(ResumenMensual.pack_alumno_id == pack_id)
        .distinct()
    )
    for anio, mes in meses_result.all():
        await asistencias_service.recalcular_resumen_mensual(
            db, alumno_id=pack.alumno_id, year=anio, month=mes,
        )

    await db.commit()
    await db.refresh(pack, ["tarifa"])
    return pack