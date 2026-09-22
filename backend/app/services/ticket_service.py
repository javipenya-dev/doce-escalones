"""
Generador de tickets para impresora térmica.

Usa comandos ESC/POS — el estándar de facto para impresoras térmicas.
Soporta logo bitmap opcional al inicio del ticket (Pillow → GS v 0).
"""

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from PIL import Image


# ── Comandos ESC/POS ─────────────────────────────────────────
ESC = b'\x1b'
GS  = b'\x1d'

CMD_INIT           = ESC + b'@'           # Inicializar impresora
CMD_CODEPAGE_CP858 = ESC + b't\x13'       # Página de códigos CP858 (Euro + acentos ES)
CMD_ALIGN_LEFT     = ESC + b'a\x00'       # Alinear izquierda
CMD_ALIGN_CENTER   = ESC + b'a\x01'       # Alinear centro
CMD_ALIGN_RIGHT    = ESC + b'a\x02'       # Alinear derecha
CMD_BOLD_ON        = ESC + b'E\x01'       # Negrita activa
CMD_BOLD_OFF       = ESC + b'E\x00'       # Negrita desactiva
CMD_FONT_BIG       = GS  + b'!\x11'       # Doble alto + ancho
CMD_FONT_NORMAL    = GS  + b'!\x00'       # Tamaño normal
CMD_FONT_DOUBLE_H  = GS  + b'!\x01'       # Doble alto
CMD_CUT            = GS  + b'V\x41\x03'   # Corte parcial (deja hilo)
CMD_FEED_LINE      = b'\n'

TICKET_WIDTH      = 32   # Caracteres por línea (Excelvan modo 58mm)
LOGO_ANCHO_DOTS   = 256  # Ancho del logo en dots (256 = 2/3 de 384, más equilibrado)
LOGO_ALTO_MAX_DOTS = 400 # Límite de alto para no pasarse


# ── LOGO (bitmap ESC/POS) ────────────────────────────────────

def _logo_a_bitmap_escpos(logo_path: str, ancho_dots: int = LOGO_ANCHO_DOTS):
    """
    Carga un PNG, lo convierte a bitmap 1-bit y devuelve (datos, ancho, alto).
    Si falla, devuelve (None, 0, 0).
    En ESC/POS: 1 = negro, 0 = blanco, MSB primero.
    """
    if not logo_path or not os.path.exists(logo_path):
        return None, 0, 0
    try:
        img = Image.open(logo_path)

        # Manejar transparencia: componer sobre fondo blanco
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGBA')
            fondo = Image.new('RGB', img.size, (255, 255, 255))
            fondo.paste(img, mask=img.split()[-1])
            img = fondo
        else:
            img = img.convert('RGB')

        # A grises
        img = img.convert('L')

        # Redimensionar manteniendo aspect ratio
        w, h = img.size
        ratio = h / w
        nuevo_alto = int(ancho_dots * ratio)

        if nuevo_alto > LOGO_ALTO_MAX_DOTS:
            nuevo_alto = LOGO_ALTO_MAX_DOTS
            nuevo_ancho = int(nuevo_alto / ratio)
            img = img.resize((nuevo_ancho, nuevo_alto), Image.LANCZOS)
        else:
            img = img.resize((ancho_dots, nuevo_alto), Image.LANCZOS)

        # A 1-bit por UMBRAL (limpio para logos con fondo sólido).
        # El naranja (~134 en gris) → negro. El blanco (255) → blanco.
        img = img.point(lambda x: 255 if x > 200 else 0, 'L').convert('1')

        ancho_real, alto_real = img.size
        ancho_bytes = (ancho_real + 7) // 8

        # Empaquetar bits: MSB primero, 1 = negro
        px = img.load()
        data = bytearray(ancho_bytes * alto_real)
        for y in range(alto_real):
            offset = y * ancho_bytes
            for x in range(ancho_real):
                if px[x, y] == 0:  # 0 = negro en PIL '1'
                    data[offset + (x // 8)] |= (0x80 >> (x % 8))

        return bytes(data), ancho_real, alto_real
    except Exception:
        return None, 0, 0


def _comando_logo_escpos(logo_path: str, ancho_dots: int = LOGO_ANCHO_DOTS) -> bytes:
    """
    Genera el comando ESC/POS para imprimir el logo centrado.
    Devuelve bytes vacíos si el logo no se puede cargar.
    """
    datos, ancho, alto = _logo_a_bitmap_escpos(logo_path, ancho_dots)
    if not datos:
        return b''

    ancho_bytes = (ancho + 7) // 8

    buf = bytearray()
    buf += CMD_ALIGN_CENTER
    # GS v 0 m xL xH yL yH
    buf += bytes([0x1D, 0x76, 0x30, 0x00])
    buf += bytes([ancho_bytes & 0xFF, (ancho_bytes >> 8) & 0xFF])
    buf += bytes([alto & 0xFF, (alto >> 8) & 0xFF])
    buf += datos
    buf += b'\n'
    buf += CMD_ALIGN_LEFT
    return bytes(buf)


# ── DATOS DEL TICKET ─────────────────────────────────────────

@dataclass
class DatosTicket:
    # Academia
    nombre_academia: str
    cif:             str
    direccion:       str
    telefono:        str

    # Cobro
    cobro_id:        int
    fecha:           datetime
    alumno_nombre:   str

    # Líneas de detalle
    lineas: list[dict]

    # Totales
    subtotal:                float
    descuento_hermano_pct:   float = 0.0
    descuento_extra_pct:     float = 0.0
    descuento_extra_importe: float = 0.0
    total:                   float = 0.0

    # Formas de pago
    formas_pago: list[dict] = None

    # Opcionales
    notas:     Optional[str] = None
    anulado:   bool = False
    logo_path: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _linea(texto: str, ancho: int = TICKET_WIDTH) -> str:
    return texto[:ancho].ljust(ancho)


def _separador(char: str = '-', ancho: int = TICKET_WIDTH) -> str:
    return char * ancho


def _dos_columnas(izq: str, der: str, ancho: int = TICKET_WIDTH) -> str:
    espacio = ancho - len(der)
    izq_truncado = izq[:espacio - 1] if len(izq) >= espacio else izq
    return izq_truncado.ljust(espacio) + der


def _formatear_importe(valor: float, signo: bool = False) -> str:
    prefijo = '-' if valor < 0 else ('+' if signo and valor > 0 else '')
    return f"{prefijo}{abs(valor):.2f}EUR"


# ── GENERADOR PRINCIPAL ──────────────────────────────────────

def generar_ticket_bytes(datos: DatosTicket) -> bytes:
    """
    Genera el ticket en formato ESC/POS listo para enviar a la impresora.
    Devuelve bytes.
    """
    buf = bytearray()

    def add(data: bytes):
        buf.extend(data)

    def line(texto: str = '', encoding: str = 'cp858'):
        add((texto + '\n').encode(encoding, errors='replace'))

    # ── Inicializar ──
    add(CMD_INIT)
    add(CMD_CODEPAGE_CP858)

    # ── Logo (opcional) ──
    if datos.logo_path:
        logo_bytes = _comando_logo_escpos(datos.logo_path)
        if logo_bytes:
            add(logo_bytes)
            line()  # un pequeño espacio tras el logo

    if datos.anulado:
        add(CMD_ALIGN_CENTER)
        add(CMD_BOLD_ON)
        add(CMD_FONT_BIG)
        line('** ANULADO **')
        add(CMD_FONT_NORMAL)
        add(CMD_BOLD_OFF)
        line()

    # ── Cabecera academia ──
    add(CMD_ALIGN_CENTER)
    add(CMD_BOLD_ON)
    add(CMD_FONT_DOUBLE_H)
    line(datos.nombre_academia[:TICKET_WIDTH])
    add(CMD_FONT_NORMAL)
    add(CMD_BOLD_OFF)

    if datos.direccion:
        line(datos.direccion[:TICKET_WIDTH])
    if datos.telefono:
        line(f"Tel: {datos.telefono}")
    if datos.cif:
        line(f"CIF: {datos.cif}")

    add(CMD_ALIGN_LEFT)
    line(_separador('='))

    # ── Datos del cobro ──
    line(f"Fecha : {datos.fecha.strftime('%d/%m/%Y  %H:%M')}")
    line(f"Ticket: {str(datos.cobro_id).zfill(5)}")
    line(_separador())
    add(CMD_BOLD_ON)
    line(f"Alumno: {datos.alumno_nombre[:24]}")
    add(CMD_BOLD_OFF)
    line(_separador())

    # ── Líneas de detalle ──
    for linea in datos.lineas:
        desc    = linea.get('descripcion', '')
        importe = _formatear_importe(linea.get('importe', 0))
        line(_dos_columnas(desc, importe))

    line(_separador())

    # ── Descuentos y totales ──
    line(_dos_columnas('Subtotal', _formatear_importe(datos.subtotal)))

    if datos.descuento_hermano_pct > 0:
        dto_importe = datos.subtotal * datos.descuento_hermano_pct / 100
        line(_dos_columnas(
            f'Dto.hermanos ({datos.descuento_hermano_pct:.0f}%)',
            _formatear_importe(-dto_importe)
        ))

    if datos.descuento_extra_pct > 0:
        base = datos.subtotal * (1 - datos.descuento_hermano_pct / 100)
        dto  = base * datos.descuento_extra_pct / 100
        line(_dos_columnas(
            f'Dto.adicional ({datos.descuento_extra_pct:.0f}%)',
            _formatear_importe(-dto)
        ))
    elif datos.descuento_extra_importe > 0:
        line(_dos_columnas(
            'Dto.adicional',
            _formatear_importe(-datos.descuento_extra_importe)
        ))

    line(_separador('='))

    add(CMD_BOLD_ON)
    add(CMD_FONT_DOUBLE_H)
    line(_dos_columnas('TOTAL', _formatear_importe(datos.total)))
    add(CMD_FONT_NORMAL)
    add(CMD_BOLD_OFF)

    line(_separador('-'))

    # ── Formas de pago ──
    ICONOS = {
        'efectivo':      'Efectivo    ',
        'tarjeta':       'Tarjeta     ',
        'bizum':         'Bizum       ',
        'transferencia': 'Transferenc.',
    }
    for fp in (datos.formas_pago or []):
        forma   = fp.get('forma', '')
        importe = fp.get('importe', 0)
        label   = ICONOS.get(forma, forma.capitalize()[:12].ljust(12))
        line(_dos_columnas(label, _formatear_importe(importe)))

    # ── Observaciones ──
    if datos.notas:
        line(_separador())
        add(CMD_BOLD_ON)
        line('OBSERVACIONES:')
        add(CMD_BOLD_OFF)
        resto = datos.notas.strip()
        while len(resto) > TICKET_WIDTH:
            corte = resto.rfind(' ', 0, TICKET_WIDTH)
            if corte == -1:
                corte = TICKET_WIDTH
            line(resto[:corte])
            resto = resto[corte:].strip()
        if resto:
            line(resto)

    # ── Pie ──
    line(_separador('='))
    add(CMD_ALIGN_CENTER)
    line('Gracias por confiar en')
    add(CMD_BOLD_ON)
    line(datos.nombre_academia[:TICKET_WIDTH])
    add(CMD_BOLD_OFF)
    line()
    line()
    line()
    line()
    line()
    line()

    # ── Corte ──
    add(ESC + b'd\x05')
    add(CMD_CUT)

    return bytes(buf)


def generar_ticket_texto(datos: DatosTicket) -> str:
    """Versión texto plano del ticket — para previsualización en pantalla."""
    W = TICKET_WIDTH
    lineas = []

    def sep(c='─'): lineas.append(c * W)
    def centro(t): lineas.append(t[:W].center(W))
    def fila(izq, der): lineas.append(_dos_columnas(izq, der, W))

    if datos.anulado:
        lineas.append('** TICKET ANULADO **'.center(W))
        sep('═')

    centro(datos.nombre_academia)
    if datos.direccion: centro(datos.direccion)
    if datos.telefono:  centro(f"Tel: {datos.telefono}")
    if datos.cif:       centro(f"CIF: {datos.cif}")
    sep('═')

    lineas.append(f"Fecha : {datos.fecha.strftime('%d/%m/%Y  %H:%M')}")
    lineas.append(f"Ticket: #{str(datos.cobro_id).zfill(5)}")
    sep()
    lineas.append(f"Alumno: {datos.alumno_nombre}")
    sep()

    for l in datos.lineas:
        fila(l.get('descripcion',''), _formatear_importe(l.get('importe', 0)))

    sep()
    fila('Subtotal', _formatear_importe(datos.subtotal))

    if datos.descuento_hermano_pct > 0:
        dto = datos.subtotal * datos.descuento_hermano_pct / 100
        fila(f"Dto. hermanos ({datos.descuento_hermano_pct:.0f}%)", _formatear_importe(-dto))

    if datos.descuento_extra_pct > 0:
        base = datos.subtotal * (1 - datos.descuento_hermano_pct / 100)
        dto  = base * datos.descuento_extra_pct / 100
        fila(f"Dto. adicional ({datos.descuento_extra_pct:.0f}%)", _formatear_importe(-dto))
    elif datos.descuento_extra_importe > 0:
        fila('Dto. adicional', _formatear_importe(-datos.descuento_extra_importe))

    sep('═')
    fila('TOTAL', _formatear_importe(datos.total))
    sep()

    LABELS = {
        'efectivo': 'Efectivo', 'tarjeta': 'Tarjeta',
        'bizum': 'Bizum', 'transferencia': 'Transferencia',
    }
    for fp in (datos.formas_pago or []):
        fila(LABELS.get(fp['forma'], fp['forma']), _formatear_importe(fp['importe']))

    if datos.notas:
        sep()
        lineas.append(f"Nota: {datos.notas}")

    sep('═')
    centro('Gracias por confiar en')
    centro(datos.nombre_academia)
    lineas.append('')

    return '\n'.join(lineas)