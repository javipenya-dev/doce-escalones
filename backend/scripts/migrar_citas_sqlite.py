"""
Migra las citas del SQLite de la app PyQt6 (agenda_datos.db) a PostgreSQL.

Uso:
    python scripts/migrar_citas_sqlite.py --dry-run    # previsualizar
    python scripts/migrar_citas_sqlite.py              # migrar de verdad

Features:
- Mapeo manual de profesores (SQLite → PostgreSQL)
- Auto-matching de alumnos por nombre normalizado
- Idempotente (no duplica)
"""
import argparse
import asyncio
import os
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.models.models import Cita, Alumno, Usuario


SQLITE_PATH = "/home/javi/aplicacion_agenda/agenda_datos.db"

# Mapeo manual: nombre SQLite viejo → nombre PostgreSQL nuevo
MAPEO_PROFESORES = {
    "elisabet ruiz": "elisabet ruiz yesa",
    "maria xxx":     "maria rodriguez reina",
}


def _normalizar(s: str) -> str:
    """minúsculas, sin tildes, sin caracteres raros, espacios simples."""
    if not s:
        return ""
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9 ]', '', s.lower())  # solo letras, números y espacios
    return ' '.join(s.split())


async def migrar(dry_run: bool = False):
    if not os.path.exists(SQLITE_PATH):
        print(f"❌ No existe el SQLite: {SQLITE_PATH}")
        return

    # 1. Leer del SQLite
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT id, nombre FROM profesores")
    profesores_old = {row["id"]: row["nombre"] for row in cur.fetchall()}

    cur.execute("""
        SELECT id, fecha, hora_inicio, hora_fin, alumno, observaciones, profesor_id
        FROM citas
    """)
    citas_old = cur.fetchall()
    conn.close()

    print(f"📖 SQLite: {len(citas_old)} citas, {len(profesores_old)} profesores")
    print(f"   Profesores antiguos: {list(profesores_old.values())}")
    print()

    # 2. Cargar de PostgreSQL
    async with AsyncSessionLocal() as db:
        usuarios = (await db.execute(select(Usuario))).scalars().all()
        alumnos = (await db.execute(select(Alumno))).scalars().all()

        usuarios_map = {}
        for u in usuarios:
            n = _normalizar(f"{u.nombre} {u.apellidos}")
            usuarios_map[n] = u.id

        alumnos_map = {}
        for a in alumnos:
            n = _normalizar(f"{a.nombre} {a.apellidos}")
            alumnos_map[n] = a.id

        admin_id = next((u.id for u in usuarios if u.rol.value == "admin"), 1)

        print(f"📖 PostgreSQL: {len(usuarios)} usuarios, {len(alumnos)} alumnos")
        print()

        # Set de citas existentes (idempotencia)
        existentes = (await db.execute(select(Cita))).scalars().all()
        existentes_set = {
            (c.fecha, c.hora_inicio, c.hora_fin, _normalizar(c.alumno_texto or ""))
            for c in existentes
        }

        # Contadores
        insertadas = 0
        saltadas = 0
        vinculadas = 0
        no_vinculadas = 0
        errores = 0
        profes_no_encontrados = set()
        alumnos_no_encontrados = set()

        for c in citas_old:
            try:
                try:
                    fecha = datetime.strptime(c["fecha"], "%d/%m/%Y").date()
                except ValueError:
                    errores += 1
                    continue

                try:
                    h_ini = datetime.strptime(c["hora_inicio"], "%H:%M").time()
                    h_fin = datetime.strptime(c["hora_fin"], "%H:%M").time()
                except ValueError:
                    errores += 1
                    continue

                # Profesor: primero intento mapeo manual, luego auto, luego admin
                prof_old_nombre = profesores_old.get(c["profesor_id"], "")
                prof_norm = _normalizar(prof_old_nombre)
                prof_norm_mapeado = MAPEO_PROFESORES.get(prof_norm, prof_norm)
                prof_id = usuarios_map.get(prof_norm_mapeado)
                if not prof_id:
                    profes_no_encontrados.add(prof_old_nombre)
                    prof_id = admin_id

                # Alumno
                alumno_nombre = c["alumno"] or ""
                alumno_norm = _normalizar(alumno_nombre)
                alumno_id = alumnos_map.get(alumno_norm)

                if alumno_id:
                    vinculadas += 1
                else:
                    no_vinculadas += 1
                    alumnos_no_encontrados.add(alumno_nombre)

                # Idempotencia
                key = (fecha, h_ini, h_fin, alumno_norm)
                if key in existentes_set:
                    saltadas += 1
                    continue

                if not dry_run:
                    db.add(Cita(
                        fecha         = fecha,
                        hora_inicio   = h_ini,
                        hora_fin      = h_fin,
                        alumno_id     = alumno_id,
                        alumno_texto  = None if alumno_id else alumno_nombre,
                        profesor_id   = prof_id,
                        observaciones = c["observaciones"],
                    ))
                insertadas += 1

            except Exception as e:
                print(f"❌ Cita {c['id']}: {type(e).__name__}: {e}")
                errores += 1

        if not dry_run:
            await db.commit()

        print()
        print("=" * 55)
        if dry_run:
            print("🔎 MODO DRY-RUN (no se ha guardado nada)")
            print("=" * 55)
        print(f"✅ Citas a insertar:         {insertadas}")
        print(f"   ├─ Vinculadas a alumno:   {vinculadas}")
        print(f"   └─ Como texto libre:      {no_vinculadas}")
        print(f"⏭️  Saltadas (ya existían):   {saltadas}")
        print(f"❌ Errores:                   {errores}")

        if profes_no_encontrados:
            print()
            print(f"⚠️  Profesores NO encontrados (usan admin id={admin_id}):")
            for p in sorted(profes_no_encontrados):
                print(f"   - {p}")

        if alumnos_no_encontrados:
            print()
            print(f"ℹ️  Alumnos sin match en PostgreSQL (van como texto libre):")
            for a in sorted(alumnos_no_encontrados):
                print(f"   - {a}")

        print("=" * 55)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Previsualizar sin guardar")
    args = parser.parse_args()

    asyncio.run(migrar(dry_run=args.dry_run))