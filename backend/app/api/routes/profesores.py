from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import Optional

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import Usuario, RolEnum
from app.schemas.schemas import UsuarioCreate, UsuarioUpdate, UsuarioOut
from app.core.security import hash_pin

router = APIRouter()


@router.get("", response_model=list[UsuarioOut])
async def listar_profesores(
    nombre: Optional[str] = Query(None, description="Buscar por nombre o apellidos"),
    activo: Optional[bool] = Query(None, description="Filtrar por activo/baja"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Lista profesores. Filtros opcionales:
    - nombre: busca en nombre y apellidos (case-insensitive, contiene)
    - activo: true = solo activos, false = solo bajas, omitir = todos
    """
    stmt = select(Usuario).where(Usuario.rol == RolEnum.profesor)

    if nombre:
        like = f"%{nombre}%"
        stmt = stmt.where(or_(
            Usuario.nombre.ilike(like),
            Usuario.apellidos.ilike(like),
        ))

    if activo is not None:
        stmt = stmt.where(Usuario.activo == activo)

    stmt = stmt.order_by(Usuario.apellidos, Usuario.nombre)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
async def crear_profesor(
    data: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    profesor = Usuario(
        nombre    = data.nombre,
        apellidos = data.apellidos,
        email     = data.email or None,
        telefono  = data.telefono or None,
        color     = data.color or '#F26419',
        pin       = hash_pin(data.pin),
        rol       = RolEnum.profesor,
        activo    = True,
    )
    db.add(profesor)
    await db.flush()
    await db.refresh(profesor)
    return profesor


@router.put("/{profesor_id}", response_model=UsuarioOut)
async def actualizar_profesor(
    profesor_id: int,
    data: UsuarioUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    result = await db.execute(
        select(Usuario).where(Usuario.id == profesor_id, Usuario.rol == RolEnum.profesor)
    )
    profesor = result.scalar_one_or_none()
    if not profesor:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # Si viene PIN, hashearlo
    if update_data.get("pin"):
        update_data["pin"] = hash_pin(update_data["pin"])
    else:
        update_data.pop("pin", None)

    # Emails vacíos = null
    if "email" in update_data and not update_data["email"]:
        update_data["email"] = None
    if "telefono" in update_data and not update_data["telefono"]:
        update_data["telefono"] = None

    for campo, valor in update_data.items():
        setattr(profesor, campo, valor)

    await db.flush()
    await db.refresh(profesor)
    return profesor


@router.delete("/{profesor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dar_baja_profesor(
    profesor_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Soft-delete: marca el profesor como inactivo (activo=False).
    No borra el registro para preservar historial de asistencias/cobros.
    """
    result = await db.execute(
        select(Usuario).where(Usuario.id == profesor_id, Usuario.rol == RolEnum.profesor)
    )
    profesor = result.scalar_one_or_none()
    if not profesor:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    profesor.activo = False
    await db.flush()