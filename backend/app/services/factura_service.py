"""
Generador de facturas en PDF.
Usa ReportLab — librería estándar Python para generar PDFs.
"""

from io import BytesIO
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, black, white, lightgrey
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


# Colores de 12 Escalones
NARANJA   = HexColor('#F26419')
NEGRO     = HexColor('#111111')
GRIS      = HexColor('#666666')
GRIS_CLARO = HexColor('#F9F9F9')


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
    lineas:            list[dict],   # [{"descripcion": "...", "importe": 75.00}]
    subtotal:          float,
    descuento_hermano_pct:   float = 0.0,
    descuento_extra_pct:     float = 0.0,
    descuento_extra_importe: float = 0.0,
    total:             float = 0.0,
    formas_pago:       list[dict] = None,
    notas:             Optional[str] = None,
) -> bytes:
    """Genera la factura en PDF y devuelve los bytes."""

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    story  = []

    def estilo(nombre, **kwargs):
        return ParagraphStyle(nombre, parent=styles['Normal'], **kwargs)

    s_titulo       = estilo('titulo',    fontSize=22, fontName='Helvetica-Bold', textColor=NEGRO, spaceAfter=4)
    s_subtitulo    = estilo('subtitulo', fontSize=10, textColor=GRIS, spaceAfter=2)
    s_normal       = estilo('normal',    fontSize=9,  textColor=NEGRO)
    s_negrita      = estilo('negrita',   fontSize=9,  fontName='Helvetica-Bold', textColor=NEGRO)
    s_naranja      = estilo('naranja',   fontSize=9,  fontName='Helvetica-Bold', textColor=NARANJA)
    s_total_label  = estilo('total_l',   fontSize=12, fontName='Helvetica-Bold', textColor=NEGRO, alignment=TA_LEFT)
    s_total_valor  = estilo('total_v',   fontSize=14, fontName='Helvetica-Bold', textColor=NARANJA, alignment=TA_RIGHT)
    s_small        = estilo('small',     fontSize=8,  textColor=GRIS)
    s_right        = estilo('right',     fontSize=9,  alignment=TA_RIGHT)

    # ── CABECERA ─────────────────────────────────────────
    cabecera_data = [[
        # Columna izquierda: datos academia
        Table([
            [Paragraph(nombre_academia, s_titulo)],
            [Paragraph(cif_academia, s_subtitulo)],
            [Paragraph(direccion_academia, s_small)],
            [Paragraph(f"Tel: {telefono_academia}", s_small)],
            [Paragraph(email_academia, s_small)],
        ], colWidths=[9*cm]),

        # Columna derecha: número y fecha factura
        Table([
            [Paragraph('FACTURA', estilo('fac', fontSize=28, fontName='Helvetica-Bold', textColor=NARANJA, alignment=TA_RIGHT))],
            [Paragraph(numero_factura, estilo('num', fontSize=14, fontName='Helvetica-Bold', textColor=NEGRO, alignment=TA_RIGHT))],
            [Paragraph(f"Fecha: {fecha_emision.strftime('%d/%m/%Y')}", estilo('fecha', fontSize=9, textColor=GRIS, alignment=TA_RIGHT))],
            [Paragraph(f"Ref. cobro: #{str(cobro_id).zfill(5)}", estilo('ref', fontSize=8, textColor=GRIS, alignment=TA_RIGHT))],
        ], colWidths=[8*cm]),
    ]]

    tabla_cabecera = Table(cabecera_data, colWidths=[9*cm, 8*cm])
    tabla_cabecera.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(tabla_cabecera)
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width='100%', thickness=2, color=NARANJA))
    story.append(Spacer(1, 0.4*cm))

    # ── DATOS CLIENTE ────────────────────────────────────
    datos_cliente = [[
        Table([
            [Paragraph('FACTURAR A', estilo('ft', fontSize=7, fontName='Helvetica-Bold', textColor=GRIS))],
            [Paragraph(nombre_fiscal, s_negrita)],
            [Paragraph(f"NIF/CIF: {nif_cliente}", s_normal)],
            [Paragraph(direccion_fiscal or '', s_small)],
        ], colWidths=[8*cm]),
        Table([
            [Paragraph('ALUMNO', estilo('al', fontSize=7, fontName='Helvetica-Bold', textColor=GRIS))],
            [Paragraph(alumno_nombre, s_negrita)],
        ], colWidths=[8*cm]),
    ]]

    tabla_cliente = Table(datos_cliente, colWidths=[9*cm, 8*cm])
    tabla_cliente.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), GRIS_CLARO),
        ('BACKGROUND', (1,0), (1,-1), GRIS_CLARO),
        ('BOX',  (0,0), (0,-1), 0.5, lightgrey),
        ('BOX',  (1,0), (1,-1), 0.5, lightgrey),
        ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING',   (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(tabla_cliente)
    story.append(Spacer(1, 0.5*cm))

    # ── TABLA DE CONCEPTOS ───────────────────────────────
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
        # Cabecera
        ('BACKGROUND',   (0,0), (-1,0), NARANJA),
        ('FONTNAME',     (0,0), (-1,0), 'Helvetica-Bold'),
        ('TEXTCOLOR',    (0,0), (-1,0), white),
        # Filas alternas
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, GRIS_CLARO]),
        # Bordes
        ('GRID',         (0,0), (-1,-1), 0.3, lightgrey),
        ('LINEBELOW',    (0,0), (-1,0), 1, NARANJA),
        # Padding
        ('TOPPADDING',    (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING',   (0,0), (-1,-1), 8),
        ('RIGHTPADDING',  (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(tabla_conceptos)
    story.append(Spacer(1, 0.3*cm))

    # ── TOTALES ──────────────────────────────────────────
    totales_rows = []

    totales_rows.append([
        Paragraph('Subtotal', s_normal),
        Paragraph(f"{subtotal:.2f} EUR", s_right),
    ])

    if descuento_hermano_pct > 0:
        dto = subtotal * descuento_hermano_pct / 100
        totales_rows.append([
            Paragraph(f"Descuento hermanos ({descuento_hermano_pct:.0f}%)", s_normal),
            Paragraph(f"-{dto:.2f} EUR", s_right),
        ])

    if descuento_extra_pct > 0:
        base = subtotal * (1 - descuento_hermano_pct / 100)
        dto  = base * descuento_extra_pct / 100
        totales_rows.append([
            Paragraph(f"Descuento adicional ({descuento_extra_pct:.0f}%)", s_normal),
            Paragraph(f"-{dto:.2f} EUR", s_right),
        ])
    elif descuento_extra_importe > 0:
        totales_rows.append([
            Paragraph('Descuento adicional', s_normal),
            Paragraph(f"-{descuento_extra_importe:.2f} EUR", s_right),
        ])

    # Fila total
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
    story.append(Spacer(1, 0.4*cm))

    # ── FORMAS DE PAGO ───────────────────────────────────
    if formas_pago:
        LABELS = {'efectivo':'Efectivo','tarjeta':'Tarjeta','bizum':'Bizum','transferencia':'Transferencia'}
        fp_text = ' | '.join(
            f"{LABELS.get(fp['forma'], fp['forma'])}: {fp['importe']:.2f}€"
            for fp in formas_pago
        )
        story.append(Paragraph(f"Forma de pago: {fp_text}", s_small))
        story.append(Spacer(1, 0.2*cm))

    # ── NOTAS ────────────────────────────────────────────
    if notas:
        story.append(Paragraph(f"Notas: {notas}", s_small))
        story.append(Spacer(1, 0.2*cm))

    # ── PIE ──────────────────────────────────────────────
    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=lightgrey))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        f"{nombre_academia} · {cif_academia} · {direccion_academia}",
        estilo('pie', fontSize=7, textColor=GRIS, alignment=TA_CENTER)
    ))

    doc.build(story)
    return buffer.getvalue()
