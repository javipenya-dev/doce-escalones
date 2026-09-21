from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import Usuario, RolEnum
from app.schemas.schemas import UsuarioCreate, UsuarioUpdate, UsuarioOut
from app.core.security import hash_pin

router = APIRouter()


@router.get("", response_model=list[UsuarioOut])
async def listar_profesores(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    result = await db.execute(
        select(Usuario).where(Usuario.rol == RolEnum.profesor)
    )
    return result.scalars().all()


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
async def crear_profesor(
    data: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    profesor = Usuario(
        nombre=data.nombre,
        apellidos=data.apellidos,
        email=data.email,
        pin=hash_pin(data.pin),
        rol=RolEnum.profesor,
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
    if "pin" in update_data:
        update_data["pin"] = hash_pin(update_data["pin"])
    for campo, valor in update_data.items():
        setattr(profesor, campo, valor)

    await db.flush()
    await db.refresh(profesor)
    return profesor
