"""
Configuración de la academia + sistema completo de backups.
"""
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import AcademiaConfig, Usuario
from app.schemas.schemas import AcademiaConfigOut, AcademiaConfigUpdate
from app.services import backup_service

from pydantic import BaseModel
from app.services.reparar_resumenes_service import reparar_resumenes

router = APIRouter()

# ── Rutas de logos ───────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LOGO_DIR = os.getenv("LOGO_DIR", os.path.join(BASE_DIR, "media", "logos"))
os.makedirs(LOGO_DIR, exist_ok=True)


async def _get_or_create_config(db: AsyncSession) -> AcademiaConfig:
    result = await db.execute(select(AcademiaConfig).where(AcademiaConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = AcademiaConfig(id=1, nombre="12 Escalones")
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


# ── GET /config ──────────────────────────────────────────────

@router.get("", response_model=AcademiaConfigOut)
async def obtener_config(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    return await _get_or_create_config(db)


# ── PUT /config ──────────────────────────────────────────────

@router.put("", response_model=AcademiaConfigOut)
async def actualizar_config(
    data: AcademiaConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    config = await _get_or_create_config(db)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return config


# ── POST /config/logo ────────────────────────────────────────

@router.post("/logo", response_model=AcademiaConfigOut)
async def subir_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    if file.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=400, detail="Solo se admiten PNG o JPG")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El logo no puede superar 2 MB")

    ext      = "png" if file.content_type == "image/png" else "jpg"
    filename = f"logo_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(LOGO_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    config = await _get_or_create_config(db)

    if config.logo_path and os.path.exists(config.logo_path):
        try:
            os.remove(config.logo_path)
        except OSError:
            pass

    config.logo_path = filepath
    await db.commit()
    await db.refresh(config)
    return config


# ══════════════════════════════════════════════════════════════
#   BACKUPS
# ══════════════════════════════════════════════════════════════

@router.get("/backup/estado")
async def backup_estado(_: Usuario = Depends(get_current_admin)):
    """Estado general: última ejecución, próxima, espacio ocupado, contadores."""
    return backup_service.obtener_estado()


@router.get("/backup/listar")
async def backup_listar(_: Usuario = Depends(get_current_admin)):
    """Lista de backups disponibles (auto + manual)."""
    return backup_service.listar_backups()


@router.get("/backup/log")
async def backup_log(limite: int = 100, _: Usuario = Depends(get_current_admin)):
    """Últimas líneas del log de backups."""
    return {"lineas": backup_service.leer_log(limite)}


@router.post("/backup/ahora")
async def backup_ahora(_: Usuario = Depends(get_current_admin)):
    """Crea un backup manual AHORA y lo devuelve como descarga."""
    ok, resultado = backup_service.crear_backup('manual')
    if not ok:
        raise HTTPException(status_code=500, detail=f"Error al crear backup: {resultado}")

    ruta = resultado
    nombre = os.path.basename(ruta)
    return FileResponse(
        path=ruta,
        filename=nombre,
        media_type="application/gzip",
    )


@router.get("/backup/descargar/{nombre}")
async def backup_descargar(nombre: str, _: Usuario = Depends(get_current_admin)):
    """Descarga un backup existente por nombre."""
    # Seguridad: evitar path traversal
    if '/' in nombre or '\\' in nombre or '..' in nombre:
        raise HTTPException(status_code=400, detail="Nombre inválido")

    ruta = backup_service.obtener_ruta_backup(nombre)
    if not ruta:
        raise HTTPException(status_code=404, detail="Backup no encontrado")

    return FileResponse(
        path=ruta,
        filename=nombre,
        media_type="application/gzip",
    )


@router.delete("/backup/{nombre}")
async def backup_borrar(nombre: str, _: Usuario = Depends(get_current_admin)):
    """Borra un backup existente."""
    if '/' in nombre or '\\' in nombre or '..' in nombre:
        raise HTTPException(status_code=400, detail="Nombre inválido")

    ok, error = backup_service.borrar_backup(nombre)
    if not ok:
        raise HTTPException(status_code=404, detail=error or "No se pudo borrar")

    return {"status": "ok", "mensaje": f"Backup '{nombre}' borrado"}


@router.post("/backup/restaurar")
async def backup_restaurar(
    file: UploadFile = File(...),
    _: Usuario = Depends(get_current_admin),
):
    """
    ⚠️ PELIGROSO: sube un .sql o .sql.gz y sobreescribe la base de datos.
    Solo admins. Pedir confirmación desde el frontend.
    """
    if not (file.filename.endswith('.sql') or file.filename.endswith('.sql.gz')):
        raise HTTPException(status_code=400, detail="Debe ser un archivo .sql o .sql.gz")

    # Guardar temporal
    temp_dir = os.path.join(backup_service.BACKUP_DIR, "tmp")
    os.makedirs(temp_dir, exist_ok=True)
    ruta = os.path.join(temp_dir, f"restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}")

    contenido = await file.read()
    with open(ruta, "wb") as f:
        f.write(contenido)

    try:
        ok, error = backup_service.restaurar_backup(ruta)
        if not ok:
            raise HTTPException(status_code=500, detail=f"Error al restaurar: {error}")
        return {"status": "ok", "mensaje": "Base de datos restaurada correctamente"}
    finally:
        try:
            os.remove(ruta)
        except OSError:
            pass

  # ── Monitorización de discos ─────────────────────────────────

@router.get("/disk/estado")
async def disk_estado(_: Usuario = Depends(get_current_admin)):
    """Devuelve el uso actual de todos los discos."""
    from app.services import disk_monitor_service
    return {"discos": disk_monitor_service.obtener_uso_discos()}   


# ── ADMIN — Reparar resúmenes mensuales ─────────────────────

class RepararResumenesOut(BaseModel):
    creados: int
    actualizados: int
    total_asistencias: int
    grupos: int
    mensaje: str


@router.post("/admin/reparar-resumenes", response_model=RepararResumenesOut)
async def reparar_resumenes_endpoint(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Repara los ResumenMensual que falten tras un borrado masivo.

    ⚠️ Solo usar si se ha hecho un DELETE masivo por SQL de cobros,
    facturas o asistencias. Recorre todas las Asistencias y regenera
    los resúmenes mensuales desde cero.

    Es seguro ejecutarlo varias veces (idempotente).
    """
    resumen = await reparar_resumenes(db)

    if resumen['creados'] == 0 and resumen['actualizados'] == 0:
        mensaje = "No había nada que reparar (sin asistencias)"
    else:
        partes = []
        if resumen['creados'] > 0:
            partes.append(f"{resumen['creados']} resúmenes creados")
        if resumen['actualizados'] > 0:
            partes.append(f"{resumen['actualizados']} resúmenes actualizados")
        mensaje = "✅ " + " · ".join(partes)

    return RepararResumenesOut(
        creados=resumen['creados'],
        actualizados=resumen['actualizados'],
        total_asistencias=resumen['total_asistencias'],
        grupos=resumen['grupos'],
        mensaje=mensaje,
    )