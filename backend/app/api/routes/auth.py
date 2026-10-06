from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.models import Usuario
from app.core.security import verify_pin, create_access_token
from app.core.deps import get_current_user
from app.core.rate_limit import (
    check_login_rate_limit,
    registrar_intento_fallido,
)
from app.schemas.schemas import LoginRequest, TokenResponse, UsuarioOut

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Login por PIN (obligatorio) y email opcional.

    Rate limiting: máximo 10 intentos fallidos por IP en 10 minutos.
    Si se supera, se devuelve 429 Too Many Requests.
    """
    # 1. Comprobar rate limit ANTES de tocar la BD
    check_login_rate_limit(request)

    try:
        query = select(Usuario).where(Usuario.activo == True)

        if data.email:
            query = query.where(Usuario.email == data.email)

        result = await db.execute(query)
        usuarios = result.scalars().all()

        # Buscar el usuario cuyo PIN coincide
        usuario_encontrado = None
        for u in usuarios:
            if u.pin and verify_pin(data.pin, u.pin):
                usuario_encontrado = u
                break

        if not usuario_encontrado:
            registrar_intento_fallido(request)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="PIN o email incorrecto",
            )

        token = create_access_token(data={"sub": str(usuario_encontrado.id)})

        return TokenResponse(
            access_token=token,
            usuario=UsuarioOut.model_validate(usuario_encontrado),
        )

    except HTTPException:
        # Las HTTPException (401, 429, ...) ya están formadas → re-lanzar sin tocar
        raise
    except Exception as e:
        # Errores internos (bcrypt, BD, ...) → 500 genérico
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ERROR INTERNO: {type(e).__name__} - {str(e)}",
        )


@router.get("/me", response_model=UsuarioOut)
async def get_me(current_user: Usuario = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado."""
    return current_user