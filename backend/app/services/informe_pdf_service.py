"""
Generador del PDF del informe mensual (a partir de InformeMensualOut).
Usa ReportLab, mismo estilo que factura_service.
"""
from io import BytesIO
from calendar import month_name

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white, lightgrey
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


NARANJA    = HexColor('#F26419')
NEGRO      = HexColor('#111111')
GRIS       = HexColor('#666666')
GRIS_CLARO = HexColor('#F9F9F9')


def generar_informe_pdf(informe) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm, topMargin=1.8*cm, bottomMargin=1.8*cm,
    )

    styles = getSampleStyleSheet()
    story = []

    def estilo(nombre, **kw):
        return ParagraphStyle(nombre, parent=styles['Normal'], **kw)

    s_normal  = estilo('n',  fontSize=9, leading=12)
    s_bold    = estilo('b',  fontSize=9, fontName='Helvetica-Bold')
    s_small   = estilo('s',  fontSize=8, textColor=GRIS)
    s_right   = estilo('r',  fontSize=9, alignment=TA_RIGHT)
    s_right_b = estilo('rb', fontSize=9, fontName='Helvetica-Bold', alignment=TA_RIGHT)
    s_h1      = estilo('h1', fontSize=22, fontName='Helvetica-Bold', textColor=NARANJA, alignment=TA_CENTER)
    s_h2      = estilo('h2', fontSize=13, fontName='Helvetica-Bold', textColor=NEGRO)
    s_total   = estilo('t',  fontSize=12, fontName='Helvetica-Bold', textColor=NARANJA, alignment=TA_RIGHT)
    s_legal   = estilo('lg', fontSize=7.5, textColor=GRIS, alignment=TA_CENTER)

    # ── Cabecera ──
    story.append(Paragraph('INFORME MENSUAL', s_h1))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(f"{informe.mes_label}", estilo('ml', fontSize=14, fontName='Helvetica-Bold', alignment=TA_CENTER)))
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width='100%', thickness=2, color=NARANJA))
    story.append(Spacer(1, 5*mm))

    # ── Resumen ejecutivo ──
    story.append(Paragraph('Resumen del mes', s_h2))
    story.append(Spacer(1, 2*mm))

    media = (informe.recaudado / informe.alumnos_activos) if informe.alumnos_activos > 0 else 0

    resumen_rows = [
        [Paragraph('<b>Concepto</b>', s_bold), Paragraph('<b>Valor</b>', s_right_b)],
        [Paragraph('Total recaudado', s_normal), Paragraph(f"{informe.recaudado:.2f} EUR", s_right)],
        [Paragraph('Número de cobros', s_normal), Paragraph(str(informe.num_cobros), s_right)],
        [Paragraph('Importe anulado', s_normal), Paragraph(f"-{informe.total_anulado:.2f} EUR ({informe.num_anulados})", s_right)],
        [Paragraph('Alumnos con actividad', s_normal), Paragraph(str(informe.alumnos_activos), s_right)],
        [Paragraph('Horas totales', s_normal), Paragraph(f"{informe.horas_total:.1f} h", s_right)],
        [Paragraph('Sesiones totales', s_normal), Paragraph(str(informe.sesiones_total), s_right)],
        [Paragraph('Media por alumno activo', s_normal), Paragraph(f"{media:.2f} EUR", s_right)],
    ]

    tabla_res = Table(resumen_rows, colWidths=[11*cm, 6*cm])
    tabla_res.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NARANJA),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, GRIS_CLARO]),
        ('GRID', (0,0), (-1,-1), 0.3, lightgrey),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(tabla_res)
    story.append(Spacer(1, 6*mm))

    # ── Desglose por forma de pago ──
    if informe.formas_pago:
        story.append(Paragraph('Desglose por forma de pago', s_h2))
        story.append(Spacer(1, 2*mm))

        LABELS = {'efectivo': 'Efectivo', 'tarjeta': 'Tarjeta', 'bizum': 'Bizum', 'transferencia': 'Transferencia'}
        fp_rows = [[
            Paragraph('<b>Forma</b>', s_bold),
            Paragraph('<b>Cobros</b>', s_right_b),
            Paragraph('<b>Importe</b>', s_right_b),
        ]]
        total_fp = 0.0
        for key, val in informe.formas_pago.items():
            if val['total'] > 0:
                fp_rows.append([
                    Paragraph(LABELS.get(key, key), s_normal),
                    Paragraph(str(val['num_cobros']), s_right),
                    Paragraph(f"{val['total']:.2f} EUR", s_right),
                ])
                total_fp += val['total']

        if informe.cobros_mixtos > 0:
            fp_rows.append([
                Paragraph('Pago mixto (incluido arriba)', s_normal),
                Paragraph(str(informe.cobros_mixtos), s_right),
                Paragraph(f"{informe.total_mixtos:.2f} EUR", s_right),
            ])

        fp_rows.append([
            Paragraph('<b>TOTAL</b>', s_bold),
            Paragraph('', s_right),
            Paragraph(f"<b>{total_fp:.2f} EUR</b>", s_total),
        ])

        tabla_fp = Table(fp_rows, colWidths=[8*cm, 4*cm, 5*cm])
        tabla_fp.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), NARANJA),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-2), [white, GRIS_CLARO]),
            ('BACKGROUND', (0,-1), (-1,-1), GRIS_CLARO),
            ('LINEABOVE', (0,-1), (-1,-1), 1.5, NARANJA),
            ('GRID', (0,0), (-1,-2), 0.3, lightgrey),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ]))
        story.append(tabla_fp)
        story.append(Spacer(1, 6*mm))

    # ── Top alumnos ──
    if informe.top_alumnos:
        story.append(Paragraph('Alumnos con más actividad', s_h2))
        story.append(Spacer(1, 2*mm))

        al_rows = [[
            Paragraph('<b>Alumno</b>', s_bold),
            Paragraph('<b>Horas</b>', s_right_b),
            Paragraph('<b>Sesiones</b>', s_right_b),
            Paragraph('<b>Pagado</b>', s_right_b),
        ]]
        for a in informe.top_alumnos:
            al_rows.append([
                Paragraph(a.nombre, s_normal),
                Paragraph(f"{a.horas:.1f} h", s_right),
                Paragraph(str(a.sesiones), s_right),
                Paragraph(f"{a.importe_pagado:.2f} EUR", s_right),
            ])

        tabla_al = Table(al_rows, colWidths=[8*cm, 3*cm, 3*cm, 3*cm])
        tabla_al.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), NARANJA),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, GRIS_CLARO]),
            ('GRID', (0,0), (-1,-1), 0.3, lightgrey),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ]))
        story.append(tabla_al)
        story.append(Spacer(1, 6*mm))

    # ── Desglose por profesor ──
    if informe.por_profesor:
        story.append(Paragraph('Actividad por profesor', s_h2))
        story.append(Spacer(1, 2*mm))

        pr_rows = [[
            Paragraph('<b>Profesor</b>', s_bold),
            Paragraph('<b>Normal</b>', s_right_b),
            Paragraph('<b>Inglés</b>', s_right_b),
            Paragraph('<b>Sesiones</b>', s_right_b),
            Paragraph('<b>Total clases</b>', s_right_b),
        ]]
        tot_n = tot_i = tot_s = tot_t = 0.0
        for p in informe.por_profesor:
            pr_rows.append([
                Paragraph(p.nombre, s_normal),
                Paragraph(f"{p.horas_normal:.1f} h", s_right),
                Paragraph(f"{p.horas_ingles:.1f} h", s_right),
                Paragraph(str(p.sesiones), s_right),
                Paragraph(str(p.total_clases), s_right),
            ])
            tot_n += p.horas_normal
            tot_i += p.horas_ingles
            tot_s += p.sesiones
            tot_t += p.total_clases

        pr_rows.append([
            Paragraph('<b>TOTAL</b>', s_bold),
            Paragraph(f"<b>{tot_n:.1f} h</b>", s_right_b),
            Paragraph(f"<b>{tot_i:.1f} h</b>", s_right_b),
            Paragraph(f"<b>{int(tot_s)}</b>", s_right_b),
            Paragraph(f"<b>{int(tot_t)}</b>", s_right_b),
        ])

        tabla_pr = Table(pr_rows, colWidths=[6*cm, 3*cm, 3*cm, 2.5*cm, 2.5*cm])
        tabla_pr.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), NARANJA),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-2), [white, GRIS_CLARO]),
            ('BACKGROUND', (0,-1), (-1,-1), GRIS_CLARO),
            ('LINEABOVE', (0,-1), (-1,-1), 1.5, NARANJA),
            ('GRID', (0,0), (-1,-2), 0.3, lightgrey),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ]))
        story.append(tabla_pr)
        story.append(Spacer(1, 8*mm))

    # ── Pie ──
    story.append(HRFlowable(width='100%', thickness=0.5, color=lightgrey))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        f"Informe generado automáticamente · 12 Escalones · {informe.mes_label}",
        s_legal,
    ))

    doc.build(story)
    return buffer.getvalue()