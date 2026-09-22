"""
Servicio de impresión térmica por red (TCP/ESC-POS).

Envía bytes ESC/POS a una impresora térmica conectada por Ethernet al router.
La impresora debe estar accesible en la misma red que el backend.
"""
import socket
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class ImpresoraError(Exception):
    """Error al comunicarse con la impresora térmica."""
    pass


def _get_config_impresora() -> tuple[str, int]:
    """Lee IP y puerto de la impresora desde .env (vía settings)."""
    ip = getattr(settings, "IMPRESORA_IP", None)
    puerto = int(getattr(settings, "IMPRESORA_PUERTO", 9100))
    if not ip:
        raise ImpresoraError(
            "IMPRESORA_IP no configurada en backend/.env. "
            "Añade IMPRESORA_IP=192.168.1.23"
        )
    return ip, puerto


def enviar_a_impresora(
    datos: bytes,
    ip: Optional[str] = None,
    puerto: Optional[int] = None,
    timeout: int = 5,
) -> None:
    """
    Envía bytes crudos ESC/POS a la impresora por TCP.
    Lanza ImpresoraError si no puede conectar o enviar.
    """
    if ip is None or puerto is None:
        ip_cfg, puerto_cfg = _get_config_impresora()
        ip = ip or ip_cfg
        puerto = puerto or puerto_cfg

    logger.info(f"Enviando {len(datos)} bytes a impresora {ip}:{puerto}")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, puerto))
            s.sendall(datos)
        logger.info("Impresión enviada correctamente")
    except socket.timeout:
        raise ImpresoraError(
            f"Timeout conectando a la impresora {ip}:{puerto}. "
            "¿Está encendida y en la misma red?"
        )
    except ConnectionRefusedError:
        raise ImpresoraError(
            f"Conexión rechazada por {ip}:{puerto}. "
            "Revisa la IP o el puerto de la impresora."
        )
    except OSError as e:
        raise ImpresoraError(f"Error de red al imprimir: {e}")


def imprimir_varias_copias(datos: bytes, copias: int = 2, **kwargs) -> None:
    """
    Envía el mismo ticket N veces a la impresora (cliente + academia).
    Copias limitadas entre 1 y 10 para evitar accidentes.
    """
    copias = max(1, min(copias, 10))
    for i in range(copias):
        logger.info(f"Imprimiendo copia {i+1}/{copias}")
        enviar_a_impresora(datos, **kwargs)