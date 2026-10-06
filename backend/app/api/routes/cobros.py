import json

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.db.database import get_db
from app.core.deps import get_current_user, get_current_admin
from app.models.models import (
    Usuario, Cobro, CobroPago, CobroPack,
    PackAlumno, Tarifa, Alumno, AcademiaConfig, Factura
)
from app.schemas.schemas import CobroCreate, CobroOut
from app.services import cobros_service
from app.services.ticket_service import generar_ticket_bytes, generar_ticket_texto, DatosTicket
from app.services.factura_service import generar_factura_pdf
from app.api.routes.websocket import manager
from app.services.impresora_service import imprimir_varias_copias, ImpresoraError


router = APIRouter()

TZ_ESPANA = ZoneInfo("Europe/Madrid")


# ── SCHEMAS ──────────────────────────────────────────────────────────────────

class FacturaRequest(BaseModel):
    nombre_fiscal:    str
    nif:              str
    direccion_fiscal: Optional[str] = None
    email_envio:      Optional[str] = None


class CobroConTicketOut(CobroOut):
    """CobroOut + flags del auto-print (solo se usa en POST /cobros)."""
    ticket_impreso: Optional[bool] = None
    ticket_error:   Optional[str]  = None


class CobroListItemOut(BaseModel):
    """
    Versión reducida de CobroOut para el listado de historial.
    Solo incluye lo necesario para pintar la tabla — sin objetos anidados.
    """
    id: int
    fecha: datetime
    alumno_id: int
    alumno_nombre: str
    total: float
    anulado: bool
    descuento_hermano_pct: float = 0.0
    descuento_extra_pct: float = 0.0
    descuento_extra_importe: float = 0.0
    packs_nombres: list[str] = []
    pagos: list[dict] = []   # [{'forma': 'efectivo', 'importe': 50.0}]


# ── HELPERS ──────────────────────────────────────────────────────────────────

async def _get_cobro_completo(db: AsyncSession, cobro_id: int) -> Cobro:
    result = await db.execute(
        select(Cobro)
        .options(
            selectinload(Cobro.pagos),
            selectinload(Cobro.packs_cobro)
                .selectinload(CobroPack.pack_alumno)
                .selectinload(PackAlumno.tarifa),
            selectinload(Cobro.alumno),
        )
        .where(Cobro.id == cobro_id)
    )
    return result.scalar_one_or_none()


async def _get_config(db: AsyncSession) -> AcademiaConfig:
    result = await db.execute(select(AcademiaConfig).where(AcademiaConfig.id == 1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = AcademiaConfig(
            id=1, nombre='12 Escalones', cif='', direccion='Jerez de la Frontera',
            telefono='', email='', siguiente_num_factura=1
        )
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


def _fecha_local_espana(fecha_utc: datetime) -> datetime:
    if fecha_utc.tzinfo is None:
        fecha_utc = fecha_utc.replace(tzinfo=timezone.utc)
    return fecha_utc.astimezone(TZ_ESPANA)


def _construir_datos_ticket(cobro: Cobro, cfg: AcademiaConfig) -> DatosTicket:
    lineas = []
    for cp in cobro.packs_cobro:
        if cp.pack_alumno and cp.pack_alumno.tarifa:
            lineas.append({
                'descripcion': cp.pack_alumno.tarifa.nombre[:28],
                'importe':     float(cp.importe),
            })
    # Conceptos extra (al final)
    if cobro.conceptos_json:
        try:
            for c in json.loads(cobro.conceptos_json):
                lineas.append({
                    'descripcion': str(c.get('descripcion', 'Concepto'))[:28],
                    'importe':     float(c.get('importe', 0)),
                })
        except Exception:
            pass
    return DatosTicket(
        nombre_academia         = cfg.nombre,
        cif                     = cfg.cif or '',
        direccion               = cfg.direccion or '',
        telefono                = cfg.telefono or '',
        cobro_id                = cobro.id,
        fecha                   = _fecha_local_espana(cobro.fecha) if cobro.fecha else datetime.now(TZ_ESPANA),
        alumno_nombre           = f"{cobro.alumno.nombre} {cobro.alumno.apellidos}" if cobro.alumno else '',
        lineas                  = lineas,
        subtotal                = float(cobro.subtotal),
        descuento_hermano_pct   = float(cobro.descuento_hermano_pct or 0),
        descuento_extra_pct     = float(cobro.descuento_extra_pct or 0),
        descuento_extra_importe = float(cobro.descuento_extra_importe or 0),
        total                   = float(cobro.total),
        formas_pago             = [{'forma': p.forma_pago, 'importe': float(p.importe)} for p in cobro.pagos],
        notas                   = cobro.notas,
        anulado                 = cobro.anulado,
        logo_path               = cfg.logo_path,
    )


async def _enviar_ticket_a_impresora(
    db: AsyncSession, cobro: Cobro, copias: int = 2
) -> tuple[bool, Optional[str]]:
    try:
        cfg = await _get_config(db)
        datos = _construir_datos_ticket(cobro, cfg)
        ticket_bytes = generar_ticket_bytes(datos)
        imprimir_varias_copias(ticket_bytes, copias=copias)
        return True, None
    except ImpresoraError as e:
        return False, str(e)
    except Exception as e:
        return False, f"Error inesperado: {e}"


# ── ENDPOINTS ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CobroListItemOut])
async def listar_cobros(
    alumno_id: Optional[int] = Query(None),
    limit:     int           = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Listado ligero de cobros para la tabla de historial.

    Hace 3 queries específicas (cobros + alumno, packs, pagos) en lugar de
    cargar objetos completos con selectinload anidado. Reduce mucho el peso
    cuando hay muchos cobros.
    """
    # 1. Cobros + nombre del alumno (un solo join)
    stmt = (
        select(Cobro, Alumno.nombre, Alumno.apellidos)
        .join(Alumno, Cobro.alumno_id == Alumno.id)
        .order_by(Cobro.fecha.desc())
        .limit(limit)
    )
    if alumno_id:
        stmt = stmt.where(Cobro.alumno_id == alumno_id)

    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    cobro_ids = [c.id for c, _, _ in rows]

    # 2. Nombres de las tarifas cobradas (por cobro)
    packs_result = await db.execute(
        select(CobroPack.cobro_id, Tarifa.nombre)
        .join(PackAlumno, CobroPack.pack_alumno_id == PackAlumno.id)
        .outerjoin(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
        .where(CobroPack.cobro_id.in_(cobro_ids))
    )
    packs_por_cobro: dict[int, list[str]] = {}
    for cobro_id, tarifa_nombre in packs_result.all():
        if tarifa_nombre:
            packs_por_cobro.setdefault(cobro_id, []).append(tarifa_nombre)

    # 3. Pagos (forma + importe)
    pagos_result = await db.execute(
        select(CobroPago.cobro_id, CobroPago.forma_pago, CobroPago.importe)
        .where(CobroPago.cobro_id.in_(cobro_ids))
    )
    pagos_por_cobro: dict[int, list] = {}
    for cobro_id, forma, importe in pagos_result.all():
        forma_str = forma.value if hasattr(forma, 'value') else str(forma)
        pagos_por_cobro.setdefault(cobro_id, []).append({
            'forma': forma_str,
            'importe': float(importe),
        })

    # 4. Armar respuesta
    return [
        CobroListItemOut(
            id=c.id,
            fecha=c.fecha,
            alumno_id=c.alumno_id,
            alumno_nombre=f"{nombre} {apellidos}",
            total=float(c.total),
            anulado=bool(c.anulado),
            descuento_hermano_pct=float(c.descuento_hermano_pct or 0),
            descuento_extra_pct=float(c.descuento_extra_pct or 0),
            descuento_extra_importe=float(c.descuento_extra_importe or 0),
            packs_nombres=packs_por_cobro.get(c.id, []),
            pagos=pagos_por_cobro.get(c.id, []),
        )
        for c, nombre, apellidos in rows
    ]


# ── FACTURAS — LISTADO ─────────────────────────────────────────

@router.get("/facturas", tags=["Facturas"])
async def listar_facturas(
    alumno_id: Optional[int] = Query(None),
    anio: Optional[int] = Query(None),
    mes:  Optional[int] = Query(None, ge=1, le=12),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    stmt = (
        select(Factura, Cobro, Alumno)
        .join(Cobro,  Factura.cobro_id  == Cobro.id)
        .join(Alumno, Cobro.alumno_id   == Alumno.id)
        .order_by(Factura.created_at.desc())
        .limit(limit)
    )
    if alumno_id:
        stmt = stmt.where(Cobro.alumno_id == alumno_id)
    if anio:
        stmt = stmt.where(func.extract("year", Factura.fecha_emision) == anio)
    if mes:
        stmt = stmt.where(func.extract("month", Factura.fecha_emision) == mes)

    rows = (await db.execute(stmt)).all()

    return [
        {
            "id":              f.id,
            "numero":          f.numero,
            "fecha_emision":   str(f.fecha_emision),
            "nombre_fiscal":   f.nombre_fiscal,
            "nif":             f.nif,
            "total":           float(f.total),
            "cobro_id":        f.cobro_id,
            "cobro_anulado":   c.anulado,
            "alumno_id":       a.id,
            "alumno_nombre":   f"{a.nombre} {a.apellidos}",
        }
        for f, c, a in rows
    ]


# ── RUTAS DINÁMICAS ──────────────────────────────────────────────────────────

@router.get("/{cobro_id}", response_model=CobroOut)
async def obtener_cobro(
    cobro_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    cobro = await _get_cobro_completo(db, cobro_id)
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    return CobroOut.model_validate(cobro)


@router.post("", response_model=CobroConTicketOut, status_code=status.HTTP_201_CREATED)
async def registrar_cobro(
    data: CobroCreate,
    auto_imprimir: bool = Query(True, description="Imprimir ticket al registrar el cobro"),
    copias:        int  = Query(2, ge=1, le=5, description="Copias si auto_imprimir=True"),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_admin),
):
    try:
        cobro = await cobros_service.crear_cobro(db, data, admin_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    alumno_result = await db.execute(select(Alumno).where(Alumno.id == data.alumno_id))
    alumno = alumno_result.scalar_one_or_none()
    if alumno:
        await manager.broadcast({
            "tipo":          "cobro_realizado",
            "alumno_id":     data.alumno_id,
            "alumno_nombre": f"{alumno.nombre} {alumno.apellidos}",
            "total":         float(cobro.total),
            "estado_nuevo":  "verde",
        })

    cobro_completo = await _get_cobro_completo(db, cobro.id)

    ticket_impreso = False
    ticket_error: Optional[str] = None
    if auto_imprimir and cobro_completo:
        ticket_impreso, ticket_error = await _enviar_ticket_a_impresora(
            db, cobro_completo, copias=copias
        )

    out = CobroConTicketOut.model_validate(cobro_completo).model_dump()
    out["ticket_impreso"] = ticket_impreso
    out["ticket_error"]   = ticket_error
    return out


@router.post("/{cobro_id}/anular")
async def anular_cobro(
    cobro_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_admin),
):
    try:
        cobro = await cobros_service.anular_cobro(db, cobro_id, admin_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await manager.broadcast({
        "tipo":         "cobro_anulado",
        "alumno_id":    cobro.alumno_id,
        "cobro_id":     cobro.id,
        "estado_nuevo": "rojo",
    })

    return {"mensaje": "Ticket anulado correctamente", "cobro_id": cobro.id}


@router.get("/{cobro_id}/ticket-escpos")
async def ticket_escpos(
    cobro_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    cobro = await _get_cobro_completo(db, cobro_id)
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    cfg = await _get_config(db)
    datos = _construir_datos_ticket(cobro, cfg)
    ticket_bytes = generar_ticket_bytes(datos)
    return Response(
        content=ticket_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="ticket-{cobro_id}.bin"'},
    )


@router.get("/{cobro_id}/ticket-texto")
async def ticket_texto(
    cobro_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    cobro = await _get_cobro_completo(db, cobro_id)
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    cfg = await _get_config(db)
    datos = _construir_datos_ticket(cobro, cfg)
    return Response(content=generar_ticket_texto(datos), media_type="text/plain; charset=utf-8")


@router.post("/{cobro_id}/factura")
async def generar_factura(
    cobro_id: int,
    data: FacturaRequest,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    try:
        factura = await cobros_service.generar_factura(
            db,
            cobro_id         = cobro_id,
            nombre_fiscal    = data.nombre_fiscal,
            nif              = data.nif,
            direccion_fiscal = data.direccion_fiscal,
            email_envio      = data.email_envio,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"factura_id": factura.id, "numero": factura.numero}


@router.put("/facturas/{factura_id}")
async def editar_factura(
    factura_id: int,
    data: FacturaRequest,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    try:
        factura = await cobros_service.editar_datos_factura(
            db,
            factura_id       = factura_id,
            nombre_fiscal    = data.nombre_fiscal,
            nif              = data.nif,
            direccion_fiscal = data.direccion_fiscal,
            email_envio      = data.email_envio,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"factura_id": factura.id, "numero": factura.numero, "nombre_fiscal": factura.nombre_fiscal, "nif": factura.nif}


@router.get("/{cobro_id}/factura-pdf")
async def descargar_factura_pdf(
    cobro_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    cobro = await _get_cobro_completo(db, cobro_id)
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    factura_result = await db.execute(select(Factura).where(Factura.cobro_id == cobro_id))
    factura = factura_result.scalar_one_or_none()
    if not factura:
        raise HTTPException(status_code=404, detail="Este cobro no tiene factura. Genera una primero.")

    cfg = await _get_config(db)

    if factura.lineas_json:
        lineas = json.loads(factura.lineas_json)
    else:
        lineas = [
            {
                'descripcion': cp.pack_alumno.tarifa.nombre if cp.pack_alumno and cp.pack_alumno.tarifa else 'Servicio',
                'importe':     float(cp.importe),
            }
            for cp in cobro.packs_cobro
        ]

    pdf_bytes = generar_factura_pdf(
        nombre_academia          = cfg.nombre,
        cif_academia             = cfg.cif or '',
        direccion_academia       = cfg.direccion or '',
        telefono_academia        = cfg.telefono or '',
        email_academia           = cfg.email or '',
        numero_factura           = factura.numero,
        fecha_emision            = _fecha_local_espana(factura.created_at) if factura.created_at else datetime.now(TZ_ESPANA),
        nombre_fiscal            = factura.nombre_fiscal or '',
        nif_cliente              = factura.nif or '',
        direccion_fiscal         = factura.direccion_fiscal,
        cobro_id                 = cobro.id,
        alumno_nombre            = f"{cobro.alumno.nombre} {cobro.alumno.apellidos}" if cobro.alumno else '',
        lineas                   = lineas,
        subtotal                 = float(cobro.subtotal),
        descuento_hermano_pct    = float(cobro.descuento_hermano_pct or 0),
        descuento_extra_pct      = float(cobro.descuento_extra_pct or 0),
        descuento_extra_importe  = float(cobro.descuento_extra_importe or 0),
        total                    = float(cobro.total),
        formas_pago              = [{'forma': p.forma_pago, 'importe': float(p.importe)} for p in cobro.pagos],
        notas                    = cobro.notas,
        logo_path                = cfg.logo_path,
        cobro_anulado            = bool(cobro.anulado),
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="factura-{factura.numero}.pdf"'},
    )


@router.post("/{cobro_id}/imprimir")
async def imprimir_ticket(
    cobro_id: int,
    copias: int = Query(2, ge=1, le=5, description="Número de copias (1-5)"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    cobro = await _get_cobro_completo(db, cobro_id)
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    ok, err = await _enviar_ticket_a_impresora(db, cobro, copias=copias)
    if not ok:
        raise HTTPException(status_code=503, detail=f"No se pudo imprimir: {err}")

    return {
        "status":  "ok",
        "copias":  copias,
        "mensaje": f"{copias} copia(s) enviada(s) a la impresora",
    }