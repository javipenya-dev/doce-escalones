"""
Unifica las variantes de nombres en citas huérfanas.

Por ejemplo:
  "Manuel Pérez Guerrero" / "Manuel ¨Pérez Guerrero" / "manuel pérez guerrero"
  → todas pasan a "Manuel Pérez Guerrero" (una versión canónica)

Uso:
    python scripts/unificar_citas.py --dry-run     # previsualizar
    python scripts/unificar_citas.py               # aplicar cambios
"""
import argparse
import asyncio
import os
import re
import sys
import unicodedata
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.models.models import Cita


def _normalizar(s: str) -> str:
    """minúsculas, sin tildes, sin caracteres raros, espacios simples."""
    if not s:
        return ""
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9 ]', '', s.lower())
    return ' '.join(s.split())


def _elegir_canonico(variantes: list[str]) -> str:
    """
    Elige la mejor variante como nombre canónico.
    Criterios (en orden):
      1. La más larga (más completa)
      2. Con más tildes/mayúsculas "correctas" (menos rara)
      3. La primera alfabéticamente (estable)
    """
    # Filtrar variantes sin caracteres raros
    limpias = [v for v in variantes if not re.search(r'[¨^`´]', v)]
    if not limpias:
        limpias = variantes

    # Ordenar por: longitud desc, luego sin `??`, luego alfabético
    limpias.sort(key=lambda v: (
        -len(v.strip()),
        '??' in v,
        v.lower()
    ))
    return limpias[0].strip().title()


async def unificar(dry_run: bool = False):
    async with AsyncSessionLocal() as db:
        # 1. Cargar todas las citas huérfanas
        result = await db.execute(
            select(Cita).where(Cita.alumno_id.is_(None), Cita.alumno_texto.is_not(None))
        )
        citas = result.scalars().all()

        # 2. Agrupar por nombre normalizado
        grupos: dict[str, list[Cita]] = defaultdict(list)
        for c in citas:
            grupos[_normalizar(c.alumno_texto)].append(c)

        # 3. Detectar grupos con variantes
        con_variantes = {
            norm: cs
            for norm, cs in grupos.items()
            if len(set(c.alumno_texto for c in cs)) > 1
        }

        print(f"📊 Total citas huérfanas: {len(citas)}")
        print(f"👥 Nombres únicos normalizados: {len(grupos)}")
        print(f"🔀 Grupos con variantes: {len(con_variantes)}")
        print()

        if not con_variantes:
            print("✅ No hay variantes que unificar")
            return

        total_actualizadas = 0

        for norm, cs in con_variantes.items():
            variantes = sorted(set(c.alumno_texto for c in cs))
            canonico = _elegir_canonico(variantes)

            print(f"🔹 {canonico}")
            for v in variantes:
                n = sum(1 for c in cs if c.alumno_texto == v)
                marca = "  (canónico)" if v == canonico else ""
                print(f"    · {v!r} × {n}{marca}")

            if not dry_run:
                for c in cs:
                    if c.alumno_texto != canonico:
                        c.alumno_texto = canonico
                        total_actualizadas += 1
                print(f"    → {sum(1 for c in cs if c.alumno_texto != canonico)} actualizadas")
            print()

        if not dry_run:
            await db.commit()
            print("=" * 55)
            print(f"✅ Total citas actualizadas: {total_actualizadas}")
            print("=" * 55)
        else:
            print("=" * 55)
            print("🔎 MODO DRY-RUN (no se ha guardado nada)")
            print(f"   Se actualizarían {sum(len(cs) - 1 for cs in con_variantes.values())} citas")
            print("=" * 55)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Previsualizar sin guardar")
    args = parser.parse_args()

    asyncio.run(unificar(dry_run=args.dry_run))