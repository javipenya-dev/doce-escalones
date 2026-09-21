from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date
from typing import Optional

from app.db.database import get_db
from app.core.deps import get_current_user, get_current_admin
from app.models.models import Usuario, PackAlumno, Asistencia, Alumno, TipoClase
from app.schemas.schemas import (
    AsistenciaCreate, AsistenciaOut, AsistenciaRegistradaResponse,
    AsistenciaSyncBatch, SyncResponse, AsistenciaUpdate,
)
from app.services import asistencias_service
from app.api.routes.websocket import manager

router = APIRouter()


@router.post(
    "",
    response_model=AsistenciaRegistradaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def registrar_asistencia(
    data: AsistenciaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Registra una asistencia y actualiza el resumen mensual del alumno.
    Disponible para profesores y admins.

    SISTEMA DE PACKS PENDIENTES: si el pack_alumno_id recibido no existe,
    no pertenece al alumno, o no está activo, en lugar de rechazar la
    petición se busca (o crea) automáticamente un "pack pendiente" para
    la categoría de la clase, de forma que el profesor nunca se queda
    bloqueado por no tener un pack pagado todavía. El pack pendiente
    queda marcado como "sin cobro" (rojo) hasta que el admin le asigne
    una tarifa real.

    Tras registrar, hace broadcast por WebSocket al panel en tiempo real.
    """
    # 1. Necesitamos el tipo de clase para saber la categoría
    tipo_clase_result = await db.execute(
        select(TipoClase).where(TipoClase.id == data.tipo_clase_id)
    )
    tipo_clase = tipo_clase_result.scalar_one_or_none()
    if not tipo_clase:
        raise HTTPException(status_code=404, detail="Tipo de clase no encontrado")

    # 2. Verificar que el pack indicado existe, pertenece al alumno y está activo
    pack_result = await db.execute(
        select(PackAlumno).where(
            PackAlumno.id == data.pack_alumno_id,
            PackAlumno.alumno_id == data.alumno_id,
            PackAlumno.activo == True,
        )
    )
    pack = pack_result.scalar_one_or_none()

    # 3. Si no hay pack válido, resolvemos automáticamente uno pendiente
    if not pack:
        pack = await asistencias_service.get_or_create_pack_pendiente(
            db,
            alumno_id=data.alumno_id,
            categoria=tipo_clase.categoria.value,
            profesor_id=current_user.id,
        )
        data.pack_alumno_id = pack.id

    # 4. Registrar asistencia y actualizar resumen
    asistencia, resumen = await asistencias_service.registrar_asistencia(
        db, data, profesor_id=current_user.id
    )

    # Broadcast al panel en tiempo real
    await manager.broadcast({
        "tipo": "asistencia_nueva",
        "alumno_id": data.alumno_id,
        "profesor_id": current_user.id,
        "profesor_nombre": f"{current_user.nombre} {current_user.apellidos}",
        "fecha": str(data.fecha),
        "estado": resumen.estado,
        "horas_mes": resumen.horas_consumidas,
        "sesiones_mes": resumen.sesiones_consumidas,
    })

    return AsistenciaRegistradaResponse(
        asistencia=AsistenciaOut.model_validate(asistencia),
        resumen_actualizado=resumen,
    )


@router.post("/sync", response_model=SyncResponse)
async def sync_asistencias_offline(
    batch: AsistenciaSyncBatch,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Sincronización batch de asistencias registradas offline.
    Usa uuid_local como idempotency key — las duplicadas se ignoran silenciosamente.
    """
    if not batch.asistencias:
        return SyncResponse(procesadas=0, duplicadas=0, errores=[])

    resultado = await asistencias_service.sync_asistencias_offline(
        db, batch.asistencias, profesor_id=current_user.id
    )

    if resultado["procesadas"] > 0:
        await manager.broadcast({
            "tipo": "sync_completado",
            "profesor_id": current_user.id,
            "profesor_nombre": f"{current_user.nombre} {current_user.apellidos}",
            "procesadas": resultado["procesadas"],
        })

    return SyncResponse(**resultado)


@router.put("/{asistencia_id}", response_model=AsistenciaOut)
async def editar_asistencia(
    asistencia_id: int,
    data: AsistenciaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Corrige hora_inicio y/o duracion_min de una asistencia.

    Un profesor solo puede editar SUS PROPIAS asistencias, y solo
    del día de hoy (para corregir despistes al momento, sin abrir
    la puerta a reescribir historial pasado). Los admins pueden
    editar cualquier asistencia, sin restricción de fecha.
    """
    result = await db.execute(select(Asistencia).where(Asistencia.id == asistencia_id))
    asistencia = result.scalar_one_or_none()
    if not asistencia:
        raise HTTPException(status_code=404, detail="Asistencia no encontrada")

    es_admin = current_user.rol.value == "admin"
    es_propia = asistencia.profesor_id == current_user.id
    es_de_hoy = asistencia.fecha == date.today()

    if not es_admin and not (es_propia and es_de_hoy):
        raise HTTPException(
            status_code=403,
            detail="Solo puedes editar tus propias asistencias de hoy",
        )

    if data.hora_inicio is not None:
        asistencia.hora_inicio = data.hora_inicio
    if data.duracion_min is not None:
        asistencia.duracion_min = data.duracion_min

    await db.flush()

    # Recalculamos el resumen mensual del mes de la asistencia usando el
    # mismo servicio que DELETE. Es consistente con el resto del código y
    # funciona aunque el pack esté pendiente (sin ResumenMensual creado
    # todavía) o aunque la asistencia sea de tipo sesión.
    resumen_out = await asistencias_service.recalcular_resumen_mensual(
        db,
        alumno_id=asistencia.alumno_id,
        year=asistencia.fecha.year,
        month=asistencia.fecha.month,
    )

    await db.commit()
    await db.refresh(asistencia)

    if resumen_out:
        await manager.broadcast({
            "tipo": "asistencia_editada",
            "alumno_id": asistencia.alumno_id,
            "profesor_id": asistencia.profesor_id,
            "estado": resumen_out.estado,
            "horas_mes": resumen_out.horas_consumidas,
        })

    return asistencia


@router.delete("/{asistencia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_asistencia(
    asistencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Elimina una asistencia. Un profesor solo puede eliminar SUS PROPIAS
    asistencias de hoy; los admins pueden eliminar cualquiera, sin
    restricción de fecha (para correcciones administrativas).
    Recalcula automáticamente el resumen_mensual (semáforo) del alumno
    para el mes de la asistencia eliminada y notifica por WebSocket.
    """
    result = await db.execute(
        select(Asistencia).where(Asistencia.id == asistencia_id)
    )
    asistencia = result.scalar_one_or_none()
    if not asistencia:
        raise HTTPException(status_code=404, detail="Asistencia no encontrada")

    es_admin = current_user.rol.value == "admin"
    es_propia = asistencia.profesor_id == current_user.id
    es_de_hoy = asistencia.fecha == date.today()

    if not es_admin and not (es_propia and es_de_hoy):
        raise HTTPException(
            status_code=403,
            detail="Solo puedes eliminar tus propias asistencias de hoy",
        )

    alumno_id = asistencia.alumno_id
    fecha_asistencia = asistencia.fecha

    await db.delete(asistencia)
    await db.flush()

    resumen_actualizado = await asistencias_service.recalcular_resumen_mensual(
        db,
        alumno_id=alumno_id,
        year=fecha_asistencia.year,
        month=fecha_asistencia.month,
    )

    await db.commit()

    if resumen_actualizado:
        await manager.broadcast({
            "tipo": "asistencia_eliminada",
            "alumno_id": alumno_id,
            "admin_id": current_user.id,
            "fecha_afectada": str(fecha_asistencia),
            "estado": resumen_actualizado.estado,
            "horas_mes": resumen_actualizado.horas_consumidas,
            "sesiones_mes": resumen_actualizado.sesiones_consumidas,
        })


# ── MIS ASISTENCIAS DE HOY (profesor) ──────────────────────────────────────

@router.get("/hoy", tags=["Asistencias"])
async def listar_mis_asistencias_hoy(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve las asistencias de HOY registradas por el profesor logueado.
    Seguro para profesores: siempre filtra por current_user.id.
    """
    hoy = date.today()

    stmt = (
        select(Asistencia, Alumno, Usuario, TipoClase)
        .join(Alumno,    Asistencia.alumno_id    == Alumno.id)
        .join(Usuario,   Asistencia.profesor_id  == Usuario.id)
        .join(TipoClase, Asistencia.tipo_clase_id == TipoClase.id)
        .where(
            Asistencia.fecha == hoy,
            Asistencia.profesor_id == current_user.id,
        )
        .order_by(Asistencia.created_at.desc())
    )

    rows = (await db.execute(stmt)).all()

    return [
        {
            "id":            a.id,
            "fecha":         str(a.fecha),
            "hora_inicio":   str(a.hora_inicio) if a.hora_inicio else None,
            "duracion_min":  a.duracion_min,
            "es_sesion":     a.es_sesion,
            "sincronizado":  a.sincronizado,
            "alumno_id":     al.id,
            "alumno_nombre": f"{al.nombre} {al.apellidos}",
            "profesor_id":   p.id,
            "profesor_nombre": p.nombre,
            "tipo_clase":    tc.nombre,
            "categoria": tc.categoria.value if tc.categoria else None,
        }
        for a, al, p, tc in rows
    ]


# ── LISTADO DE ASISTENCIAS (admin) ────────────────────────────────────────────

@router.get("", tags=["Asistencias"])
async def listar_asistencias(
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    profesor_id: Optional[int]  = Query(None),
    alumno_id:   Optional[int]  = Query(None),
    categoria:   Optional[str]  = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Listado de asistencias con filtros. Para la vista /asistencias del panel."""
    stmt = (
        select(Asistencia, Alumno, Usuario, TipoClase)
        .join(Alumno,    Asistencia.alumno_id    == Alumno.id)
        .join(Usuario,   Asistencia.profesor_id  == Usuario.id)
        .join(TipoClase, Asistencia.tipo_clase_id == TipoClase.id)
        .order_by(Asistencia.fecha.desc(), Asistencia.created_at.desc())
        .limit(limit)
    )
    if fecha_desde:
        stmt = stmt.where(Asistencia.fecha >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(Asistencia.fecha <= fecha_hasta)
    if profesor_id:
        stmt = stmt.where(Asistencia.profesor_id == profesor_id)
    if alumno_id:
        stmt = stmt.where(Asistencia.alumno_id == alumno_id)
    if categoria:
        stmt = stmt.where(TipoClase.categoria == categoria)

    rows = (await db.execute(stmt)).all()

    return [
        {
            "id":            a.id,
            "fecha":         str(a.fecha),
            "hora_inicio":   str(a.hora_inicio) if a.hora_inicio else None,
            "duracion_min":  a.duracion_min,
            "es_sesion":     a.es_sesion,
            "sincronizado":  a.sincronizado,
            "alumno_id":     al.id,
            "alumno_nombre": f"{al.nombre} {al.apellidos}",
            "profesor_id":   p.id,
            "profesor_nombre": p.nombre,
            "tipo_clase":    tc.nombre,
            "categoria": tc.categoria.value if tc.categoria else None,
        }
        for a, al, p, tc in rows
    ]