"""
conftest.py — fixtures compartidos para todos los tests de doce-escalones.

Usa una base de datos SQLite en memoria para no necesitar PostgreSQL al testear.
Cada test obtiene su propia sesión limpia gracias al rollback automático.
"""
import pytest
import pytest_asyncio
from decimal import Decimal
from datetime import date, datetime

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

# ── Importar modelos y base ────────────────────────────────────────────────────
# Asegúrate de que PYTHONPATH incluye backend/ al correr pytest
from app.db.database import Base
from app.models.models import (
    Usuario, RolEnum,
    Alumno, Tarifa, CategoriaEnum,
    PackAlumno, TipoClase,
    AcademiaConfig,
)
from app.core.security import hash_pin

# ── Engine SQLite en memoria ───────────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="session")
def engine():
    return create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

@pytest_asyncio.fixture(scope="session")
async def create_tables(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def db(engine, create_tables):
    """Sesión con rollback automático al finalizar cada test."""
    async with engine.connect() as conn:
        await conn.begin_nested()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()

# ── Fixtures de datos base ─────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def admin(db):
    u = Usuario(
        nombre="Admin", apellidos="Test",
        email="admin@test.com", pin=hash_pin("1234"),
        rol=RolEnum.admin, activo=True,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u

@pytest_asyncio.fixture
async def profesor(db):
    u = Usuario(
        nombre="Profe", apellidos="Test",
        email="profe@test.com", pin=hash_pin("5678"),
        rol=RolEnum.profesor, activo=True,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u

@pytest_asyncio.fixture
async def alumno_a(db):
    a = Alumno(nombre="Ana", apellidos="García", activo=True)
    db.add(a)
    await db.flush()
    await db.refresh(a)
    return a

@pytest_asyncio.fixture
async def alumno_b(db):
    a = Alumno(nombre="Borja", apellidos="García", activo=True)
    db.add(a)
    await db.flush()
    await db.refresh(a)
    return a

@pytest_asyncio.fixture
async def tarifa_normal(db):
    t = Tarifa(
        nombre="Bono 2h/semana",
        categoria=CategoriaEnum.normal,
        horas_semanales=2.0,
        precio_base=80.0,
        activo=True,
        es_bono_sesion=False,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return t

@pytest_asyncio.fixture
async def tarifa_sesion(db):
    t = Tarifa(
        nombre="Bono 10 sesiones",
        categoria=CategoriaEnum.sesion,
        num_sesiones=10,
        es_bono_sesion=True,
        duracion_sesion_min=60,
        precio_base=120.0,
        activo=True,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return t

@pytest_asyncio.fixture
async def tipo_clase(db):
    tc = TipoClase(nombre="Apoyo escolar", categoria="normal", activo=True)
    db.add(tc)
    await db.flush()
    await db.refresh(tc)
    return tc

@pytest_asyncio.fixture
async def pack_a(db, alumno_a, tarifa_normal, profesor):
    p = PackAlumno(
        alumno_id=alumno_a.id,
        tarifa_id=tarifa_normal.id,
        profesor_id=profesor.id,
        fecha_inicio=date.today(),
        activo=True,
    )
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return p

@pytest_asyncio.fixture
async def academia_config(db):
    cfg = AcademiaConfig(
        id=1,
        nombre="12 Escalones",
        cif="B12345678",
        direccion="Jerez de la Frontera",
        telefono="600000000",
        email="info@12escalones.com",
        siguiente_num_factura=1,
    )
    db.add(cfg)
    await db.flush()
    await db.refresh(cfg)
    return cfg
