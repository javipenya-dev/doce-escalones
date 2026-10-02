from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import date, datetime, time
from app.models.models import RolEnum, CategoriaEnum, FormaPagoEnum


# ── AUTH ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    pin: str
    email: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: "UsuarioOut"


# ── USUARIOS ───────────────────────────────────────────────

class UsuarioOut(BaseModel):
    id: int
    nombre: str
    apellidos: str
    email: Optional[str]
    telefono: Optional[str] = None
    color: Optional[str] = None
    rol: RolEnum
    activo: bool

    model_config = {"from_attributes": True}


class UsuarioCreate(BaseModel):
    nombre: str
    apellidos: str
    email: Optional[str] = None
    telefono: Optional[str] = None
    color: Optional[str] = '#F26419'
    pin: str
    rol: RolEnum

    @field_validator("pin")
    @classmethod
    def pin_valido(cls, v):
        if not v.isdigit() or len(v) not in (4, 5, 6):
            raise ValueError("El PIN debe tener entre 4 y 6 dígitos numéricos")
        return v

    @field_validator("color")
    @classmethod
    def color_valido(cls, v):
        if v is None:
            return v
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("El color debe ser un hex tipo #RRGGBB")
        return v


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    apellidos: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    color: Optional[str] = None
    pin: Optional[str] = None
    rol: Optional[RolEnum] = None   # ← NUEVO
    activo: Optional[bool] = None

    @field_validator("color")
    @classmethod
    def color_valido(cls, v):
        if v is None:
            return v
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("El color debe ser un hex tipo #RRGGBB")
        return v


# ── ALUMNOS ────────────────────────────────────────────────

class AlumnoCreate(BaseModel):
    nombre: str
    apellidos: str
    fecha_nacimiento: Optional[date] = None
    fecha_inscripcion: Optional[date] = None
    telefono1: Optional[str] = None
    telefono2: Optional[str] = None
    direccion: Optional[str] = None
    email: Optional[str] = None


class AlumnoUpdate(BaseModel):
    nombre: Optional[str] = None
    apellidos: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    fecha_inscripcion: Optional[date] = None
    telefono1: Optional[str] = None
    telefono2: Optional[str] = None
    direccion: Optional[str] = None
    email: Optional[str] = None
    activo: Optional[bool] = None


class AlumnoOut(BaseModel):
    id: int
    nombre: str
    apellidos: str
    fecha_nacimiento: Optional[date]
    fecha_inscripcion: Optional[date]
    telefono1: Optional[str]
    telefono2: Optional[str]
    direccion: Optional[str]
    email: Optional[str]
    activo: bool
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AlumnoListItem(BaseModel):
    id: int
    nombre: str
    apellidos: str
    telefono1: Optional[str]
    email: Optional[str]
    activo: bool
    # Campos semáforo (calculados en el endpoint /alumnos)
    estado_semaforo: Optional[str] = None
    importe_debido: Optional[float] = None
    horas_exceso_residual: Optional[float] = None

    model_config = {"from_attributes": True}


# ── TARIFAS ────────────────────────────────────────────────

class TarifaCreate(BaseModel):
    nombre: str
    categoria: CategoriaEnum
    horas_semanales: Optional[float] = None
    num_sesiones: Optional[int] = None
    es_bono_sesion: bool = False
    duracion_sesion_min: Optional[int] = None
    precio_base: float

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v):
        if not v.strip():
            raise ValueError("El nombre no puede estar vacío")
        return v.strip()

    @field_validator("precio_base")
    @classmethod
    def precio_positivo(cls, v):
        if v <= 0:
            raise ValueError("El precio debe ser mayor que 0")
        return v


class TarifaUpdate(BaseModel):
    nombre: Optional[str] = None
    categoria: Optional[CategoriaEnum] = None
    horas_semanales: Optional[float] = None
    num_sesiones: Optional[int] = None
    es_bono_sesion: Optional[bool] = None
    duracion_sesion_min: Optional[int] = None
    precio_base: Optional[float] = None
    activo: Optional[bool] = None


class TarifaOut(BaseModel):
    id: int
    nombre: str
    categoria: CategoriaEnum
    horas_semanales: Optional[float]
    num_sesiones: Optional[int]
    es_bono_sesion: bool
    duracion_sesion_min: Optional[int]
    precio_base: float
    activo: bool

    model_config = {"from_attributes": True}


# ── PACKS ALUMNO ───────────────────────────────────────────

class PackAlumnoCreate(BaseModel):
    alumno_id: int
    tarifa_id: int
    profesor_id: int
    fecha_inicio: Optional[date] = None
    notas: Optional[str] = None


class PackAlumnoOut(BaseModel):
    id: int
    alumno_id: int
    tarifa_id: Optional[int] = None
    profesor_id: Optional[int] = None
    fecha_inicio: Optional[date]
    fecha_fin: Optional[date]
    activo: bool
    notas: Optional[str]
    tarifa: Optional[TarifaOut] = None

    model_config = {"from_attributes": True}


class PackActivoSimple(BaseModel):
    id: int
    categoria: str
    tipo_clase_id: int
    tipo_clase_nombre: str

    model_config = {"from_attributes": True}


class PackAlumnoFichaOut(BaseModel):
    id: int
    tarifa_id: Optional[int] = None
    profesor_id: Optional[int] = None
    profesor_nombre: Optional[str] = None
    fecha_inicio: Optional[date]
    fecha_fin: Optional[date]
    activo: bool
    notas: Optional[str]
    tarifa: Optional[TarifaOut] = None
    pagado_este_mes: bool = False
    estado_semaforo: str = "rojo"
    importe_debido: float = 0.0

    model_config = {"from_attributes": True}


class AlumnoDetalleOut(AlumnoOut):
    packs: list[PackAlumnoFichaOut] = []


# ── ASISTENCIAS ────────────────────────────────────────────

class AsistenciaCreate(BaseModel):
    alumno_id: int
    pack_alumno_id: int
    tipo_clase_id: int
    fecha: date
    hora_inicio: Optional[time] = None
    duracion_min: int
    es_sesion: bool = False
    uuid_local: Optional[str] = None
    profesor_id: Optional[int] = None


class AsistenciaSyncBatch(BaseModel):
    asistencias: list[AsistenciaCreate]


class AsistenciaOut(BaseModel):
    id: int
    alumno_id: int
    pack_alumno_id: int
    profesor_id: int
    tipo_clase_id: int
    fecha: date
    hora_inicio: Optional[time]
    duracion_min: int
    es_sesion: bool
    sincronizado: bool
    uuid_local: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ResumenMensualOut(BaseModel):
    anio: int
    mes: int
    horas_consumidas: float
    sesiones_consumidas: int
    semanas_en_mes: int
    horas_contratadas: Optional[float]
    sesiones_contratadas: Optional[int]
    estado: str
    horas_extra: int
    margen_horas: float = 0.0
    tope_horas: float = 0.0

    model_config = {"from_attributes": True}


class AsistenciaRegistradaResponse(BaseModel):
    asistencia: AsistenciaOut
    resumen_actualizado: ResumenMensualOut


class SyncResponse(BaseModel):
    procesadas: int
    duplicadas: int
    errores: list[str]


class AsistenciaUpdate(BaseModel):
    hora_inicio: Optional[time] = None
    duracion_min: Optional[int] = None
    profesor_id: Optional[int] = None
    tipo_clase_id: Optional[int] = None
    fecha: Optional[date] = None

    @field_validator("duracion_min")
    @classmethod
    def duracion_valida(cls, v):
        if v is not None and (v <= 0 or v > 240):
            raise ValueError("La duración debe estar entre 1 y 240 minutos")
        return v


# ── COBROS ─────────────────────────────────────────────────

class FormaPagoItem(BaseModel):
    forma: FormaPagoEnum
    importe: float


class ConceptoExtra(BaseModel):
    """Línea libre de un cobro: diferencia de pack, matrícula, material, etc."""
    descripcion: str
    importe: float
    horas_cubiertas: Optional[float] = None  # ← NUEVO: horas de exceso que este concepto cubre

    @field_validator("importe")
    @classmethod
    def importe_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El importe no puede ser negativo")
        return v

    @field_validator("descripcion")
    @classmethod
    def descripcion_no_vacia(cls, v):
        if not v.strip():
            raise ValueError("La descripción no puede estar vacía")
        return v.strip()


class CobroCreate(BaseModel):
    alumno_id: int
    packs_ids: list[int]
    descuento_hermano: bool = False
    descuento_extra_pct: float = 0.0
    descuento_extra_importe: float = 0.0
    formas_pago: list[FormaPagoItem]
    notas: Optional[str] = None
    conceptos_extra: list[ConceptoExtra] = []

    @field_validator("formas_pago")
    @classmethod
    def formas_pago_validas(cls, v):
        if not v:
            raise ValueError("Debe indicarse al menos una forma de pago")
        return v


class CobroPagoOut(BaseModel):
    forma_pago: FormaPagoEnum
    importe: float

    model_config = {"from_attributes": True}


class PackAlumnoSimpleOut(BaseModel):
    id: int
    tarifa_id: Optional[int] = None
    tarifa: Optional[TarifaOut] = None

    model_config = {"from_attributes": True}


class CobroPackOut(BaseModel):
    id: int
    pack_alumno_id: Optional[int] = None
    importe: float
    pack_alumno: Optional[PackAlumnoSimpleOut] = None

    model_config = {"from_attributes": True}


class CobroOut(BaseModel):
    id: int
    alumno_id: int
    admin_id: int
    fecha: datetime
    subtotal: float
    descuento_hermano_pct: float
    descuento_extra_pct: float
    descuento_extra_importe: float
    total: float
    anulado: bool
    notas: Optional[str]
    alumno: Optional[AlumnoListItem] = None
    pagos: list[CobroPagoOut] = []
    packs_cobro: list[CobroPackOut] = []
    conceptos_extra: list[ConceptoExtra] = []   # ← NUEVO

    model_config = {"from_attributes": True}


# ── DASHBOARD ──────────────────────────────────────────────

class AlumnoDashboard(BaseModel):
    id: int
    nombre: str
    apellidos: str
    estado: str
    horas_mes: float
    sesiones_mes: int
    horas_contratadas: Optional[float]
    sesiones_contratadas: Optional[int]
    importe_debido: Optional[float] = None
    margen_horas: Optional[float] = None
    tope_horas: Optional[float] = None
    tarifa_sugerida_id: Optional[int] = None
    tarifa_sugerida_nombre: Optional[str] = None
    tarifa_sugerida_precio: Optional[float] = None
    tarifa_sugerida_horas: Optional[float] = None
    tarifa_actual_precio: Optional[float] = None   # ← NUEVO: precio del pack actual
    horas_exceso_residual: Optional[float] = None   # ← NUEVO: exceso pendiente (descontando lo ya cobrado)
class ClaseEnCurso(BaseModel):
    profesor_id: int
    profesor_nombre: str
    tipo_clase: str
    hora_inicio: Optional[str]
    alumnos: list[AlumnoDashboard]


class DashboardAhora(BaseModel):
    clases_en_curso: list[ClaseEnCurso]
    total_alumnos_ahora: int


class StatsGenerales(BaseModel):
    alumnos_activos: int
    pagos_pendientes: int
    importe_pendiente: float
    asistencias_hoy: int
    recaudado_mes: float


TokenResponse.model_rebuild()


# ── HISTÓRICO ALUMNO ───────────────────────────────────────

class CobroResumenOut(BaseModel):
    id: int
    fecha: datetime
    total: float
    anulado: bool
    notas: Optional[str]

    model_config = {"from_attributes": True}


class HistoricoMesOut(BaseModel):
    anio: int
    mes: int
    mes_label: str
    horas_consumidas: float
    sesiones_consumidas: int
    horas_contratadas: Optional[float]
    sesiones_contratadas: Optional[int]
    semanas_en_mes: int
    estado: str
    cobros: list[CobroResumenOut]
    recaudado: float


# ── INFORMES ───────────────────────────────────────────────

class InformeProfesorRow(BaseModel):
    profesor_id: int
    nombre: str
    horas_normal: float
    horas_ingles: float
    sesiones: int
    total_clases: int

class ProductividadProfesorRow(BaseModel):
    profesor_id: int
    nombre: str
    horas_totales: float
    sesiones_totales: int
    importe_generado: float
    porcentaje: float  # % sobre el total del mes

class InformeAlumnoRow(BaseModel):
    alumno_id: int
    nombre: str
    horas: float
    sesiones: int
    importe_pagado: float
    num_cobros: int


class EvolucionMesOut(BaseModel):
    mes: int
    mes_label: str
    recaudado: float
    num_cobros: int


class InformeEvolucionOut(BaseModel):
    anio: int
    meses: list[EvolucionMesOut]
    total_anio: float


class InformeMensualOut(BaseModel):
    anio: int
    mes: int
    mes_label: str
    recaudado: float
    num_cobros: int
    alumnos_activos: int
    horas_total: float
    sesiones_total: int
    por_profesor: list[InformeProfesorRow]
    formas_pago: dict = {}
    cobros_mixtos: int = 0
    total_mixtos: float = 0.0
    recaudado_mes_anterior: float = 0.0
    recaudado_anio_anterior: float = 0.0
    total_anulado: float = 0.0
    num_anulados: int = 0
    top_alumnos: list[InformeAlumnoRow] = []
    por_productividad: list[ProductividadProfesorRow] = []  # ← NUEVO


# ── CONFIGURACIÓN DE LA ACADEMIA ──────────────────────────

class AcademiaConfigOut(BaseModel):
    id: int
    nombre: str
    cif: Optional[str]
    direccion: Optional[str]
    telefono: Optional[str]
    email: Optional[str]
    logo_path: Optional[str]
    siguiente_num_factura: int

    model_config = {"from_attributes": True}


class AcademiaConfigUpdate(BaseModel):
    nombre: Optional[str] = None
    cif: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None


# ── DEUDAS ACUMULADAS ──────────────────────────────────────

class DeudaAcumuladaOut(BaseModel):
    pack_id: int
    alumno_id: int
    alumno_nombre: str
    categoria_pendiente: str
    primera_asistencia: Optional[date]
    ultima_asistencia: Optional[date]
    total_horas: float
    total_sesiones: int
    num_asistencias: int
    meses_afectados: int