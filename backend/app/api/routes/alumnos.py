import io
import pandas as pd
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, extract
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.models import (
    Usuario, Alumno, PackAlumno, Tarifa, Hermanos,
    ResumenMensual, Cobro, CobroPack,
)
from app.schemas.schemas import (
    PackActivoSimple, AlumnoListItem, AlumnoOut, AlumnoUpdate,
    AlumnoCreate, AlumnoDetalleOut, PackAlumnoFichaOut,
    HistoricoMesOut, CobroResumenOut,
)

router = APIRouter()

MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']


# ── LISTAR ALUMNOS (accesible para profesores) ──────────────────────────────

@router.get("", response_model=list[AlumnoListItem])
async def listar_alumnos(
    activo: bool = True,
    nombre: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Listado simple de alumnos, accesible para profesores y admins.
    Filtros:
      - activo: True (por defecto) → solo activos; False → solo bajas.
      - nombre: búsqueda parcial (case-insensitive) en nombre Y apellidos.
    """
    query = select(Alumno).where(Alumno.activo == activo)

    if nombre and nombre.strip():
        like = f"%{nombre.strip()}%"
        query = query.where(
            Alumno.nombre.ilike(like) | Alumno.apellidos.ilike(like)
        )

    query = query.order_by(Alumno.apellidos, Alumno.nombre)

    result = await db.execute(query)
    return result.scalars().all()


# ── CREAR ALUMNO (solo admin) ───────────────────────────────────────────────

@router.post("", response_model=AlumnoOut, status_code=status.HTTP_201_CREATED)
async def crear_alumno(
    data: AlumnoCreate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Crea un alumno nuevo. Solo admins."""
    nuevo = Alumno(**data.model_dump(exclude_unset=True), activo=True)
    db.add(nuevo)
    await db.commit()
    await db.refresh(nuevo)
    return nuevo


# ── IMPORTAR ALUMNOS DESDE EXCEL ────────────────────────────────────────────

@router.post("/importar")
async def importar_alumnos_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Procesa un listado masivo de ALUMNOS desde la primera pestaña de un Excel.
    Columnas esperadas:
      - nombre, apellidos       (obligatorias)
      - email, telefono         (opcionales)
      - telefono2               (opcional)
      - fecha_nacimiento        (opcional, DD/MM/AAAA o fecha Excel)
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

            if not nombre or nombre.lower() in ("nan", ""):
                continue

            email = (
                str(row["email"]).strip()
                if "email" in df.columns and pd.notna(row["email"])
                else None
            )

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

            fecha_nacimiento = None
            if "fecha_nacimiento" in df.columns and pd.notna(row["fecha_nacimiento"]):
                val_fecha = row["fecha_nacimiento"]
                try:
                    if isinstance(val_fecha, (pd.Timestamp,)):
                        fecha_nacimiento = val_fecha.date()
                    elif hasattr(val_fecha, "date"):
                        fecha_nacimiento = val_fecha.date()
                    else:
                        fecha_nacimiento = pd.to_datetime(
                            str(val_fecha).strip(), dayfirst=True, errors="coerce"
                        )
                        fecha_nacimiento = (
                            fecha_nacimiento.date() if pd.notna(fecha_nacimiento) else None
                        )
                except Exception:
                    fecha_nacimiento = None

            existe_res = await db.execute(
                select(Alumno).where(
                    Alumno.nombre == nombre,
                    Alumno.apellidos == apellidos,
                )
            )
            if existe_res.scalar_one_or_none():
                continue

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
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve los packs activos de un alumno con lo mínimo necesario para
    que la app móvil del profesor pueda registrar una asistencia.
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
            continue
        salida.append(PackActivoSimple(
            id=p.id,
            categoria=p.tarifa.categoria.value,
            tipo_clase_id=p.tarifa.tipo_clase.id,
            tipo_clase_nombre=p.tarifa.tipo_clase.nombre,
        ))
    return salida


# ── HERMANOS ───────────────────────────────────────────────────────────────

@router.get("/{alumno_id}/hermanos", response_model=list[AlumnoListItem])
async def listar_hermanos(
    alumno_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Lista los hermanos vinculados a un alumno."""
    result = await db.execute(
        select(Hermanos).where(
            or_(
                Hermanos.alumno_id_1 == alumno_id,
                Hermanos.alumno_id_2 == alumno_id,
            )
        )
    )
    vinculos = result.scalars().all()

    hermano_ids = [
        v.alumno_id_2 if v.alumno_id_1 == alumno_id else v.alumno_id_1
        for v in vinculos
    ]
    if not hermano_ids:
        return []

    result2 = await db.execute(
        select(Alumno)
        .where(Alumno.id.in_(hermano_ids))
        .order_by(Alumno.apellidos, Alumno.nombre)
    )
    return result2.scalars().all()


@router.post("/{alumno_id}/hermanos/{hermano_id}", status_code=status.HTTP_201_CREATED)
async def vincular_hermano(
    alumno_id: int,
    hermano_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Vincula dos alumnos como hermanos. Solo admins."""
    if alumno_id == hermano_id:
        raise HTTPException(status_code=400, detail="Un alumno no puede ser hermano de sí mismo")

    a = await db.get(Alumno, alumno_id)
    h = await db.get(Alumno, hermano_id)
    if not a or not h:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    id_1, id_2 = min(alumno_id, hermano_id), max(alumno_id, hermano_id)

    existe = await db.execute(
        select(Hermanos).where(
            Hermanos.alumno_id_1 == id_1,
            Hermanos.alumno_id_2 == id_2,
        )
    )
    if existe.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya están vinculados como hermanos")

    db.add(Hermanos(alumno_id_1=id_1, alumno_id_2=id_2))
    await db.commit()
    return {"status": "ok", "mensaje": "Hermanos vinculados correctamente"}


@router.delete("/{alumno_id}/hermanos/{hermano_id}", status_code=status.HTTP_204_NO_CONTENT)
async def desvincular_hermano(
    alumno_id: int,
    hermano_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Desvincula dos alumnos que estaban marcados como hermanos. Solo admins."""
    id_1, id_2 = min(alumno_id, hermano_id), max(alumno_id, hermano_id)

    result = await db.execute(
        select(Hermanos).where(
            Hermanos.alumno_id_1 == id_1,
            Hermanos.alumno_id_2 == id_2,
        )
    )
    vinculo = result.scalar_one_or_none()
    if not vinculo:
        raise HTTPException(status_code=404, detail="No están vinculados como hermanos")

    await db.delete(vinculo)
    await db.commit()


# ── HISTÓRICO MENSUAL DEL ALUMNO ────────────────────────────────────────────

@router.get("/{alumno_id}/historico", response_model=list[HistoricoMesOut])
async def historico_alumno(
    alumno_id: int,
    meses: int = 6,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Histórico mensual del alumno: horas/sesiones consumidas, estado del
    semáforo, cobros y total recaudado. Devuelve los últimos `meses` meses
    (más reciente primero), omitiendo los que no tienen actividad ni cobros.
    """
    alumno = await db.get(Alumno, alumno_id)
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    if meses < 1:
        meses = 1
    if meses > 36:
        meses = 36

    hoy = date.today()
    meses_rango = []
    for i in range(meses):
        m = hoy.month - i
        y = hoy.year
        while m <= 0:
            m += 12
            y -= 1
        meses_rango.append((y, m))

    resumenes_result = await db.execute(
        select(ResumenMensual).where(ResumenMensual.alumno_id == alumno_id)
    )
    resumenes = resumenes_result.scalars().all()

    cobros_result = await db.execute(
        select(Cobro)
        .where(Cobro.alumno_id == alumno_id)
        .order_by(Cobro.fecha)
    )
    cobros = cobros_result.scalars().all()

    resultado: list[HistoricoMesOut] = []

    for anio, mes in meses_rango:
        resumenes_mes = [r for r in resumenes if r.anio == anio and r.mes == mes]
        horas_consumidas = sum(float(r.horas_consumidas or 0) for r in resumenes_mes)
        sesiones_consumidas = sum(int(r.sesiones_consumidas or 0) for r in resumenes_mes)
        horas_contratadas = sum(float(r.horas_contratadas or 0) for r in resumenes_mes) or None
        sesiones_contratadas = sum(int(r.sesiones_contratadas or 0) for r in resumenes_mes) or None
        semanas = resumenes_mes[0].semanas_en_mes if resumenes_mes else 4

        cobros_mes = [
            c for c in cobros
            if c.fecha.year == anio and c.fecha.month == mes
        ]
        cobros_out = [
            CobroResumenOut(
                id=c.id,
                fecha=c.fecha,
                total=float(c.total),
                anulado=bool(c.anulado),
                notas=c.notas,
            )
            for c in cobros_mes
        ]
        cobros_validos = [c for c in cobros_mes if not c.anulado]
        recaudado = sum(float(c.total) for c in cobros_validos)

        if not resumenes_mes and not cobros_mes:
            continue

        if cobros_validos:
            estado = "verde"
        elif horas_consumidas > 0 or sesiones_consumidas > 0:
            estado = "rojo"
        else:
            estado = "rojo"

        resultado.append(HistoricoMesOut(
            anio=anio,
            mes=mes,
            mes_label=f"{MESES_CORTOS[mes - 1]} {anio}",
            horas_consumidas=horas_consumidas,
            sesiones_consumidas=sesiones_consumidas,
            horas_contratadas=horas_contratadas,
            sesiones_contratadas=sesiones_contratadas,
            semanas_en_mes=semanas,
            estado=estado,
            cobros=cobros_out,
            recaudado=recaudado,
        ))

    return resultado


# ── OBTENER ALUMNO (ficha completa con packs) ───────────────────────────────

@router.get("/{alumno_id}", response_model=AlumnoDetalleOut)
async def obtener_alumno(
    alumno_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Ficha completa de un alumno: datos personales + packs activos
    (con nombre de tarifa, categoría, profesor y precio).

    Para cada pack activo se calcula si ya fue cobrado este mes
    (cruzando con cobros_packs del mes actual, ignorando cobros anulados)
    y se expone estado_semaforo + importe_debido para que la ficha
    muestre rojo/verde con el importe real.
    """
    result = await db.execute(
        select(Alumno)
        .options(
            selectinload(Alumno.packs).selectinload(PackAlumno.tarifa),
            selectinload(Alumno.packs).selectinload(PackAlumno.profesor),
        )
        .where(Alumno.id == alumno_id)
    )
    alumno = result.scalar_one_or_none()
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    packs_activos = [p for p in alumno.packs if p.activo]
    packs_activos.sort(key=lambda p: p.fecha_inicio or date.min, reverse=True)

    # ── ¿Qué packs se han cobrado este mes (no anulados)? ──
    hoy = date.today()
    cobrados_result = await db.execute(
        select(CobroPack.pack_alumno_id)
        .join(Cobro, Cobro.id == CobroPack.cobro_id)
        .where(
            Cobro.alumno_id == alumno_id,
            Cobro.anulado == False,
            extract("year", Cobro.fecha) == hoy.year,
            extract("month", Cobro.fecha) == hoy.month,
        )
    )
    packs_cobrados_mes = {row[0] for row in cobrados_result.all() if row[0] is not None}

    packs_out = []
    for p in packs_activos:
        pagado = p.id in packs_cobrados_mes

        if pagado:
            estado = "verde"
            importe = 0.0
        else:
            estado = "rojo"
            # Si el pack tiene tarifa asignada, mostramos su precio como deuda.
            # Si aún es un pack pendiente (tarifa_id NULL), deuda 0 (sin tarifa).
            importe = float(p.tarifa.precio_base) if p.tarifa else 0.0

        packs_out.append(PackAlumnoFichaOut(
            id=p.id,
            tarifa_id=p.tarifa_id,
            profesor_id=p.profesor_id,
            profesor_nombre=(
                f"{p.profesor.nombre} {p.profesor.apellidos}" if p.profesor else None
            ),
            fecha_inicio=p.fecha_inicio,
            fecha_fin=p.fecha_fin,
            activo=p.activo,
            notas=p.notas,
            tarifa=p.tarifa,
            pagado_este_mes=pagado,
            estado_semaforo=estado,
            importe_debido=importe,
        ))

    base = AlumnoOut.model_validate(alumno).model_dump()
    return AlumnoDetalleOut(**base, packs=packs_out)


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


# ── DAR DE BAJA ALUMNO (soft delete, solo admin) ────────────────────────────

@router.delete("/{alumno_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dar_baja_alumno(
    alumno_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Da de baja a un alumno (soft delete: activo=False).
    No borra el registro — conserva historial de asistencias y cobros.
    """
    alumno = await db.get(Alumno, alumno_id)
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    alumno.activo = False
    await db.commit()