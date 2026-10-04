"""
Punto de entrada de la API doce-escalones.
Arrancar con:  uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import scheduler as backup_scheduler

logging.basicConfig(level=logging.DEBUG)

from app.api.routes import (
    auth, alumnos, asistencias, cobros,
    dashboard, profesores, tarifas, informes, websocket,
    packs, config,
)


# ── Lifespan: arranca el scheduler de backups al iniciar ─────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    backup_scheduler.iniciar()
    print("[main] Backend listo")

    yield

    # SHUTDOWN
    backup_scheduler.parar()
    print("[main] Backend detenido")


app = FastAPI(
    title="Doce Escalones API",
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)

# CORS — permite acceso desde el frontend web y la app móvil en red local.
import re

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|100\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$",
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
LOGOS_DIR = os.path.join(os.path.dirname(__file__), "media", "logos")
os.makedirs(LOGOS_DIR, exist_ok=True)
app.mount("/api/media", StaticFiles(directory=LOGOS_DIR), name="media")


@app.get("/health")
async def health():
    return {"status": "ok"}