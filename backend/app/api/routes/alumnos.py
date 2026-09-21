import io
import pandas as pd
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.models import Usuario, Alumno, PackAlumno, Tarifa
from app.schemas.schemas import PackActivoSimple, AlumnoListItem, AlumnoOut, AlumnoUpdate

router = APIRouter()


# ── LISTAR ALUMNOS (accesible para profesores) ──────────────────────────────

@router.get("", response_model=list[AlumnoListItem])
async def listar_alumnos(
    activo: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),  # profesor o admin
):
    """
    Listado simple de alumnos, accesible para profesores y admins.
    Lo usa la app móvil para que el profesor pueda buscar y
    seleccionar un alumno al registrar una asistencia.
    No expone datos administrativos (eso vive en GET /alumnos/{id} si
    se crea en el futuro, restringido a admin).
    """
    query = select(Alumno)
    if activo:
        query = query.where(Alumno.activo == True)
    query = query.order_by(Alumno.apellidos, Alumno.nombre)

    result = await db.execute(query)
    return result.scalars().all()


# ── IMPORTAR ALUMNOS DESDE EXCEL ────────────────────────────────────────────

@router.post("/importar")
async def importar_alumnos_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Procesa un listado masivo de ALUMNOS desde la primera pestaña de un Excel.
    Inserta en la tabla `alumnos` (modelo Alumno) — los alumnos NO son
    Usuario (esa tabla es solo para admins/profesores del sistema).
    Columnas esperadas:
      - nombre, apellidos       (obligatorias)
      - email, telefono         (opcionales)
      - telefono2               (opcional, segundo teléfono)
      - fecha_nacimiento        (opcional, formato DD/MM/AAAA o fecha de Excel)
    """
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xlsm")):
        raise HTTPException(
            status_code=400,
            detail="El archivo debe ser un Excel válido (.xlsx o .xlsm)",
        )

    try:
        contenido = await file.read()
        df = pd.read_excel(io.BytesIO(contenido))
        df.columns = [str(c).strip().lower() for c in df.columns]

        if "nombre" not in df.columns or "apellidos" not in df.columns:
            raise HTTPException(
                status_code=400,
                detail="El Excel debe contener obligatoriamente las columnas 'nombre' y 'apellidos'",
            )

        alumnos_creados = []

        for _, row in df.iterrows():
            nombre = str(row["nombre"]).strip()
            apellidos = str(row["apellidos"]).strip()

            # Saltamos filas completamente vacías
            if not nombre or nombre.lower() in ("nan", ""):
                continue

            email = (
                str(row["email"]).strip()
                if "email" in df.columns and pd.notna(row["email"])
                else None
            )

            # Limpieza de formato numérico flotante (.0) que introduce pandas en teléfonos
            def _limpiar_telefono(val):
                if val is None or pd.isna(val):
                    return None
                if isinstance(val, float):
                    return str(int(val)).strip()
                texto = str(val).strip()
                return texto[:-2] if texto.endswith(".0") else texto

            telefono = (
                _limpiar_telefono(row["telefono"])
                if "telefono" in df.columns
                else None
            )
            telefono2 = (
                _limpiar_telefono(row["telefono2"])
                if "telefono2" in df.columns
                else None
            )

            # Fecha de nacimiento — admite tanto fechas de Excel (datetime) como texto
            fecha_nacimiento = None
            if "fecha_nacimiento" in df.columns and pd.notna(row["fecha_nacimiento"]):
                val_fecha = row["fecha_nacimiento"]
                try:
                    if isinstance(val_fecha, (pd.Timestamp,)):
                        fecha_nacimiento = val_fecha.date()
                    elif hasattr(val_fecha, "date"):
                        fecha_nacimiento = val_fecha.date()
                    else:
                        # Texto tipo "15/03/2014" o "2014-03-15"
                        fecha_nacimiento = pd.to_datetime(
                            str(val_fecha).strip(), dayfirst=True, errors="coerce"
                        )
                        fecha_nacimiento = (
                            fecha_nacimiento.date() if pd.notna(fecha_nacimiento) else None
                        )
                except Exception:
                    fecha_nacimiento = None  # fila con fecha mal escrita, la ignoramos sin romper la importación

            # Comprobamos duplicados en la tabla CORRECTA: Alumno (no Usuario)
            existe_res = await db.execute(
                select(Alumno).where(
                    Alumno.nombre == nombre,
                    Alumno.apellidos == apellidos,
                )
            )
            if existe_res.scalar_one_or_none():
                continue  # ya existe, lo saltamos

            nuevo_alumno = Alumno(
                nombre=nombre,
                apellidos=apellidos,
                email=email,
                telefono1=telefono,
                telefono2=telefono2,
                fecha_nacimiento=fecha_nacimiento,
                activo=True,
            )
            db.add(nuevo_alumno)
            alumnos_creados.append({
                "nombre": nombre,
                "apellidos": apellidos,
                "email": email or "Sin email",
            })

        await db.commit()
        return {
            "status": "success",
            "mensaje": f"Se han importado {len(alumnos_creados)} alumnos nuevos correctamente a la base de datos.",
            "alumnos_detectados": alumnos_creados,
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar el listado de Excel: {str(e)}",
        )


# ── PACKS ACTIVOS DE UN ALUMNO (para profesores, vía app móvil) ─────────────

@router.get("/{alumno_id}/packs-activos", response_model=list[PackActivoSimple])
async def packs_activos_de_alumno(
    alumno_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),  # profesor o admin
):
    """
    Devuelve los packs activos de un alumno con lo mínimo necesario para
    que la app móvil del profesor pueda registrar una asistencia:
    - id              → pack_alumno_id a enviar en AsistenciaCreate
    - tipo_clase_id   → tipo_clase_id a enviar en AsistenciaCreate
    - categoria       → para mostrar el icono/label en el desplegable
    No expone tarifas, precios, ni datos administrativos (eso es solo
    accesible vía GET /packs, que requiere permisos de admin).
    """
    result = await db.execute(
        select(PackAlumno)
        .options(
            selectinload(PackAlumno.tarifa).selectinload(Tarifa.tipo_clase)
        )
        .where(
            PackAlumno.alumno_id == alumno_id,
            PackAlumno.activo == True,
        )
    )
    packs = result.scalars().all()

    salida = []
    for p in packs:
        if p.tarifa is None or p.tarifa.tipo_clase is None:
            continue  # pack mal configurado, lo saltamos en vez de romper
        salida.append(PackActivoSimple(
            id=p.id,
            categoria=p.tarifa.categoria.value,
            tipo_clase_id=p.tarifa.tipo_clase.id,
            tipo_clase_nombre=p.tarifa.tipo_clase.nombre,
        ))
    return salida


# ── ACTUALIZAR ALUMNO (solo admin) ──────────────────────────────────────────

@router.put("/{alumno_id}", response_model=AlumnoOut)
async def actualizar_alumno(
    alumno_id: int,
    data: AlumnoUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Actualiza los datos de un alumno existente (nombre, apellidos, teléfonos,
    email, dirección, fecha de nacimiento, o estado activo/inactivo).
    Solo admins pueden editar alumnos.
    """
    alumno = await db.get(Alumno, alumno_id)
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(alumno, campo, valor)

    await db.flush()
    await db.refresh(alumno)
    return alumno