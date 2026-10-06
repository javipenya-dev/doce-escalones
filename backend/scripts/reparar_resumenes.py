"""
Repara los resumen_mensual que falten tras el reset.

Recorre todas las asistencias existentes y, para cada combinación
(pack_alumno_id, año, mes), recrea el ResumenMensual contando desde cero.

Uso:
    python scripts/reparar_resumenes.py --dry-run
    python scripts/reparar_resumenes.py
"""
import argparse
import asyncio
import os
import sys
from datetime import date
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from app.db.database import AsyncSessionLocal
from app.models.models import Asistencia, PackAlumno, ResumenMensual, Tarifa, CategoriaEnum


async def reparar(dry_run: bool = False):
    async with AsyncSessionLocal() as db:
        # 1. Todas las asistencias
        asis_result = await db.execute(select(Asistencia))
        asistencias = asis_result.scalars().all()

        if not asistencias:
            print("✅ No hay asistencias. Nada que reparar.")
            return

        # Agrupar por (pack_alumno_id, año, mes)
        grupos: dict[tuple, list] = defaultdict(list)
        for a in asistencias:
            grupos[(a.pack_alumno_id, a.fecha.year, a.fecha.month)].append(a)

        print(f"📊 {len(asistencias)} asistencias en {len(grupos)} grupos (pack+mes)")

        creados = 0
        actualizados = 0

        for (pack_id, anio, mes), lista in grupos.items():
            pack_result = await db.execute(
                select(PackAlumno).where(PackAlumno.id == pack_id)
            )
            pack = pack_result.scalar_one_or_none()
            if not pack:
                print(f"⚠️ Pack {pack_id} no existe, salto")
                continue

            # Contar horas/sesiones
            horas = sum((a.duracion_min or 0) / 60.0 for a in lista if not a.es_sesion)
            sesiones = sum(1 for a in lista if a.es_sesion)

            # Buscar el resumen existente
            r_result = await db.execute(
                select(ResumenMensual).where(
                    ResumenMensual.pack_alumno_id == pack_id,
                    ResumenMensual.anio == anio,
                    ResumenMensual.mes == mes,
                )
            )
            resumen = r_result.scalar_one_or_none()

            if resumen:
                resumen.horas_consumidas = horas
                resumen.sesiones_consumidas = sesiones
                actualizados += 1
                print(f"🔄 Actualizado pack {pack_id} {anio}-{mes}: {horas:.1f}h / {sesiones} ses")
            else:
                # Calcular horas contratadas si tiene tarifa
                horas_contratadas = None
                sesiones_contratadas = None
                if pack.tarifa_id:
                    t_result = await db.execute(
                        select(Tarifa).where(Tarifa.id == pack.tarifa_id)
                    )
                    tarifa = t_result.scalar_one_or_none()
                    if tarifa:
                        semanas = 4  # aprox
                        if tarifa.categoria in (CategoriaEnum.normal, CategoriaEnum.ingles):
                            horas_contratadas = float(tarifa.horas_semanales or 0) * semanas
                        else:
                            sesiones_contratadas = tarifa.num_sesiones

                nuevo = ResumenMensual(
                    alumno_id=pack.alumno_id,
                    pack_alumno_id=pack_id,
                    anio=anio,
                    mes=mes,
                    horas_consumidas=horas,
                    sesiones_consumidas=sesiones,
                    semanas_en_mes=4,
                    horas_contratadas=horas_contratadas,
                    sesiones_contratadas=sesiones_contratadas,
                )
                db.add(nuevo)
                creados += 1
                print(f"✨ Creado pack {pack_id} {anio}-{mes}: {horas:.1f}h / {sesiones} ses")

        if dry_run:
            print(f"\n🔎 DRY-RUN — Creados: {creados}, Actualizados: {actualizados}")
            await db.rollback()
        else:
            await db.commit()
            print(f"\n✅ Creados: {creados}, Actualizados: {actualizados}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(reparar(dry_run=args.dry_run))