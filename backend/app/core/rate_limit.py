"""
Rate limiting en memoria para el endpoint de login.

Limita a 10 intentos fallidos por IP en una ventana deslizante de 10 minutos.

Uso típico en `auth.py`:
    from app.core.rate_limit import check_login_rate_limit, registrar_intento_fallido

    @router.post("/login")
    async def login(data: LoginRequest, request: Request, db: ...):
        check_login_rate_limit(request)     # Lanza 429 si está bloqueado
        try:
            usuario = await _validar_login(db, data)
        except HTTPException:
            registrar_intento_fallido(request)  # Suma 1 al contador
            raise
        # Si llega aquí, login correcto → no suma nada
        return TokenResponse(...)

Notas:
- In-memory: si reinicias el backend, los contadores se resetean (bien:
  no bloqueas a nadie permanentemente por un fallo puntual).
- Funciona bien con 1 worker (nuestro caso). Si algún día hay varios,
  cada worker tendría su contador (no compartido).
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request, status

# ── Configuración ──
MAX_INTENTOS = 10
VENTANA_MINUTOS = 10

# Almacenamiento en memoria
# { '192.168.1.100': [datetime1, datetime2, ...] }
_intentos: dict[str, list[datetime]] = defaultdict(list)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _get_client_ip(request: Request) -> str:
    """
    Obtiene la IP real del cliente.

    Si la petición viene por nginx (que añade X-Forwarded-For), la IP real
    está en la primera posición de esa cabecera. Si no, usamos request.client.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # "ip1, ip2, ip3" → la primera es la del cliente
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _limpiar_antiguos(ip: str, ahora: datetime) -> None:
    """Elimina los timestamps fuera de la ventana."""
    limite = ahora - timedelta(minutes=VENTANA_MINUTOS)
    _intentos[ip] = [t for t in _intentos[ip] if t > limite]


def check_login_rate_limit(request: Request) -> None:
    """
    Lanza HTTPException 429 si la IP ha superado MAX_INTENTOS en los
    últimos VENTANA_MINUTOS minutos.
    """
    ip = _get_client_ip(request)
    ahora = _ahora()
    _limpiar_antiguos(ip, ahora)

    if len(_intentos[ip]) >= MAX_INTENTOS:
        mas_antiguo = min(_intentos[ip])
        esperar_hasta = mas_antiguo + timedelta(minutes=VENTANA_MINUTOS)
        segundos_restantes = max(1, int((esperar_hasta - ahora).total_seconds()))
        minutos_restantes = (segundos_restantes + 59) // 60  # redondear arriba

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Demasiados intentos fallidos. "
                f"Espera {minutos_restantes} minuto{'s' if minutos_restantes != 1 else ''} "
                f"e inténtalo de nuevo."
            ),
            headers={"Retry-After": str(segundos_restantes)},
        )


def registrar_intento_fallido(request: Request) -> None:
    """Suma un intento fallido para la IP de la request."""
    ip = _get_client_ip(request)
    ahora = _ahora()
    _limpiar_antiguos(ip, ahora)
    _intentos[ip].append(ahora)


def limpiar_intentos(request: Request) -> None:
    """
    Limpia todos los intentos de una IP.

    Útil si quieres resetear manualmente (ej: desde un endpoint admin).
    En el flujo normal, tras un login exitoso no hace falta limpiar:
    los intentos caen solos de la ventana en 10 min.
    """
    ip = _get_client_ip(request)
    _intentos.pop(ip, None)


def estado_actual() -> dict:
    """
    Devuelve el estado actual del rate limit (para debug).
    { 'ip': 'num_intentos_en_ventana' }
    """
    ahora = _ahora()
    out = {}
    for ip, timestamps in _intentos.items():
        limite = ahora - timedelta(minutes=VENTANA_MINUTOS)
        out[ip] = len([t for t in timestamps if t > limite])
    return out