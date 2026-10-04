"""
Envía el resumen semanal por email (pagos pendientes, recaudación, etc.).
Ejecutar desde la carpeta backend/:
    python scripts/enviar_resumen.py

O automáticamente vía cron cada lunes a las 9:00.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import AsyncSessionLocal
from app.services.resumen_semanal_service import enviar_resumen_semanal


async def main():
    async with AsyncSessionLocal() as db:
        ok, error = await enviar_resumen_semanal(db)

    if ok:
        print("✅ Resumen semanal enviado")
        sys.exit(0)
    else:
        print(f"❌ Error: {error}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())