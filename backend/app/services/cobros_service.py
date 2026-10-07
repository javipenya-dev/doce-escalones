import json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timezone  # 👈 'date' añadido
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
    - Suma conceptos extra (líneas libres)
    - Guarda formas de pago (mixto posible)
    - Vincula los packs pagados

    Permite cobros SIN pack cuando solo se cobran conceptos libres
    (ej: diferencia de horas tras subir de tarifa, matrícula, material…).
    """

        # Obtener packs y calcular subtotal (con cantidad)
    packs = []   # [(pack, tarifa, cantidad, line_total)]
    subtotal = Decimal('0.00')
    for item in (data.packs or []):
        pack_id = item.id if hasattr(item, "id") else item
        cantidad = int(getattr(item, "cantidad", 1) or 1)
        if cantidad < 1:
            cantidad = 1

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
            precio_unit = _redondear(float(tarifa.precio_base))
            line_total = precio_unit * cantidad
            packs.append((pack, tarifa, cantidad, line_total))
            subtotal += line_total

    if not packs and not (data.conceptos_extra or []):
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

    # ── Conceptos extra (líneas libres) ──
    conceptos_extra = data.conceptos_extra or []
    conceptos_total = Decimal('0.00')
    if conceptos_extra:
        for c in conceptos_extra:
            cantidad = int(getattr(c, "cantidad", 1) or 1)
            if cantidad < 1:
                cantidad = 1
            conceptos_total += Decimal(str(c.importe)) * cantidad
    conceptos_total = conceptos_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    conceptos_json = None
    if conceptos_extra:
        conceptos_serializados = []
        for c in conceptos_extra:
            cantidad = int(getattr(c, "cantidad", 1) or 1)
            if cantidad < 1:
                cantidad = 1
            item = {
                "descripcion": c.descripcion,
                "importe": float(c.importe),
                "cantidad": cantidad,
            }
            hc = getattr(c, "horas_cubiertas", None)
            if hc is not None and float(hc) > 0:
                item["horas_cubiertas"] = float(hc)
            if getattr(c, "es_tasa_examen", False):
                item["es_tasa_examen"] = True
            conceptos_serializados.append(item)
        conceptos_json = json.dumps(conceptos_serializados, ensure_ascii=False)

    total_con_conceptos = (total + conceptos_total).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    # Fecha de operación: si el usuario la indica, se usa; si no, hoy.
    # Esto permite contabilizar en octubre un pago hecho en noviembre.
    fecha_operacion = data.fecha_operacion or date.today()   # 👈 NUEVO

    # Crear cabecera del cobro
    cobro = Cobro(
        alumno_id               = data.alumno_id,
        admin_id                = admin_id,
        fecha                   = datetime.now(timezone.utc).replace(tzinfo=None),
        fecha_operacion         = fecha_operacion,   # 👈 NUEVO
        subtotal                = float(subtotal),
        descuento_hermano_pct   = float(dto_hermano_pct),
        descuento_extra_pct     = float(dto_extra_pct),
        descuento_extra_importe = float(dto_extra_importe),
        total                   = float(total_con_conceptos),
        notas                   = data.notas,
        conceptos_json          = conceptos_json,
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

    # Packs vinculados al cobro (con cantidad)
    for pack, tarifa, cantidad, line_total in packs:
        db.add(CobroPack(
            cobro_id       = cobro.id,
            pack_alumno_id = pack.id,
            cantidad       = cantidad,
            importe        = float(line_total),
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
    """

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

    factura_existente = await db.execute(
        select(Factura).where(Factura.cobro_id == cobro_id)
    )
    if factura_existente.scalar_one_or_none():
        raise ValueError("Este cobro ya tiene una factura generada")

    config_result = await db.execute(select(AcademiaConfig).where(AcademiaConfig.id == 1))
    config = config_result.scalar_one_or_none()

    anio = datetime.now(timezone.utc).year
    num  = config.siguiente_num_factura if config else 1
    numero_factura = f"FAC-{anio}-{str(num).zfill(3)}"

    if config:
        config.siguiente_num_factura = num + 1
        await db.flush()

    # Snapshot inmutable de las líneas, congelado ahora mismo
    lineas = []
    for cp in cobro.packs_cobro:
        base = cp.pack_alumno.tarifa.nombre if (cp.pack_alumno and cp.pack_alumno.tarifa) else 'Servicio'
        cant = int(getattr(cp, "cantidad", 1) or 1)
        desc = f"{base} x{cant}" if cant > 1 else base
        lineas.append({
            'descripcion': desc,
            'importe':     float(cp.importe),
        })

    # Añadir conceptos extra a la factura (con cantidad)
    if cobro.conceptos_json:
        try:
            for c in json.loads(cobro.conceptos_json):
                cantidad = int(c.get('cantidad', 1) or 1)
                importe_unit = float(c.get('importe', 0))
                desc = str(c.get('descripcion', 'Concepto'))
                if cantidad > 1:
                    desc = f"{desc} x{cantidad}"
                lineas.append({
                    'descripcion': desc,
                    'importe':     importe_unit * cantidad,
                })
        except Exception:
            pass

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
    """Corrige SOLO los datos del destinatario de una factura ya emitida."""
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