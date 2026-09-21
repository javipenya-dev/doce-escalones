"""
WebSocket manager para el dashboard en tiempo real.
Los clientes se conectan a  ws://host:8000/ws?token=JWT
El backend emite eventos cuando llega una asistencia o cobro.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Any
import json

from app.core.security import decode_token

router = APIRouter()


class ConnectionManager:
    """Gestiona todas las conexiones WebSocket activas."""

    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict[str, Any]):
        """Envía un mensaje JSON a todos los clientes conectados."""
        message = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


# Instancia global que importan los otros routes
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(default=None),
):
    # Validar token JWT si se proporciona
    # Si no hay token, aceptamos igualmente (panel interno en red local)
    if token:
        payload = decode_token(token)
        if not payload:
            await ws.close(code=4001)
            return

    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(ws)
