"""
Script para crear el primer usuario administrador.
Ejecutar UNA SOLA VEZ después del primer arranque:

    docker exec -it academia_backend python scripts/crear_admin.py

"""
import asyncio
import sys
import os

# Añadir el directorio raíz al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings
from app.models.models import Base, Usuario, RolEnum


async def crear_admin():
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Verificar si ya existe un admin
        from sqlalchemy import select
        result = await db.execute(
            select(Usuario).where(Usuario.rol == RolEnum.admin)
        )
        if result.scalar_one_or_none():
            print("⚠️  Ya existe un usuario administrador.")
            return

        nombre = input("Nombre del administrador: ").strip() or "Admin"
        apellidos = input("Apellidos: ").strip() or "Academia"
        email = input("Email (opcional): ").strip() or None
        pin = input("PIN (4-6 dígitos): ").strip()

        if not pin.isdigit() or len(pin) not in (4, 5, 6):
            print("❌ PIN inválido. Debe tener entre 4 y 6 dígitos.")
            return

        admin = Usuario(
            nombre=nombre,
            apellidos=apellidos,
            email=email,
            pin=pin,  # <- Modificado aquí para guardar en texto plano temporalmente
            rol=RolEnum.admin,
            activo=True,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

        print(f"\n✅ Administrador creado correctamente:")
        print(f"   Nombre: {admin.nombre} {admin.apellidos}")
        print(f"   ID: {admin.id}")
        print(f"   Rol: {admin.rol}")
        print(f"\nPuedes iniciar sesión en el panel con tu PIN.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(crear_admin())
