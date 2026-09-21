"""
Configuración de la academia (datos fiscales para tickets y facturas) y Backups del Sistema.
GET  /config                  → leer config actual
PUT  /config                  → actualizar (solo admin)
POST /config/logo             → subir logo (guarda en disco local)
POST /config/backup/cierre    → copia de seguridad rotativa de 7 días
GET  /config/backup/descargar → descargar volcado SQL actual
POST /config/backup/restaurar → importar un archivo .sql previo
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os, uuid, subprocess
from datetime import datetime

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.models.models import AcademiaConfig, Usuario
from app.schemas.schemas import AcademiaConfigOut, AcademiaConfigUpdate

router = APIRouter()

# ── Rutas compatibles Windows y Linux ────────────────────────────────────────
# Sube 4 niveles desde este archivo hasta la raíz del proyecto
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LOGO_DIR   = os.getenv("LOGO_DIR",   os.path.join(BASE_DIR, "media", "logos"))
BACKUP_DIR = os.getenv("BACKUP_DIR", os.path.join(BASE_DIR, "media", "backups"))

os.makedirs(LOGO_DIR,   exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

# Parámetros PostgreSQL desde .env
DB_USER = os.getenv("POSTGRES_USER", "doce_user")
DB_NAME = os.getenv("POSTGRES_DB",   "doce_escalones")
DB_HOST = os.getenv("POSTGRES_HOST", "192.168.1.156")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "doce_pass")


async def _get_or_create_config(db: AsyncSession) -> AcademiaConfig:
    result = await db.execute(select(AcademiaConfig).where(AcademiaConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = AcademiaConfig(id=1, nombre="12 Escalones")
        db.add(config)
        await db.flush()
        await db.refresh(config)
    return config


# ── GET /config ───────────────────────────────────────────────────────────────

@router.get("", response_model=AcademiaConfigOut)
async def obtener_config(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    return await _get_or_create_config(db)


# ── PUT /config ───────────────────────────────────────────────────────────────

@router.put("", response_model=AcademiaConfigOut)
async def actualizar_config(
    data: AcademiaConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    config = await _get_or_create_config(db)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    await db.flush()
    await db.refresh(config)
    return config


# ── POST /config/logo ─────────────────────────────────────────────────────────

@router.post("/logo", response_model=AcademiaConfigOut)
async def subir_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Sube el logo de la academia. Solo PNG o JPG, máximo 2 MB."""
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

    # Borrar logo anterior si existe
    if config.logo_path and os.path.exists(config.logo_path):
        try:
            os.remove(config.logo_path)
        except OSError:
            pass

    config.logo_path = filepath
    await db.flush()
    await db.refresh(config)
    return config


# ── POST /config/backup/cierre ────────────────────────────────────────────────

@router.post("/backup/cierre")
async def backup_automatico_cierre(request: Request):
    """
    Volcado rotativo por día de la semana (backup_lunes.sql, etc.).
    Solo acepta llamadas desde localhost.
    """
    client_host = request.client.host if request.client else "unknown"
    if client_host not in ("127.0.0.1", "localhost", "::1", "testclient"):
        raise HTTPException(status_code=403, detail="Solo disponible desde localhost")

    dias = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
    dia  = dias[datetime.now().weekday()]
    ruta = os.path.join(BACKUP_DIR, f"backup_{dia}.sql")

    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASS

    cmd = ["pg_dump", "-h", DB_HOST, "-U", DB_USER, "-d", DB_NAME, "-F", "p", "-f", ruta]
    try:
        resultado = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if resultado.returncode != 0:
            raise Exception(resultado.stderr)
        return {"status": "ok", "archivo": f"backup_{dia}.sql"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en backup: {e}")


# ── GET /config/backup/descargar ──────────────────────────────────────────────

@router.get("/backup/descargar")
async def descargar_backup(_: Usuario = Depends(get_current_admin)):
    """Genera un volcado SQL y lo sirve como descarga."""
    fecha    = datetime.now().strftime("%Y-%m-%d_%H-%M")
    ruta     = os.path.join(BACKUP_DIR, f"backup_manual_{fecha}.sql")

    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASS

    cmd = ["pg_dump", "-h", DB_HOST, "-U", DB_USER, "-d", DB_NAME, "-F", "p", "-f", ruta]
    try:
        resultado = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if resultado.returncode != 0:
            raise Exception(resultado.stderr)
        return FileResponse(
            path=ruta,
            filename=f"backup_doce_escalones_{fecha}.sql",
            media_type="application/sql",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar backup: {e}")


# ── POST /config/backup/restaurar ────────────────────────────────────────────

@router.post("/backup/restaurar")
async def restaurar_backup(
    file: UploadFile = File(...),
    _: Usuario = Depends(get_current_admin),
):
    """Sube un .sql y lo restaura en la base de datos."""
    if not file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="Debe subir un archivo .sql")

    ruta = os.path.join(BACKUP_DIR, "restore_upload.sql")
    contenido = await file.read()
    with open(ruta, "wb") as f:
        f.write(contenido)

    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASS

    cmd = ["psql", "-h", DB_HOST, "-U", DB_USER, "-d", DB_NAME, "-f", ruta]
    try:
        resultado = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if resultado.returncode != 0:
            raise Exception(resultado.stderr)
        return {"status": "ok", "mensaje": "Base de datos restaurada correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en restauración: {e}")
