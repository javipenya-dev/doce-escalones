from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import date, datetime, time
from app.models.models import RolEnum, CategoriaEnum, FormaPagoEnum


# ── AUTH ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    pin: str
    email: Optional[str] = None  # Opcional: si hay varios usuarios con mismo PIN

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
    rol: RolEnum
    activo: bool

    model_config = {"from_attributes": True}


class UsuarioCreate(BaseModel):
    nombre: str
    apellidos: str
    email: Optional[str] = None
    pin: str
    rol: RolEnum

    @field_validator("pin")
    @classmethod
    def pin_valido(cls, v):
        if not v.isdigit() or len(v) not in (4, 5, 6):
            raise ValueError("El PIN debe tener entre 4 y 6 dígitos numéricos")
        return v


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    apellidos: Optional[str] = None
    email: Optional[str] = None
    pin: Optional[str] = None
    activo: Optional[bool] = None


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
    """Versión resumida para listados."""
    id: int
    nombre: str
    apellidos: str
    telefono1: Optional[str]
    email: Optional[str]
    activo: bool

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
    """
    Versión reducida de un pack, expuesta a PROFESORES (no solo admins).
    No incluye tarifa, precio, ni datos administrativos — solo lo
    imprescindible para que la app móvil pueda registrar una asistencia:
    el pack_alumno_id a consumir y el tipo_clase_id correspondiente.
    """
    id: int                   # pack_alumno_id
    categoria: str             # normal | ingles | sesion
    tipo_clase_id: int
    tipo_clase_nombre: str     # ej. "Inglés A1", "Logopedia"

    model_config = {"from_attributes": True}


class PackAlumnoFichaOut(BaseModel):
    """Pack con nombre del profesor, para la ficha del alumno."""
    id: int
    tarifa_id: Optional[int] = None
    profesor_id: Optional[int] = None
    profesor_nombre: Optional[str] = None
    fecha_inicio: Optional[date]
    fecha_fin: Optional[date]
    activo: bool
    notas: Optional[str]
    tarifa: Optional[TarifaOut] = None
    # NUEVOS: estado de pago de este pack en el mes actual.
    # Cruzamos con cobros_packs para saber si este pack ya fue cobrado.
    pagado_este_mes: bool = False
    estado_semaforo: str = "rojo"       # verde | rojo
    importe_debido: float = 0.0         # 0 si ya está pagado o no hay tarifa

    model_config = {"from_attributes": True}


class AlumnoDetalleOut(AlumnoOut):
    """Ficha completa del alumno, con sus packs activos."""
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
    uuid_local: Optional[str] = None   # Para sync offline


class AsistenciaSyncBatch(BaseModel):
    """Batch de asistencias para sincronización offline."""
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
    """Estado del alumno en un mes concreto."""
    anio: int
    mes: int
    horas_consumidas: float
    sesiones_consumidas: int
    semanas_en_mes: int
    horas_contratadas: Optional[float]
    sesiones_contratadas: Optional[int]
    estado: str        # verde / rojo / amarillo / naranja
    horas_extra: int   # > 0 si semanas_en_mes == 5

    model_config = {"from_attributes": True}


class AsistenciaRegistradaResponse(BaseModel):
    """Respuesta al registrar una asistencia."""
    asistencia: AsistenciaOut
    resumen_actualizado: ResumenMensualOut


class SyncResponse(BaseModel):
    """Respuesta al hacer sync batch."""
    procesadas: int
    duplicadas: int
    errores: list[str]


class AsistenciaUpdate(BaseModel):
    hora_inicio: Optional[time] = None
    duracion_min: Optional[int] = None

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


class CobroCreate(BaseModel):
    alumno_id: int
    packs_ids: list[int]
    descuento_hermano: bool = False
    descuento_extra_pct: float = 0.0
    descuento_extra_importe: float = 0.0
    formas_pago: list[FormaPagoItem]
    notas: Optional[str] = None

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
    """Pack resumido para anidar en cobros (evita exponer todo el modelo)."""
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
    # NUEVOS — para que la ficha del cobro en el frontend pueda pintar
    # alumno completo, formas de pago y conceptos cobrados.
    alumno: Optional[AlumnoListItem] = None
    pagos: list[CobroPagoOut] = []
    packs_cobro: list[CobroPackOut] = []

    model_config = {"from_attributes": True}

# ── DASHBOARD ──────────────────────────────────────────────

class AlumnoDashboard(BaseModel):
    id: int
    nombre: str
    apellidos: str
    estado: str          # verde / rojo / amarillo / naranja
    horas_mes: float
    sesiones_mes: int
    horas_contratadas: Optional[float]
    sesiones_contratadas: Optional[int]
    importe_debido: Optional[float] = None


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


# Referencia circular para TokenResponse
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
    """Un mes en el histórico de un alumno."""
    anio: int
    mes: int
    mes_label: str          # "Jun 2025"
    horas_consumidas: float
    sesiones_consumidas: int
    horas_contratadas: Optional[float]
    sesiones_contratadas: Optional[int]
    semanas_en_mes: int
    estado: str             # verde / rojo / amarillo / naranja
    cobros: list[CobroResumenOut]
    recaudado: float        # suma de cobros no anulados ese mes


# ── INFORMES ───────────────────────────────────────────────

class InformeProfesorRow(BaseModel):
    profesor_id: int
    nombre: str
    horas_normal: float
    horas_ingles: float
    sesiones: int
    total_clases: int


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


# ── AÑADIR a backend/app/schemas/schemas.py, junto a los schemas de Dashboard ──

class DeudaAcumuladaOut(BaseModel):
    """
    Una fila del panel histórico de deudas — un pack pendiente con
    actividad real, sin importar de qué mes(es) sea esa actividad.
    """
    pack_id: int
    alumno_id: int
    alumno_nombre: str
    categoria_pendiente: str          # normal | ingles | sesion
    primera_asistencia: Optional[date]
    ultima_asistencia: Optional[date]
    total_horas: float                # 0 si es categoría "sesion"
    total_sesiones: int               # 0 si no es categoría "sesion"
    num_asistencias: int
    meses_afectados: int              # >1 si la deuda se arrastra de varios meses

