"""
Crea o actualiza el usuario administrador inicial.
Ejecutar desde la carpeta backend/:
    python scripts/crear_admin.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.models.models import Usuario, RolEnum
from app.core.security import hash_pin


async def crear_admin():
    nombre    = input("Nombre: ").strip()
    apellidos = input("Apellidos: ").strip()
    email     = input("Email: ").strip()
    pin       = input("PIN (4-6 dígitos): ").strip()

    if not pin.isdigit() or not (4 <= len(pin) <= 6):
        print("❌ El PIN debe tener entre 4 y 6 dígitos numéricos.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Usuario).where(Usuario.email == email))
        existente = result.scalar_one_or_none()

        if existente:
            existente.pin       = hash_pin(pin)
            existente.nombre    = nombre
            existente.apellidos = apellidos
            existente.rol       = RolEnum.admin
            existente.activo    = True
            print(f"✅ Usuario actualizado: {email}")
        else:
            db.add(Usuario(
                nombre=nombre,
                apellidos=apellidos,
                email=email,
                pin=hash_pin(pin),
                rol=RolEnum.admin,
                activo=True,
            ))
            print(f"✅ Admin creado: {email}")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(crear_admin())