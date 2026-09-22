"""
Generador de facturas en PDF.
Usa ReportLab — librería estándar Python para generar PDFs.
"""
import os
from io import BytesIO
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, black, white, lightgrey, Color
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    HRFlowable, Image as RLImage, KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


# Colores de 12 Escalones
NARANJA    = HexColor('#F26419')
NEGRO      = HexColor('#111111')
GRIS       = HexColor('#666666')
GRIS_CLARO = HexColor('#F9F9F9')
ROJO_SELLO = HexColor('#C81E1E')
ROSA_SELLO = HexColor('#FFE8E8')


def _crear_logo(logo_path: Optional[str], ancho_max: float = 4.5 * cm) -> Optional[RLImage]:
    """Carga el logo desde disco. Si no existe o falla, devuelve None."""
    if not logo_path or not os.path.exists(logo_path):
        return None
    try:
        img = RLImage(logo_path)
        ratio = img.imageHeight / float(img.imageWidth)
        img.drawWidth = ancho_max
        img.drawHeight = ancho_max * ratio
        img.hAlign = 'LEFT'
        return img
    except Exception:
        return None


def _dibujar_sello_anulado(canvas, doc):
    """
    Callback que ReportLab invoca AL CERRAR cada página (onPageEnd).
    Se ejecuta DESPUÉS del contenido → el sello queda encima de todo.
    Colores sólidos (sin alpha) para máxima compatibilidad.
    """
    canvas.saveState()

    ancho_pagina, alto_pagina = A4
    cx, cy = ancho_pagina / 2, alto_pagina / 2

    canvas.translate(cx, cy)
    canvas.rotate(30)

    canvas.setFillColor(ROSA_SELLO)
    canvas.setStrokeColor(ROJO_SELLO)

    ancho_sello = 11.5 * cm
    alto_sello  = 2.6  * cm

    # Rectángulo relleno
    canvas.setLineWidth(3)
    canvas.rect(-ancho_sello / 2, -alto_sello / 2, ancho_sello, alto_sello,
                fill=1, stroke=1)

    # Rectángulo interior (solo borde)
    canvas.setLineWidth(1)
    canvas.rect(-ancho_sello / 2 + 4, -alto_sello / 2 + 4,
                ancho_sello - 8, alto_sello - 8, fill=0, stroke=1)

    # Texto principal
    canvas.setFillColor(ROJO_SELLO)
    canvas.setFont('Helvetica-Bold', 44)
    canvas.drawCentredString(0, -6, 'COBRO ANULADO')

    # Subtexto
    canvas.setFont('Helvetica-Bold', 11)
    canvas.drawCentredString(0, -alto_sello / 2 - 18, 'Documento sin validez fiscal')

    canvas.restoreState()


def generar_factura_pdf(
    # Academia
    nombre_academia:   str,
    cif_academia:      str,
    direccion_academia: str,
    telefono_academia:  str,
    email_academia:     str,

    # Factura
    numero_factura:    str,
    fecha_emision:     datetime,

    # Cliente
    nombre_fiscal:     str,
    nif_cliente:       str,
    direccion_fiscal:  Optional[str],

    # Cobro
    cobro_id:          int,
    alumno_nombre:     str,
    lineas:            list[dict],
    subtotal:          float,
    descuento_hermano_pct:   float = 0.0,
    descuento_extra_pct:     float = 0.0,
    descuento_extra_importe: float = 0.0,
    total:             float = 0.0,
    formas_pago:       list[dict] = None,
    notas:             Optional[str] = None,
    logo_path:         Optional[str] = None,
    cobro_anulado:     bool = False,
) -> bytes:
    """Genera la factura en PDF y devuelve los bytes."""

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.8*cm, bottomMargin=1.8*cm,
        # onPageEnd se ejecuta al CERRAR cada página → sello por encima del contenido
        onPageEnd = _dibujar_sello_anulado if cobro_anulado else None,
    )

    styles = getSampleStyleSheet()
    story  = []

    def estilo(nombre, **kwargs):
        return ParagraphStyle(nombre, parent=styles['Normal'], **kwargs)

    s_normal       = estilo('normal',    fontSize=9,  textColor=NEGRO, leading=12)
    s_negrita      = estilo('negrita',   fontSize=9,  fontName='Helvetica-Bold', textColor=NEGRO)
    s_small        = estilo('small',     fontSize=8,  textColor=GRIS, leading=11)
    s_small_neg    = estilo('small_neg', fontSize=8,  fontName='Helvetica-Bold', textColor=GRIS)
    s_right        = estilo('right',     fontSize=9,  alignment=TA_RIGHT)
    s_right_bold   = estilo('right_bold', fontSize=9, fontName='Helvetica-Bold', alignment=TA_RIGHT)
    s_total_label  = estilo('total_l',   fontSize=12, fontName='Helvetica-Bold', textColor=NEGRO, alignment=TA_LEFT)
    s_total_valor  = estilo('total_v',   fontSize=14, fontName='Helvetica-Bold', textColor=NARANJA, alignment=TA_RIGHT)
    s_legal        = estilo('legal',     fontSize=7.5, textColor=GRIS, leading=10, alignment=TA_LEFT)

    # ── CABECERA: logo izquierda, "FACTURA" derecha ─────────────
    logo = _crear_logo(logo_path)

    if logo is not None:
        col_izq = [[logo]]
    else:
        col_izq = [[Paragraph(nombre_academia, estilo('nomb_g', fontSize=16, fontName='Helvetica-Bold', textColor=NARANJA))]]

    col_der = [
        [Paragraph('FACTURA', estilo('fac', fontSize=26, fontName='Helvetica-Bold', textColor=NARANJA, alignment=TA_RIGHT, leading=28))],
        [Paragraph(numero_factura, estilo('num', fontSize=13, fontName='Helvetica-Bold', textColor=NEGRO, alignment=TA_RIGHT, spaceBefore=2))],
        [Paragraph(f"Fecha: {fecha_emision.strftime('%d/%m/%Y')}", estilo('fecha', fontSize=9, textColor=GRIS, alignment=TA_RIGHT, spaceBefore=2))],
        [Paragraph(f"Ref. cobro: #{str(cobro_id).zfill(5)}", estilo('ref', fontSize=8, textColor=GRIS, alignment=TA_RIGHT))],
    ]

    tabla_izq = Table(col_izq, colWidths=[9*cm])
    tabla_izq.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))

    tabla_der = Table(col_der, colWidths=[8*cm])
    tabla_der.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))

    cabecera = Table([[tabla_izq, tabla_der]], colWidths=[9*cm, 8*cm])
    cabecera.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(cabecera)

    # ── DATOS FISCALES ACADEMIA (debajo del logo) ──────────────
    story.append(Spacer(1, 6*mm))
    datos_academia = [
        [Paragraph(f"<b>{nombre_academia}</b>", s_negrita)],
        [Paragraph(cif_academia, s_small)],
        [Paragraph(direccion_academia, s_small)],
        [Paragraph(f"Tel: {telefono_academia} · {email_academia}", s_small)],
    ]
    tabla_datos_ac = Table(datos_academia, colWidths=[17*cm])
    tabla_datos_ac.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
    ]))
    story.append(tabla_datos_ac)

    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width='100%', thickness=2, color=NARANJA))
    story.append(Spacer(1, 5*mm))

    # ── AVISO DE ANULACIÓN (texto visible en la parte superior) ──
    if cobro_anulado:
        aviso = Paragraph(
            '<b>⚠ DOCUMENTO ANULADO</b> — Este cobro fue anulado posteriormente. '
            'La factura se conserva por trazabilidad fiscal, pero carece de validez como justificante de pago.',
            estilo('aviso_anulado', fontSize=9, fontName='Helvetica-Bold',
                   textColor=ROJO_SELLO, leading=12, alignment=TA_CENTER,
                   backColor=ROSA_SELLO, borderPadding=6, borderWidth=1,
                   borderColor=ROJO_SELLO, borderRadius=3),
        )
        story.append(aviso)
        story.append(Spacer(1, 5*mm))

    # ── DATOS CLIENTE + ALUMNO ──────────────────────────────────
    tabla_cliente_data = [[
        Table([
            [Paragraph('FACTURAR A', s_small_neg)],
            [Paragraph(nombre_fiscal, s_negrita)],
            [Paragraph(f"NIF/CIF: {nif_cliente}", s_normal)],
            [Paragraph(direccion_fiscal or '', s_small)],
        ], colWidths=[8.5*cm]),
        Table([
            [Paragraph('ALUMNO', s_small_neg)],
            [Paragraph(alumno_nombre, s_negrita)],
        ], colWidths=[8.5*cm]),
    ]]
    tabla_cliente = Table(tabla_cliente_data, colWidths=[9*cm, 8*cm])
    tabla_cliente.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), GRIS_CLARO),
        ('BACKGROUND', (1,0), (1,-1), GRIS_CLARO),
        ('BOX',  (0,0), (0,-1), 0.5, lightgrey),
        ('BOX',  (1,0), (1,-1), 0.5, lightgrey),
        ('LEFTPADDING',  (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING',   (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(tabla_cliente)
    story.append(Spacer(1, 6*mm))

    # ── TABLA DE CONCEPTOS ──────────────────────────────────────
    conceptos_header = [
        Paragraph('Descripción', estilo('th', fontSize=9, fontName='Helvetica-Bold', textColor=white)),
        Paragraph('Importe', estilo('thi', fontSize=9, fontName='Helvetica-Bold', textColor=white, alignment=TA_RIGHT)),
    ]
    conceptos_rows = [conceptos_header]
    for l in lineas:
        conceptos_rows.append([
            Paragraph(l.get('descripcion', ''), s_normal),
            Paragraph(f"{l.get('importe', 0):.2f} EUR", s_right),
        ])

    tabla_conceptos = Table(conceptos_rows, colWidths=[13*cm, 4*cm])
    tabla_conceptos.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (-1,0), NARANJA),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, GRIS_CLARO]),
        ('GRID',         (0,0), (-1,-1), 0.3, lightgrey),
        ('LINEBELOW',    (0,0), (-1,0), 1, NARANJA),
        ('TOPPADDING',    (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING',   (0,0), (-1,-1), 8),
        ('RIGHTPADDING',  (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(tabla_conceptos)
    story.append(Spacer(1, 4*mm))

    # ── TOTALES (Subtotal / Dto / B.Imponible / IVA 0% / TOTAL) ─
    totales_rows = []
    totales_rows.append([Paragraph('Subtotal', s_normal), Paragraph(f"{subtotal:.2f} EUR", s_right)])

    descuento_total = 0.0
    if descuento_hermano_pct > 0:
        dto = subtotal * descuento_hermano_pct / 100
        descuento_total += dto
        totales_rows.append([
            Paragraph(f"Descuento hermanos ({descuento_hermano_pct:.0f}%)", s_normal),
            Paragraph(f"-{dto:.2f} EUR", s_right),
        ])
    if descuento_extra_pct > 0:
        base = subtotal * (1 - descuento_hermano_pct / 100)
        dto  = base * descuento_extra_pct / 100
        descuento_total += dto
        totales_rows.append([
            Paragraph(f"Descuento adicional ({descuento_extra_pct:.0f}%)", s_normal),
            Paragraph(f"-{dto:.2f} EUR", s_right),
        ])
    elif descuento_extra_importe > 0:
        descuento_total += descuento_extra_importe
        totales_rows.append([
            Paragraph('Descuento adicional', s_normal),
            Paragraph(f"-{descuento_extra_importe:.2f} EUR", s_right),
        ])

    b_imponible = subtotal - descuento_total
    totales_rows.append([Paragraph('B. Imponible', s_normal), Paragraph(f"{b_imponible:.2f} EUR", s_right)])
    totales_rows.append([Paragraph('IVA 0%', s_normal), Paragraph(f"0.00 EUR", s_right)])
    totales_rows.append([
        Paragraph('TOTAL', s_total_label),
        Paragraph(f"{total:.2f} EUR", s_total_valor),
    ])

    tabla_totales = Table(totales_rows, colWidths=[13*cm, 4*cm])
    tabla_totales.setStyle(TableStyle([
        ('ALIGN',        (1,0), (1,-1), 'RIGHT'),
        ('LINEABOVE',    (0,-1), (-1,-1), 1.5, NARANJA),
        ('BACKGROUND',   (0,-1), (-1,-1), GRIS_CLARO),
        ('TOPPADDING',    (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING',   (0,0), (-1,-1), 8),
        ('RIGHTPADDING',  (0,0), (-1,-1), 8),
    ]))
    story.append(tabla_totales)
    story.append(Spacer(1, 5*mm))

    # ── FORMAS DE PAGO ──────────────────────────────────────────
    if formas_pago:
        LABELS = {'efectivo': 'Efectivo', 'tarjeta': 'Tarjeta', 'bizum': 'Bizum', 'transferencia': 'Transferencia'}
        fp_text = ' | '.join(
            f"{LABELS.get(fp['forma'], fp['forma'])}: {fp['importe']:.2f}€"
            for fp in formas_pago
        )
        story.append(Paragraph(f"<b>Forma de pago:</b> {fp_text}", s_normal))
        story.append(Spacer(1, 3*mm))

    # ── NOTAS ───────────────────────────────────────────────────
    if notas:
        story.append(Paragraph(f"<b>Observaciones:</b> {notas}", s_small))
        story.append(Spacer(1, 3*mm))

    # ── PIE LEGAL (exención IVA) ────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=lightgrey))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Esta factura está exenta de IVA por tratarse de una actividad educativa. "
        "Según resolución 37/1991, de 28 de diciembre, en base al artículo 20, Uno, 14º, "
        "de la Ley del Impuesto sobre Valor Añadido.",
        s_legal,
    ))

    # ── PIE CONTACTO ────────────────────────────────────────────
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(
        f"{telefono_academia} · {email_academia}",
        estilo('pie1', fontSize=8, textColor=GRIS, alignment=TA_CENTER),
    ))
    story.append(Paragraph(
        f"{nombre_academia} · {direccion_academia}",
        estilo('pie2', fontSize=7.5, textColor=GRIS, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buffer.getvalue()