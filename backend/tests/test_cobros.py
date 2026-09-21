"""
test_cobros.py — Tests del servicio de cobros.

Cubre: creación con descuentos, pago mixto, anulación, facturación,
y todos los casos límite de los cálculos de importe.
"""
import pytest
import pytest_asyncio
from decimal import Decimal
from datetime import date

from app.services.cobros_service import crear_cobro, anular_cobro, generar_factura
from app.schemas.schemas import CobroCreate, FormaPagoItem
from app.models.models import PackAlumno, Tarifa, CategoriaEnum


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def pago(forma="efectivo", importe=80.0):
    return FormaPagoItem(forma=forma, importe=importe)


# ─────────────────────────────────────────────────────────────────────────────
# Tests de creación de cobro
# ─────────────────────────────────────────────────────────────────────────────

class TestCrearCobro:

    @pytest.mark.asyncio
    async def test_cobro_simple_sin_descuento(self, db, admin, alumno_a, pack_a, tarifa_normal):
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=False,
            descuento_extra_pct=0.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 80.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)

        assert cobro.id is not None
        assert float(cobro.subtotal) == 80.0
        assert float(cobro.total) == 80.0
        assert float(cobro.descuento_hermano_pct) == 0.0
        assert cobro.anulado is False

    @pytest.mark.asyncio
    async def test_descuento_hermanos_10_pct(self, db, admin, alumno_a, pack_a, tarifa_normal):
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=True,
            descuento_extra_pct=0.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 72.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)

        assert float(cobro.descuento_hermano_pct) == 10.0
        assert float(cobro.total) == pytest.approx(72.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_descuento_extra_porcentaje(self, db, admin, alumno_a, pack_a, tarifa_normal):
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=False,
            descuento_extra_pct=25.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 60.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)
        # 80 * 0.75 = 60
        assert float(cobro.total) == pytest.approx(60.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_descuento_extra_importe_fijo(self, db, admin, alumno_a, pack_a, tarifa_normal):
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=False,
            descuento_extra_pct=0.0,
            descuento_extra_importe=15.0,
            formas_pago=[pago("efectivo", 65.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)
        assert float(cobro.total) == pytest.approx(65.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_descuento_cascada_hermano_mas_extra(self, db, admin, alumno_a, pack_a, tarifa_normal):
        # Hermano 10% sobre 80 = 72, luego extra 50% sobre 72 = 36
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=True,
            descuento_extra_pct=50.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 36.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)
        assert float(cobro.total) == pytest.approx(36.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_pago_mixto_bizum_y_efectivo(self, db, admin, alumno_a, pack_a, tarifa_normal):
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=False,
            descuento_extra_pct=0.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("bizum", 50.0), pago("efectivo", 30.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)
        assert float(cobro.total) == pytest.approx(80.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_pack_inexistente_lanza_error(self, db, admin, alumno_a):
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[99999],
            descuento_hermano=False,
            descuento_extra_pct=0.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 0.0)],
        )
        with pytest.raises(ValueError, match="No se encontraron packs"):
            await crear_cobro(db, data, admin_id=admin.id)

    @pytest.mark.asyncio
    async def test_total_nunca_negativo(self, db, admin, alumno_a, pack_a, tarifa_normal):
        # Descuento mayor que el subtotal → total = 0
        data = CobroCreate(
            alumno_id=alumno_a.id,
            packs_ids=[pack_a.id],
            descuento_hermano=False,
            descuento_extra_pct=0.0,
            descuento_extra_importe=999.0,  # mayor que el precio
            formas_pago=[pago("efectivo", 0.0)],
        )
        cobro = await crear_cobro(db, data, admin_id=admin.id)
        assert float(cobro.total) >= 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Tests de anulación
# ─────────────────────────────────────────────────────────────────────────────

class TestAnularCobro:

    @pytest_asyncio.fixture
    async def cobro(self, db, admin, alumno_a, pack_a, tarifa_normal):
        data = CobroCreate(
            alumno_id=alumno_a.id, packs_ids=[pack_a.id],
            descuento_hermano=False, descuento_extra_pct=0.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 80.0)],
        )
        return await crear_cobro(db, data, admin_id=admin.id)

    @pytest.mark.asyncio
    async def test_anular_cobro_valido(self, db, admin, cobro):
        c = await anular_cobro(db, cobro.id, admin_id=admin.id)
        assert c.anulado is True
        assert c.fecha_anulacion is not None
        assert c.admin_anulacion_id == admin.id

    @pytest.mark.asyncio
    async def test_anular_cobro_ya_anulado_lanza_error(self, db, admin, cobro):
        await anular_cobro(db, cobro.id, admin_id=admin.id)
        with pytest.raises(ValueError, match="ya está anulado"):
            await anular_cobro(db, cobro.id, admin_id=admin.id)

    @pytest.mark.asyncio
    async def test_anular_cobro_inexistente_lanza_error(self, db, admin):
        with pytest.raises(ValueError, match="no encontrado"):
            await anular_cobro(db, 99999, admin_id=admin.id)


# ─────────────────────────────────────────────────────────────────────────────
# Tests de facturación
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerarFactura:

    @pytest_asyncio.fixture
    async def cobro(self, db, admin, alumno_a, pack_a, tarifa_normal, academia_config):
        data = CobroCreate(
            alumno_id=alumno_a.id, packs_ids=[pack_a.id],
            descuento_hermano=False, descuento_extra_pct=0.0,
            descuento_extra_importe=0.0,
            formas_pago=[pago("efectivo", 80.0)],
        )
        return await crear_cobro(db, data, admin_id=admin.id)

    @pytest.mark.asyncio
    async def test_generar_factura_correcta(self, db, cobro):
        factura = await generar_factura(
            db, cobro_id=cobro.id,
            nombre_fiscal="María García",
            nif="12345678A",
            direccion_fiscal="Calle Mayor 1",
            email_envio=None,
        )
        assert factura.id is not None
        assert factura.numero.startswith("FAC-")
        assert factura.nif == "12345678A"
        assert float(factura.total) == pytest.approx(80.0, abs=0.01)

    @pytest.mark.asyncio
    async def test_numeracion_correlativa(self, db, admin, alumno_a, pack_a, tarifa_normal, academia_config):
        # Crear dos cobros y sus facturas, comprobar que los números se incrementan
        for i in range(2):
            data = CobroCreate(
                alumno_id=alumno_a.id, packs_ids=[pack_a.id],
                descuento_hermano=False, descuento_extra_pct=0.0,
                descuento_extra_importe=0.0,
                formas_pago=[pago("efectivo", 80.0)],
            )
            c = await crear_cobro(db, data, admin_id=admin.id)
            f = await generar_factura(
                db, cobro_id=c.id,
                nombre_fiscal="Test", nif="00000000T",
                direccion_fiscal=None, email_envio=None,
            )
            # El número de factura debe acabar en 001, 002...
            assert int(f.numero.split("-")[-1]) == i + 1

    @pytest.mark.asyncio
    async def test_no_facturar_cobro_anulado(self, db, admin, cobro):
        await anular_cobro(db, cobro.id, admin_id=admin.id)
        with pytest.raises(ValueError, match="anulado"):
            await generar_factura(
                db, cobro_id=cobro.id,
                nombre_fiscal="Test", nif="00000000T",
                direccion_fiscal=None, email_envio=None,
            )

    @pytest.mark.asyncio
    async def test_no_facturar_dos_veces(self, db, cobro):
        await generar_factura(
            db, cobro_id=cobro.id,
            nombre_fiscal="Test", nif="00000000T",
            direccion_fiscal=None, email_envio=None,
        )
        with pytest.raises(ValueError, match="ya tiene una factura"):
            await generar_factura(
                db, cobro_id=cobro.id,
                nombre_fiscal="Test", nif="00000000T",
                direccion_fiscal=None, email_envio=None,
            )
