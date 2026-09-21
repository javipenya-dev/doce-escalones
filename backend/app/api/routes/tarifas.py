from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.core.deps import get_current_user, get_current_admin
from app.models.models import Usuario, Tarifa, TipoClase
from app.schemas.schemas import TarifaOut, TarifaCreate, TarifaUpdate

from pydantic import BaseModel

router = APIRouter()


@router.get("", response_model=list[TarifaOut])
async def listar_tarifas(
    todas: bool = Query(False, description="Si true, incluye tarifas inactivas"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    query = select(Tarifa)
    if not todas:
        query = query.where(Tarifa.activo == True)
    query = query.order_by(Tarifa.categoria, Tarifa.nombre)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=TarifaOut, status_code=status.HTTP_201_CREATED)
async def crear_tarifa(
    data: TarifaCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    tarifa = Tarifa(**data.model_dump())
    db.add(tarifa)
    await db.flush()
    await db.refresh(tarifa)
    return tarifa


@router.put("/{tarifa_id}", response_model=TarifaOut)
async def actualizar_tarifa(
    tarifa_id: int,
    data: TarifaUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    result = await db.execute(select(Tarifa).where(Tarifa.id == tarifa_id))
    tarifa = result.scalar_one_or_none()
    if not tarifa:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")

    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(tarifa, campo, valor)

    await db.flush()
    await db.refresh(tarifa)
    return tarifa


@router.post("/{tarifa_id}/toggle", response_model=TarifaOut)
async def toggle_tarifa(
    tarifa_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Activa o desactiva una tarifa."""
    result = await db.execute(select(Tarifa).where(Tarifa.id == tarifa_id))
    tarifa = result.scalar_one_or_none()
    if not tarifa:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")
    tarifa.activo = not tarifa.activo
    await db.flush()
    await db.refresh(tarifa)
    return tarifa

# ── AÑADIR como router nuevo, o dentro de tarifas.py / alumnos.py ──────────
#
# Endpoint simple y siempre disponible: lista de tipos de clase
# (Apoyo, Inglés A1, Logopedia, Psicología...) para que el profesor
# pueda elegir directamente qué clase está dando, sin depender de si
# el alumno tiene algún pack (pendiente o pagado) todavía.
#
# Imports necesarios:
#   from app.models.models import TipoClase
#   from app.core.deps import get_current_user

class TipoClaseOut(BaseModel):
    id: int
    nombre: str
    categoria: str  # normal | ingles | sesion

    model_config = {"from_attributes": True}


@router.get("/tipos-clase", response_model=list[TipoClaseOut])
async def listar_tipos_clase(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),  # profesor o admin
):
    """
    Lista los tipos de clase activos (Apoyo, Inglés A1, Logopedia...).
    Accesible para profesores: necesitan elegir qué clase están dando
    sin depender de si el alumno ya tiene un pack asignado o no.
    """
    result = await db.execute(
        select(TipoClase)
        .where(TipoClase.activo == True)
        .order_by(TipoClase.categoria, TipoClase.nombre)
    )
    return result.scalars().all()