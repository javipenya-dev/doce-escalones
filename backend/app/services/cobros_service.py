import json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.models.models import (
    Cobro, CobroPago, CobroPack, PackAlumno, Tarifa,
    Factura, AcademiaConfig, Hermanos, ResumenMensual, Alumno
)
from app.schemas.schemas import CobroCreate, CobroOut


def _redondear(valor: float) -> Decimal:
    return Decimal(str(valor)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


async def crear_cobro(
    db: AsyncSession,
    data: CobroCreate,
    admin_id: int,
) -> Cobro:
    """
    Registra un cobro completo:
    - Calcula subtotal desde los packs seleccionados
    - Aplica descuento hermanos (10%) si se indica
    - Aplica descuento extra por % o importe
    - Guarda formas de pago (mixto posible)
    - Vincula los packs pagados
    """

    # Obtener packs y calcular subtotal
    packs = []
    subtotal = Decimal('0.00')
    for pack_id in data.packs_ids:
        result = await db.execute(
            select(PackAlumno, Tarifa)
            .join(Tarifa, PackAlumno.tarifa_id == Tarifa.id)
            .where(
                PackAlumno.id == pack_id,
                PackAlumno.alumno_id == data.alumno_id,
                PackAlumno.activo == True,
            )
        )
        row = result.first()
        if row:
            pack, tarifa = row
            packs.append((pack, tarifa))
            subtotal += _redondear(float(tarifa.precio_base))

    if not packs:
        raise ValueError("No se encontraron packs válidos para este alumno")

    # Descuento hermanos
    dto_hermano_pct = Decimal('10.00') if data.descuento_hermano else Decimal('0.00')
    dto_hermano_importe = (subtotal * dto_hermano_pct / 100).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    # Descuento extra
    base_tras_hermano = subtotal - dto_hermano_importe
    dto_extra_pct     = _redondear(data.descuento_extra_pct or 0)
    dto_extra_importe = _redondear(data.descuento_extra_importe or 0)

    if dto_extra_pct > 0:
        dto_extra_importe = (base_tras_hermano * dto_extra_pct / 100).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    total = max(Decimal('0.00'), subtotal - dto_hermano_importe - dto_extra_importe)

    # Crear cabecera del cobro
    # IMPORTANTE: fecha se guarda en UTC naive para que _fecha_local_espana()
    # (en cobros.py) la pueda convertir correctamente a Europe/Madrid.
    # Antes no se pasaba fecha= y usaba el default del modelo (hora local),
    # lo que provocaba que el ticket saliera +2h en verano.
    cobro = Cobro(
        alumno_id               = data.alumno_id,
        admin_id                = admin_id,
        fecha                   = datetime.now(timezone.utc).replace(tzinfo=None),
        subtotal                = float(subtotal),
        descuento_hermano_pct   = float(dto_hermano_pct),
        descuento_extra_pct     = float(dto_extra_pct),
        descuento_extra_importe = float(dto_extra_importe),
        total                   = float(total),
        notas                   = data.notas,
    )
    db.add(cobro)
    await db.flush()

    # Formas de pago
    for fp in data.formas_pago:
        db.add(CobroPago(
            cobro_id   = cobro.id,
            forma_pago = fp.forma,
            importe    = fp.importe,
        ))

    # Packs vinculados al cobro
    for pack, tarifa in packs:
        db.add(CobroPack(
            cobro_id       = cobro.id,
            pack_alumno_id = pack.id,
            importe        = float(_redondear(float(tarifa.precio_base))),
        ))

    await db.flush()
    await db.refresh(cobro)
    return cobro


async def anular_cobro(
    db: AsyncSession,
    cobro_id: int,
    admin_id: int,
) -> Cobro:
    """Anula un ticket. No elimina el registro — queda como anulado para auditoría."""
    result = await db.execute(select(Cobro).where(Cobro.id == cobro_id))
    cobro = result.scalar_one_or_none()
    if not cobro:
        raise ValueError("Cobro no encontrado")
    if cobro.anulado:
        raise ValueError("Este cobro ya está anulado")

    cobro.anulado           = True
    cobro.fecha_anulacion   = datetime.now(timezone.utc).replace(tzinfo=None)
    cobro.admin_anulacion_id = admin_id
    await db.flush()
    await db.refresh(cobro)
    return cobro


async def generar_factura(
    db: AsyncSession,
    cobro_id: int,
    nombre_fiscal: str,
    nif: str,
    direccion_fiscal: Optional[str],
    email_envio: Optional[str],
) -> Factura:
    """
    Genera una factura con numeración correlativa.

    IMPORTANTE (fix inmutabilidad): las líneas (descripción + importe) se
    calculan y se congelan AQUÍ, en el momento de emitir la factura, y se
    guardan en factura.lineas_json. El PDF se genera siempre a partir de
    ese snapshot, nunca recalculando desde packs/tarifas actuales — así
    una factura ya emitida no cambia si luego renombras una tarifa o le
    cambias el precio.
    """

    # Comprobar que el cobro existe y no está anulado.
    # Cargamos también packs_cobro -> pack_alumno -> tarifa para poder
    # construir el snapshot de líneas sin queries extra.
    cobro_result = await db.execute(
        select(Cobro)
        .options(
            selectinload(Cobro.packs_cobro)
            .selectinload(CobroPack.pack_alumno)
            .selectinload(PackAlumno.tarifa)
        )
        .where(Cobro.id == cobro_id)
    )
    cobro = cobro_result.scalar_one_or_none()
    if not cobro:
        raise ValueError("Cobro no encontrado")
    if cobro.anulado:
        raise ValueError("No se puede facturar un cobro anulado")

    # Comprobar que no tiene ya factura
    factura_existente = await db.execute(
        select(Factura).where(Factura.cobro_id == cobro_id)
    )
    if factura_existente.scalar_one_or_none():
        raise ValueError("Este cobro ya tiene una factura generada")

    # Obtener y actualizar contador de facturas
    config_result = await db.execute(select(AcademiaConfig).where(AcademiaConfig.id == 1))
    config = config_result.scalar_one_or_none()

    anio = datetime.now(timezone.utc).year
    num  = config.siguiente_num_factura if config else 1
    numero_factura = f"FAC-{anio}-{str(num).zfill(3)}"

    if config:
        config.siguiente_num_factura = num + 1
        await db.flush()

    # Snapshot inmutable de las líneas, congelado ahora mismo
    lineas = [
        {
            'descripcion': cp.pack_alumno.tarifa.nombre if cp.pack_alumno and cp.pack_alumno.tarifa else 'Servicio',
            'importe':     float(cp.importe),
        }
        for cp in cobro.packs_cobro
    ]

    factura = Factura(
        cobro_id         = cobro_id,
        numero           = numero_factura,
        nombre_fiscal    = nombre_fiscal,
        nif              = nif,
        direccion_fiscal = direccion_fiscal,
        email_envio      = email_envio,
        total            = cobro.total,
        lineas_json      = json.dumps(lineas, ensure_ascii=False),
    )
    db.add(factura)
    await db.flush()
    await db.refresh(factura)
    return factura


async def obtener_cobros_alumno(
    db: AsyncSession,
    alumno_id: int,
    limit: int = 20,
) -> list[Cobro]:
    result = await db.execute(
        select(Cobro)
        .where(Cobro.alumno_id == alumno_id)
        .order_by(Cobro.fecha.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def editar_datos_factura(
    db: AsyncSession,
    factura_id: int,
    nombre_fiscal: str,
    nif: str,
    direccion_fiscal: Optional[str] = None,
    email_envio: Optional[str] = None,
) -> Factura:
    """
    Corrige SOLO los datos del destinatario de una factura ya emitida
    (nombre fiscal, NIF, dirección, email). Nunca toca numero, total ni
    lineas_json — esos quedan fijos desde la emisión para no romper el
    rastro de auditoría (número de factura con contenido cambiante).
    Caso de uso típico: alumno menor de edad, se emitió a su nombre por
    error y hay que reasignarla a un padre/tutor.
    """
    result = await db.execute(select(Factura).where(Factura.id == factura_id))
    factura = result.scalar_one_or_none()
    if not factura:
        raise ValueError("Factura no encontrada")

    factura.nombre_fiscal    = nombre_fiscal
    factura.nif              = nif
    factura.direccion_fiscal = direccion_fiscal
    factura.email_envio      = email_envio
    await db.flush()
    await db.refresh(factura)
    return factura