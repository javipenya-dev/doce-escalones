"""
test_semaforo.py — Tests de la lógica del semáforo de estado.

Cubre todas las transiciones: verde → rojo → amarillo → naranja.
No necesita base de datos; testea las funciones puras directamente.
"""
import pytest
from app.services.asistencias_service import calcular_estado, calcular_semanas_mes
from app.api.routes.dashboard import calcular_semaforo
from app.models.models import ResumenMensual


# ─────────────────────────────────────────────────────────────────────────────
# calcular_semanas_mes
# ─────────────────────────────────────────────────────────────────────────────

class TestCalcularSemanasMes:

    def test_enero_2026_tiene_4_semanas_lunes(self):
        # Enero 2026: lunes aparece 4 veces (5,12,19,26)
        assert calcular_semanas_mes(2026, 1, dia_semana=0) == 4

    def test_junio_2026_lunes_tiene_4_semanas(self):
        # Junio 2026: lunes 1,8,15,22,29 → 5 semanas
        assert calcular_semanas_mes(2026, 6, dia_semana=0) == 5

    def test_sin_dia_semana_mes_corto(self):
        # Febrero 2025 = 28 días → 4 semanas
        assert calcular_semanas_mes(2025, 2) == 4

    def test_sin_dia_semana_mes_largo(self):
        # Enero 2026 = 31 días → 5
        assert calcular_semanas_mes(2026, 1) == 5


# ─────────────────────────────────────────────────────────────────────────────
# calcular_estado (función pura del servicio de asistencias)
# ─────────────────────────────────────────────────────────────────────────────

class TestCalcularEstado:

    def test_verde_pagado_con_horas(self):
        estado, extra = calcular_estado(
            horas_consumidas=4.0, horas_contratadas=8.0,
            sesiones_consumidas=0, sesiones_contratadas=None,
            semanas_en_mes=4, tiene_pago_pendiente=False, es_sesion=False,
        )
        assert estado == "verde"
        assert extra == 0

    def test_rojo_pago_pendiente(self):
        estado, extra = calcular_estado(
            horas_consumidas=4.0, horas_contratadas=8.0,
            sesiones_consumidas=0, sesiones_contratadas=None,
            semanas_en_mes=4, tiene_pago_pendiente=True, es_sesion=False,
        )
        assert estado == "rojo"

    def test_amarillo_pack_agotado_horas(self):
        estado, extra = calcular_estado(
            horas_consumidas=8.0, horas_contratadas=8.0,
            sesiones_consumidas=0, sesiones_contratadas=None,
            semanas_en_mes=4, tiene_pago_pendiente=False, es_sesion=False,
        )
        assert estado == "amarillo"

    def test_amarillo_pack_agotado_sesiones(self):
        estado, extra = calcular_estado(
            horas_consumidas=0, horas_contratadas=None,
            sesiones_consumidas=10, sesiones_contratadas=10,
            semanas_en_mes=4, tiene_pago_pendiente=False, es_sesion=True,
        )
        assert estado == "amarillo"

    def test_naranja_mes_5_semanas_con_horas_extra(self):
        # Contratadas 8h para 4 semanas, pero el mes tiene 5 → base 10h
        # Consumidas 10h → está en la hora "extra" del mes largo
        estado, extra = calcular_estado(
            horas_consumidas=10.0, horas_contratadas=10.0,
            sesiones_consumidas=0, sesiones_contratadas=None,
            semanas_en_mes=5, tiene_pago_pendiente=False, es_sesion=False,
        )
        assert estado == "naranja"
        assert extra > 0

    def test_rojo_tiene_prioridad_sobre_agotado(self):
        # Si hay pago pendiente Y el pack está agotado, prevalece rojo
        estado, _ = calcular_estado(
            horas_consumidas=10.0, horas_contratadas=8.0,
            sesiones_consumidas=0, sesiones_contratadas=None,
            semanas_en_mes=4, tiene_pago_pendiente=True, es_sesion=False,
        )
        assert estado == "rojo"

    def test_verde_sin_horas_contratadas(self):
        # Pack sin tarifa definida → verde por defecto
        estado, _ = calcular_estado(
            horas_consumidas=0, horas_contratadas=None,
            sesiones_consumidas=0, sesiones_contratadas=None,
            semanas_en_mes=4, tiene_pago_pendiente=False, es_sesion=False,
        )
        assert estado == "verde"


# ─────────────────────────────────────────────────────────────────────────────
# calcular_semaforo (función del dashboard — usa ResumenMensual)
# ─────────────────────────────────────────────────────────────────────────────

def _make_resumen(**kwargs):
    """Crea un ResumenMensual sin persistir en DB."""
    defaults = dict(
        id=1, alumno_id=1, pack_alumno_id=1,
        anio=2026, mes=6,
        horas_consumidas=0.0, sesiones_consumidas=0,
        semanas_en_mes=4,
        horas_contratadas=None, sesiones_contratadas=None,
    )
    defaults.update(kwargs)
    r = ResumenMensual.__new__(ResumenMensual)
    for k, v in defaults.items():
        setattr(r, k, v)
    return r


class TestCalcularSemaforoDashboard:

    def test_verde_con_cobro(self):
        resumen = _make_resumen(horas_consumidas=4.0, horas_contratadas=8.0)
        estado, importe = calcular_semaforo(resumen, tiene_cobro_mes=True)
        assert estado == "verde"
        assert importe is None

    def test_rojo_sin_cobro_con_actividad(self):
        resumen = _make_resumen(horas_consumidas=2.0, horas_contratadas=8.0)
        estado, importe = calcular_semaforo(resumen, tiene_cobro_mes=False)
        assert estado == "rojo"

    def test_verde_sin_actividad_sin_cobro(self):
        # Sin horas consumidas → no hay deuda
        resumen = _make_resumen(horas_consumidas=0.0, horas_contratadas=8.0)
        estado, _ = calcular_semaforo(resumen, tiene_cobro_mes=False)
        assert estado == "verde"

    def test_amarillo_pack_agotado(self):
        resumen = _make_resumen(horas_consumidas=8.0, horas_contratadas=8.0)
        estado, _ = calcular_semaforo(resumen, tiene_cobro_mes=True)
        assert estado == "amarillo"

    def test_naranja_mes_5_semanas(self):
        # 10h contratadas en mes de 5 semanas, ha consumido las 10h
        resumen = _make_resumen(
            horas_consumidas=10.0, horas_contratadas=10.0,
            semanas_en_mes=5,
        )
        estado, _ = calcular_semaforo(resumen, tiene_cobro_mes=True)
        assert estado == "naranja"

    def test_none_resumen_devuelve_verde(self):
        estado, importe = calcular_semaforo(None, tiene_cobro_mes=False)
        assert estado == "verde"
        assert importe is None
