"""
Punto de entrada de la API doce-escalones.
Arrancar con:  uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.DEBUG)

from app.api.routes import (
    auth, alumnos, asistencias, cobros,
    dashboard, profesores, tarifas, informes, websocket,
    packs, config,
)

app = FastAPI(
    title="Doce Escalones API",
    version="1.0.0",
    docs_url="/docs",
)

# CORS — permite acceso desde el frontend web y la app móvil en red local.
# NO usar allow_origins=["*"] junto con allow_credentials=True: Chrome lo
# rechaza por spec. En su lugar, permitimos explícitamente cualquier origen
# que sea localhost, 127.0.0.1, o IP de red local (192.168.x.x, 10.x.x.x).
import re

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/auth",         tags=["Auth"])
app.include_router(alumnos.router,      prefix="/alumnos",      tags=["Alumnos"])
app.include_router(asistencias.router,  prefix="/asistencias",  tags=["Asistencias"])
app.include_router(cobros.router,       prefix="/cobros",       tags=["Cobros"])
app.include_router(dashboard.router,    prefix="/dashboard",    tags=["Dashboard"])
app.include_router(profesores.router,   prefix="/profesores",   tags=["Profesores"])
app.include_router(tarifas.router,      prefix="/tarifas",      tags=["Tarifas"])
app.include_router(informes.router,     prefix="/informes",     tags=["Informes"])
app.include_router(packs.router,        prefix="/packs",        tags=["Packs"])
app.include_router(config.router,       prefix="/config",       tags=["Config"])
app.include_router(websocket.router,                            tags=["WebSocket"])


# ── Servir archivos estáticos (logos, backups) ───────────────────────────────
# El panel web accede a /api/media/logo_xxx.png para mostrar el preview.
# Sin este mount, FastAPI devuelve 404 aunque el archivo exista en disco.
LOGOS_DIR = os.path.join(os.path.dirname(__file__), "media", "logos")
os.makedirs(LOGOS_DIR, exist_ok=True)
app.mount("/api/media", StaticFiles(directory=LOGOS_DIR), name="media")


@app.get("/health")
async def health():
    return {"status": "ok"}