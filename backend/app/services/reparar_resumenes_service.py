"""
Repara los resumen_mensual que falten tras el reset.

Uso:
    python scripts/reparar_resumenes.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import AsyncSessionLocal
from app.services.reparar_resumenes_service import reparar_resumenes


async def main():
    async with AsyncSessionLocal() as db:
        resumen = await reparar_resumenes(db)

    print(f"📊 {resumen['total_asistencias']} asistencias en {resumen['grupos']} grupos")
    print(f"✅ Creados: {resumen['creados']}, Actualizados: {resumen['actualizados']}")


if __name__ == "__main__":
    asyncio.run(main())