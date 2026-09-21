"""
Modelos SQLAlchemy 2.x — Academia Doce Escalones
Refleja exactamente el schema de docs/assets/schema.sql con mejoras integradas
"""
import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime,
    Enum, ForeignKey, Index, Integer, Numeric, String,
    Text, Time, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

# ── Base IMPORTADA DESDE DATABASE (CORRECCIÓN BUG CRÍTICO) ─────────────────────
# Al importar la Base original del sistema, todas las tablas se registran
# correctamente bajo el mismo árbol de metadatos y migraciones.
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
    pin        = Column(String(6), nullable=False)       # PIN hasheado
    rol        = Column(Enum(RolEnum), nullable=False)
    activo     = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relaciones
    packs_asignados = relationship("PackAlumno", back_populates="profesor", foreign_keys="PackAlumno.profesor_id")
    asistencias     = relationship("Asistencia",  back_populates="profesor")
    cobros_admin    = relationship("Cobro",        back_populates="admin",  foreign_keys="Cobro.admin_id")


class TipoClase(Base):
    """Catálogo de tipos de clase: Normal, Inglés, Logopedia, Psicología…"""
    __tablename__ = "tipos_clase"

    id        = Column(Integer, primary_key=True)
    nombre    = Column(String(100), nullable=False)
    categoria = Column(
        Enum(CategoriaEnum),
        CheckConstraint("categoria IN ('normal','ingles','sesion')"),
        nullable=False,
    )
    activo    = Column(Boolean, default=True)

    # Relaciones
    duraciones  = relationship("DuracionSesion", back_populates="tipo_clase")
    tarifas     = relationship("Tarifa",          back_populates="tipo_clase")
    asistencias = relationship("Asistencia",      back_populates="tipo_clase")

    # Campo virtual para informes (horas por clase = duracion_horas)
    @property
    def duracion_horas(self):
        """Devuelve la duración estándar en horas para agregaciones."""
        # Para sesiones, usamos la primera duración registrada
        if self.duraciones:
            return self.duraciones[0].duracion_min / 60.0
        return 1.0  # fallback: 1 hora


class DuracionSesion(Base):
    """Duraciones disponibles para cada tipo de sesión (45 min, 60 min…)."""
    __tablename__ = "duraciones_sesion"

    id           = Column(Integer, primary_key=True)
    tipo_clase_id = Column(Integer, ForeignKey("tipos_clase.id"))
    duracion_min = Column(Integer, nullable=False)
    descripcion  = Column(String(100))

    tipo_clase = relationship("TipoClase", back_populates="duraciones")


class Alumno(Base):
    """Ficha del alumno."""
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

    # Relaciones
    packs       = relationship("PackAlumno",     back_populates="alumno", cascade="all, delete-orphan")
    asistencias = relationship("Asistencia",    back_populates="alumno")
    cobros      = relationship("Cobro",          back_populates="alumno", foreign_keys="Cobro.alumno_id")
    resumenes   = relationship("ResumenMensual", back_populates="alumno")


class Hermanos(Base):
    """Vínculo de hermanos entre dos alumnos (PK compuesta, alumno_id_1 < alumno_id_2)."""
    __tablename__ = "hermanos"
    __table_args__ = (
        CheckConstraint("alumno_id_1 < alumno_id_2"),
    )

    alumno_id_1 = Column(Integer, ForeignKey("alumnos.id", ondelete="CASCADE"), primary_key=True)
    alumno_id_2 = Column(Integer, ForeignKey("alumnos.id", ondelete="CASCADE"), primary_key=True)


class Tarifa(Base):
    """Plantilla de pack reutilizable (Bono 2h/sem, Bono 10 sesiones…)."""
    __tablename__ = "tarifas"

    id                 = Column(Integer, primary_key=True)
    nombre             = Column(String(150), nullable=False)
    tipo_clase_id      = Column(Integer, ForeignKey("tipos_clase.id"))
    categoria          = Column(Enum(CategoriaEnum), nullable=False)

    # Clases normales / inglés
    horas_semanales    = Column(Numeric(4, 1))   # horas × semana

    # Sesiones
    num_sesiones       = Column(Integer)          # nulo si es suelto
    es_bono_sesion     = Column(Boolean, default=False)
    duracion_sesion_min = Column(Integer)         # minutos por sesión

    precio_base        = Column(Numeric(8, 2), nullable=False)
    activo             = Column(Boolean, default=True)
    created_at         = Column(DateTime, server_default=func.now())

    # Relaciones
    tipo_clase = relationship("TipoClase", back_populates="tarifas")
    packs       = relationship("PackAlumno", back_populates="tarifa")


class PackAlumno(Base):
    """
    Pack contratado por un alumno (instancia de Tarifa).

    SISTEMA DE PACKS PENDIENTES (añadido):
    Cuando un alumno empieza a recibir clases ANTES de que se le asigne
    una tarifa/pack real (ej: primera clase de prueba, o aún no ha pagado),
    se crea automáticamente un pack "pendiente": tarifa_id es NULL y
    categoria_pendiente guarda la categoría (normal/ingles/sesion) para
    poder validar más adelante que la tarifa que se le asigne al cobrar
    coincide con las clases que ya ha recibido.

    Mientras tarifa_id es NULL, el pack se trata como "sin cobro" en el
    semáforo (rojo), igual que cualquier otro impago.
    """
    __tablename__ = "packs_alumno"
    __table_args__ = (
        # Evita crear dos packs pendientes de la misma categoría para el
        # mismo alumno (protección ante condición de carrera: dos profesores
        # registrando casi a la vez la primera clase de un alumno nuevo).
        # Solo aplica mientras el pack sigue pendiente (tarifa_id IS NULL);
        # en PostgreSQL esto se expresa como índice único parcial.
        Index(
            "uq_pack_pendiente_alumno_categoria",
            "alumno_id", "categoria_pendiente",
            unique=True,
            postgresql_where="tarifa_id IS NULL",
        ),
    )

    id           = Column(Integer, primary_key=True)
    alumno_id    = Column(Integer, ForeignKey("alumnos.id", ondelete="CASCADE"), nullable=False)
    tarifa_id    = Column(Integer, ForeignKey("tarifas.id"))   # NULL = pack pendiente, sin tarifa asignada todavía
    profesor_id  = Column(Integer, ForeignKey("usuarios.id"))
    fecha_inicio = Column(Date, server_default=func.current_date(), nullable=False)
    fecha_fin    = Column(Date)        # NULL = sin caducidad
    activo       = Column(Boolean, default=True)
    notas        = Column(Text)
    created_at   = Column(DateTime, server_default=func.now())

    # NUEVO: categoría fijada en el momento de crear el pack como "pendiente".
    # Solo tiene sentido mientras tarifa_id es NULL; una vez se asigna la
    # tarifa real, la categoría "oficial" pasa a vivir en tarifa.categoria,
    # pero dejamos este campo igualmente para conservar el historial de
    # con qué categoría se creó originalmente el pack.
    categoria_pendiente = Column(Enum(CategoriaEnum), nullable=True)

    # Relaciones
    alumno   = relationship("Alumno",         back_populates="packs")
    tarifa   = relationship("Tarifa",         back_populates="packs")
    profesor = relationship("Usuario",        back_populates="packs_asignados", foreign_keys=[profesor_id])
    resumenes = relationship("ResumenMensual", back_populates="pack")

    @property
    def es_pendiente(self) -> bool:
        """True si este pack todavía no tiene tarifa real asignada (sin cobrar)."""
        return self.tarifa_id is None

    @property
    def categoria_efectiva(self):
        """
        Devuelve la categoría real del pack, ya tenga tarifa asignada o no.
        Si tiene tarifa, prevalece tarifa.categoria (fuente de verdad una vez
        cobrado). Si no, usa categoria_pendiente.
        """
        if self.tarifa is not None:
            return self.tarifa.categoria
        return self.categoria_pendiente


class Asistencia(Base):
    """Registro de una asistencia individual."""
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

    # Control offline
    sincronizado   = Column(Boolean, default=True)
    uuid_local     = Column(String(36), unique=True)
    created_at     = Column(DateTime, server_default=func.now())

    # Relaciones
    alumno     = relationship("Alumno",     back_populates="asistencias")
    profesor   = relationship("Usuario",    back_populates="asistencias")
    tipo_clase = relationship("TipoClase",  back_populates="asistencias")


class ResumenMensual(Base):
    """Cache de horas/sesiones consumidas por pack y mes. Se recalcula en cada asistencia."""
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
    semanas_en_mes        = Column(Integer, default=4)     # 4 o 5
    horas_contratadas     = Column(Numeric(5, 2))          # calculado al inicio del mes
    sesiones_contratadas  = Column(Integer)

    # Relaciones
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
    subtotal                 = Column(Numeric(8, 2), nullable=False)
    descuento_hermano_pct    = Column(Numeric(5, 2), default=0)
    descuento_extra_pct      = Column(Numeric(5, 2), default=0)
    descuento_extra_importe  = Column(Numeric(8, 2), default=0)
    total                    = Column(Numeric(8, 2), nullable=False)
    anulado                  = Column(Boolean, default=False)
    fecha_anulacion          = Column(DateTime)
    admin_anulacion_id       = Column(Integer, ForeignKey("usuarios.id"))
    notas                    = Column(Text)
    created_at               = Column(DateTime, server_default=func.now())

    # Relaciones
    alumno    = relationship("Alumno",  back_populates="cobros", foreign_keys=[alumno_id])
    admin     = relationship("Usuario", back_populates="cobros_admin", foreign_keys=[admin_id])
    pagos     = relationship("CobroPago",  back_populates="cobro", cascade="all, delete-orphan")
    packs_cobro = relationship("CobroPack", back_populates="cobro", cascade="all, delete-orphan")
    factura   = relationship("Factura",  back_populates="cobro", uselist=False)


class CobroPago(Base):
    """Detalle de formas de pago para un cobro (mixto: efectivo + bizum…)."""
    __tablename__ = "cobros_pagos"

    id         = Column(Integer, primary_key=True)
    cobro_id   = Column(Integer, ForeignKey("cobros.id", ondelete="CASCADE"), nullable=False)
    forma_pago = Column(Enum(FormaPagoEnum), nullable=False)
    importe    = Column(Numeric(8, 2), nullable=False)

    cobro = relationship("Cobro", back_populates="pagos")


class CobroPack(Base):
    """Qué packs se incluyeron en cada cobro y por qué importe."""
    __tablename__ = "cobros_packs"

    id             = Column(Integer, primary_key=True)
    cobro_id       = Column(Integer, ForeignKey("cobros.id", ondelete="CASCADE"), nullable=False)
    pack_alumno_id = Column(Integer, ForeignKey("packs_alumno.id"))
    importe        = Column(Numeric(8, 2), nullable=False)

    cobro = relationship("Cobro", back_populates="packs_cobro")
    pack_alumno = relationship("PackAlumno")

class Factura(Base):
    """Factura formal generada a partir de un cobro."""
    __tablename__ = "facturas"

    id               = Column(Integer, primary_key=True)
    cobro_id         = Column(Integer, ForeignKey("cobros.id"), unique=True)
    numero           = Column(String(20), unique=True, nullable=False)   # FAC-2026-001
    fecha_emision    = Column(Date, server_default=func.current_date(), nullable=False)
    nombre_fiscal    = Column(String(200))
    nif              = Column(String(20))
    direccion_fiscal = Column(Text)
    email_envio      = Column(String(150))
    total            = Column(Numeric(8, 2), nullable=False)
    # NUEVA COLUMNA: snapshot inmutable de las líneas (descripción+importe)
    # tal como estaban en el momento de EMITIR la factura. No se recalcula
    # nunca a partir de packs/tarifas actuales — si una tarifa cambia de
    # nombre o precio después, esta factura ya emitida no debe cambiar.
    # Se guarda como texto JSON: '[{"descripcion": "...", "importe": 30.0}, ...]'
    lineas_json      = Column(Text)
    created_at       = Column(DateTime, server_default=func.now())

    cobro = relationship("Cobro", back_populates="factura")


class AcademiaConfig(Base):
    """Datos fiscales de la academia (siempre una sola fila, id=1)."""
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
    
    # NUEVA COLUMNA: Configuración global del descuento por hermanos
    descuento_hermano_porcentaje = Column(Numeric(5, 2), default=10.00, nullable=False)