"""
Modelos SQLAlchemy 2.x — Academia Doce Escalones
Refleja exactamente el schema de docs/assets/schema.sql con mejoras integradas
"""
import enum
import json
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime,
    Enum, ForeignKey, Index, Integer, Numeric, String,
    Text, Time, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class RolEnum(str, enum.Enum):
    admin    = "admin"
    profesor = "profesor"


class CategoriaEnum(str, enum.Enum):
    normal = "normal"
    ingles = "ingles"
    sesion = "sesion"


class FormaPagoEnum(str, enum.Enum):
    efectivo     = "efectivo"
    tarjeta      = "tarjeta"
    bizum        = "bizum"
    transferencia = "transferencia"


# ── Tablas ────────────────────────────────────────────────────────────────────

class Usuario(Base):
    """Admins y profesores del sistema."""
    __tablename__ = "usuarios"

    id         = Column(Integer, primary_key=True)
    nombre     = Column(String(100), nullable=False)
    apellidos  = Column(String(150), nullable=False)
    email      = Column(String(150), unique=True)
    telefono   = Column(String(20), nullable=True)
    color      = Column(String(7), nullable=True, default='#F26419')
    pin        = Column(String(6), nullable=False)
    rol        = Column(Enum(RolEnum), nullable=False)
    activo     = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    packs_asignados = relationship("PackAlumno", back_populates="profesor", foreign_keys="PackAlumno.profesor_id")
    asistencias     = relationship("Asistencia",  back_populates="profesor")
    cobros_admin    = relationship("Cobro",        back_populates="admin",  foreign_keys="Cobro.admin_id")


class TipoClase(Base):
    __tablename__ = "tipos_clase"

    id        = Column(Integer, primary_key=True)
    nombre    = Column(String(100), nullable=False)
    categoria = Column(
        Enum(CategoriaEnum),
        CheckConstraint("categoria IN ('normal','ingles','sesion')"),
        nullable=False,
    )
    activo    = Column(Boolean, default=True)

    duraciones  = relationship("DuracionSesion", back_populates="tipo_clase")
    tarifas     = relationship("Tarifa",          back_populates="tipo_clase")
    asistencias = relationship("Asistencia",      back_populates="tipo_clase")

    @property
    def duracion_horas(self):
        if self.duraciones:
            return self.duraciones[0].duracion_min / 60.0
        return 1.0


class DuracionSesion(Base):
    __tablename__ = "duraciones_sesion"

    id           = Column(Integer, primary_key=True)
    tipo_clase_id = Column(Integer, ForeignKey("tipos_clase.id"))
    duracion_min = Column(Integer, nullable=False)
    descripcion  = Column(String(100))

    tipo_clase = relationship("TipoClase", back_populates="duraciones")


class Alumno(Base):
    __tablename__ = "alumnos"

    id                 = Column(Integer, primary_key=True)
    nombre             = Column(String(100), nullable=False)
    apellidos          = Column(String(150), nullable=False)
    fecha_nacimiento   = Column(Date)
    fecha_inscripcion  = Column(Date, server_default=func.current_date(), nullable=False)
    telefono1          = Column(String(20))
    telefono2          = Column(String(20))
    direccion          = Column(Text)
    email              = Column(String(150))
    activo             = Column(Boolean, default=True)
    created_at         = Column(DateTime, server_default=func.now())

    packs       = relationship("PackAlumno",     back_populates="alumno", cascade="all, delete-orphan")
    asistencias = relationship("Asistencia",    back_populates="alumno")
    cobros      = relationship("Cobro",          back_populates="alumno", foreign_keys="Cobro.alumno_id")
    resumenes   = relationship("ResumenMensual", back_populates="alumno")


class Hermanos(Base):
    __tablename__ = "hermanos"
    __table_args__ = (
        CheckConstraint("alumno_id_1 < alumno_id_2"),
    )

    alumno_id_1 = Column(Integer, ForeignKey("alumnos.id", ondelete="CASCADE"), primary_key=True)
    alumno_id_2 = Column(Integer, ForeignKey("alumnos.id", ondelete="CASCADE"), primary_key=True)


class Tarifa(Base):
    __tablename__ = "tarifas"

    id                 = Column(Integer, primary_key=True)
    nombre             = Column(String(150), nullable=False)
    tipo_clase_id      = Column(Integer, ForeignKey("tipos_clase.id"))
    categoria          = Column(Enum(CategoriaEnum), nullable=False)

    horas_semanales    = Column(Numeric(4, 1))
    num_sesiones       = Column(Integer)
    es_bono_sesion     = Column(Boolean, default=False)
    duracion_sesion_min = Column(Integer)
    duracion_semanas   = Column(Integer, nullable=False, default=4, server_default='4')

    precio_base        = Column(Numeric(8, 2), nullable=False)
    es_tasa_examen     = Column(Boolean, default=False, nullable=False)   # 👈 NUEVO
    activo             = Column(Boolean, default=True)
    created_at         = Column(DateTime, server_default=func.now())

    tipo_clase = relationship("TipoClase", back_populates="tarifas")
    packs       = relationship("PackAlumno", back_populates="tarifa")


class PackAlumno(Base):
    __tablename__ = "packs_alumno"
    __table_args__ = (
        Index(
            "uq_pack_pendiente_alumno_categoria",
            "alumno_id", "categoria_pendiente",
            unique=True,
            postgresql_where="tarifa_id IS NULL",
        ),
    )

    id           = Column(Integer, primary_key=True)
    alumno_id    = Column(Integer, ForeignKey("alumnos.id", ondelete="CASCADE"), nullable=False)
    tarifa_id    = Column(Integer, ForeignKey("tarifas.id"))
    profesor_id  = Column(Integer, ForeignKey("usuarios.id"))
    fecha_inicio = Column(Date, server_default=func.current_date(), nullable=False)
    fecha_fin    = Column(Date)
    activo       = Column(Boolean, default=True)
    notas        = Column(Text)
    created_at   = Column(DateTime, server_default=func.now())

    categoria_pendiente = Column(Enum(CategoriaEnum), nullable=True)

    alumno   = relationship("Alumno",         back_populates="packs")
    tarifa   = relationship("Tarifa",         back_populates="packs")
    profesor = relationship("Usuario",        back_populates="packs_asignados", foreign_keys=[profesor_id])
    resumenes = relationship("ResumenMensual", back_populates="pack")

    @property
    def es_pendiente(self) -> bool:
        return self.tarifa_id is None

    @property
    def categoria_efectiva(self):
        if self.tarifa is not None:
            return self.tarifa.categoria
        return self.categoria_pendiente


class Asistencia(Base):
    __tablename__ = "asistencias"
    __table_args__ = (
        Index("idx_asistencias_alumno_fecha",   "alumno_id", "fecha"),
        Index("idx_asistencias_profesor_fecha", "profesor_id", "fecha"),
    )

    id             = Column(Integer, primary_key=True)
    alumno_id      = Column(Integer, ForeignKey("alumnos.id"))
    pack_alumno_id = Column(Integer, ForeignKey("packs_alumno.id"))
    profesor_id    = Column(Integer, ForeignKey("usuarios.id"))
    tipo_clase_id  = Column(Integer, ForeignKey("tipos_clase.id"))
    fecha          = Column(Date, nullable=False)
    hora_inicio    = Column(Time)
    duracion_min   = Column(Integer, nullable=False)
    es_sesion      = Column(Boolean, default=False)

    sincronizado   = Column(Boolean, default=True)
    uuid_local     = Column(String(36), unique=True)
    created_at     = Column(DateTime, server_default=func.now())

    alumno     = relationship("Alumno",     back_populates="asistencias")
    profesor   = relationship("Usuario",    back_populates="asistencias")
    tipo_clase = relationship("TipoClase",  back_populates="asistencias")


class ResumenMensual(Base):
    __tablename__ = "resumen_mensual"
    __table_args__ = (
        UniqueConstraint("pack_alumno_id", "anio", "mes"),
        Index("idx_resumen_mensual_alumno", "alumno_id", "anio", "mes"),
    )

    id                    = Column(Integer, primary_key=True)
    alumno_id             = Column(Integer, ForeignKey("alumnos.id"))
    pack_alumno_id        = Column(Integer, ForeignKey("packs_alumno.id"))
    anio                  = Column(Integer, nullable=False)
    mes                   = Column(Integer, CheckConstraint("mes BETWEEN 1 AND 12"), nullable=False)
    horas_consumidas      = Column(Numeric(5, 2), default=0)
    sesiones_consumidas   = Column(Integer, default=0)
    semanas_en_mes        = Column(Numeric(4, 2), default=4)
    horas_contratadas     = Column(Numeric(5, 2))
    sesiones_contratadas  = Column(Integer)

    alumno = relationship("Alumno",     back_populates="resumenes")
    pack   = relationship("PackAlumno", back_populates="resumenes")


class Cobro(Base):
    """Cabecera de un cobro (puede incluir múltiples packs y formas de pago)."""
    __tablename__ = "cobros"
    __table_args__ = (
        Index("idx_cobros_alumno", "alumno_id", "fecha"),
    )

    id                       = Column(Integer, primary_key=True)
    alumno_id                = Column(Integer, ForeignKey("alumnos.id"))
    admin_id                 = Column(Integer, ForeignKey("usuarios.id"))
    fecha                    = Column(DateTime, server_default=func.now(), nullable=False)
    fecha_operacion          = Column(Date, nullable=False, server_default=func.current_date())  # 👈 NUEVO
    subtotal                 = Column(Numeric(8, 2), nullable=False)
    descuento_hermano_pct    = Column(Numeric(5, 2), default=0)
    descuento_extra_pct      = Column(Numeric(5, 2), default=0)
    descuento_extra_importe  = Column(Numeric(8, 2), default=0)
    total                    = Column(Numeric(8, 2), nullable=False)
    anulado                  = Column(Boolean, default=False)
    fecha_anulacion          = Column(DateTime)
    admin_anulacion_id       = Column(Integer, ForeignKey("usuarios.id"))
    notas                    = Column(Text)
    notas                    = Column(Text)
    entregado                = Column(Numeric(8, 2), nullable=True)   # 👈 NUEVO
    vuelta                   = Column(Numeric(8, 2), default=0)       # 👈 NUEVO
    conceptos_json           = Column(Text)
    conceptos_json           = Column(Text)   # ← NUEVO: JSON con conceptos libres
    created_at               = Column(DateTime, server_default=func.now())

    # Relaciones
    alumno    = relationship("Alumno",  back_populates="cobros", foreign_keys=[alumno_id])
    admin     = relationship("Usuario", back_populates="cobros_admin", foreign_keys=[admin_id])
    pagos     = relationship("CobroPago",  back_populates="cobro", cascade="all, delete-orphan")
    packs_cobro = relationship("CobroPack", back_populates="cobro", cascade="all, delete-orphan")
    factura   = relationship("Factura",  back_populates="cobro", uselist=False)

    @property
    def conceptos_extra(self) -> list[dict]:
        """Deserializa conceptos_json para que Pydantic lo exponga como lista."""
        if not self.conceptos_json:
            return []
        try:
            return json.loads(self.conceptos_json)
        except Exception:
            return []


class CobroPago(Base):
    __tablename__ = "cobros_pagos"

    id         = Column(Integer, primary_key=True)
    cobro_id   = Column(Integer, ForeignKey("cobros.id", ondelete="CASCADE"), nullable=False)
    forma_pago = Column(Enum(FormaPagoEnum), nullable=False)
    importe    = Column(Numeric(8, 2), nullable=False)

    cobro = relationship("Cobro", back_populates="pagos")


class CobroPack(Base):
    __tablename__ = "cobros_packs"

    id             = Column(Integer, primary_key=True)
    cobro_id       = Column(Integer, ForeignKey("cobros.id", ondelete="CASCADE"), nullable=False)
    pack_alumno_id = Column(Integer, ForeignKey("packs_alumno.id"))
    cantidad       = Column(Integer, nullable=False, default=1)   # 👈 NUEVO
    importe        = Column(Numeric(8, 2), nullable=False)         # 👉 ahora = total línea

    cobro = relationship("Cobro", back_populates="packs_cobro")
    pack_alumno = relationship("PackAlumno")


class Factura(Base):
    __tablename__ = "facturas"

    id               = Column(Integer, primary_key=True)
    cobro_id         = Column(Integer, ForeignKey("cobros.id"), unique=True)
    numero           = Column(String(20), unique=True, nullable=False)
    fecha_emision    = Column(Date, server_default=func.current_date(), nullable=False)
    nombre_fiscal    = Column(String(200))
    nif              = Column(String(20))
    direccion_fiscal = Column(Text)
    email_envio      = Column(String(150))
    total            = Column(Numeric(8, 2), nullable=False)
    lineas_json      = Column(Text)
    created_at       = Column(DateTime, server_default=func.now())

    cobro = relationship("Cobro", back_populates="factura")


class AcademiaConfig(Base):
    __tablename__ = "academia_config"
    __table_args__ = (CheckConstraint("id = 1"),)

    id                      = Column(Integer, primary_key=True, default=1)
    nombre                  = Column(String(200), nullable=False)
    cif                     = Column(String(20))
    direccion               = Column(Text)
    telefono                = Column(String(20))
    email                   = Column(String(150))
    logo_path               = Column(String(300))
    siguiente_num_factura   = Column(Integer, default=1)

    descuento_hermano_porcentaje = Column(Numeric(5, 2), default=10.00, nullable=False)

class Cita(Base):
    __tablename__ = "citas"

    id            = Column(Integer, primary_key=True, index=True)
    fecha         = Column(Date, nullable=False, index=True)
    hora_inicio   = Column(Time, nullable=False)
    hora_fin      = Column(Time, nullable=False)
    alumno_id     = Column(Integer, ForeignKey("alumnos.id", ondelete="SET NULL"), nullable=True)
    alumno_texto  = Column(String(200), nullable=True)
    profesor_id   = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    observaciones = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

    alumno   = relationship("Alumno",  foreign_keys=[alumno_id])
    profesor = relationship("Usuario", foreign_keys=[profesor_id])