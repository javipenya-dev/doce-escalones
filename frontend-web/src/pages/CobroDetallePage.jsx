import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { cobrosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Button, Avatar, Spinner } from '../components/ui'

const FORMA_LABEL = {
  efectivo:      { label: 'Efectivo',      icon: '💵' },
  tarjeta:       { label: 'Tarjeta',       icon: '💳' },
  bizum:         { label: 'Bizum',         icon: '📱' },
  transferencia: { label: 'Transferencia', icon: '🏦' },
}

function Campo({ label, value, mono = false }) {
  return (
    <div>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--grey-mid)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '0.88rem', color: value ? 'var(--black)' : 'var(--grey-light)',
        fontFamily: mono ? 'monospace' : undefined,
      }}>
        {value || '—'}
      </div>
    </div>
  )
}

function LineaTicket({ descripcion, importe }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--white-off)',
    }}>
      <span style={{ fontSize: '0.85rem' }}>{descripcion}</span>
      <span style={{ fontWeight: 600, fontSize: '0.88rem', fontVariantNumeric: 'tabular-nums' }}>
        {Number(importe).toFixed(2)}€
      </span>
    </div>
  )
}

/* ── Modal de generación de factura ─────────────── */
function ModalFactura({ cobroId, onClose, onGenerada }) {
  const [form, setForm] = useState({ nombre_fiscal: '', nif: '', direccion_fiscal: '', email_envio: '' })
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async () => {
    if (!form.nombre_fiscal.trim() || !form.nif.trim()) {
      toast.error('Nombre fiscal y NIF son obligatorios')
      return
    }
    setGuardando(true)
    try {
      await cobrosService.generarFactura(cobroId, form)
      toast.success('Factura generada correctamente')
      onGenerada()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al generar la factura')
    } finally {
      setGuardando(false)
    }
  }

  const inputStyle = {
    fontFamily: 'var(--font-body)', fontSize: '0.85rem',
    padding: '8px 12px', border: '1px solid var(--grey-border)',
    borderRadius: 'var(--radius-sm)', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--radius)',
        padding: 28, width: 420, boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 20 }}>
          🧾 Generar factura
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
              NOMBRE FISCAL *
            </label>
            <input
              style={inputStyle}
              placeholder="Nombre o razón social"
              value={form.nombre_fiscal}
              onChange={e => setForm(f => ({ ...f, nombre_fiscal: e.target.value }))}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
              NIF / CIF *
            </label>
            <input
              style={inputStyle}
              placeholder="12345678A"
              value={form.nif}
              onChange={e => setForm(f => ({ ...f, nif: e.target.value }))}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
              DIRECCIÓN FISCAL
            </label>
            <input
              style={inputStyle}
              placeholder="Calle, ciudad..."
              value={form.direccion_fiscal}
              onChange={e => setForm(f => ({ ...f, direccion_fiscal: e.target.value }))}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
              EMAIL (opcional)
            </label>
            <input
              style={inputStyle}
              type="email"
              placeholder="cliente@email.com"
              value={form.email_envio}
              onChange={e => setForm(f => ({ ...f, email_envio: e.target.value }))}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={guardando}>
            Generar factura
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── COBRO DETALLE PAGE ──────────────────────────── */
export function CobroDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cobro, setCobro] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ticketTexto, setTicketTexto] = useState(null)
  const [loadingTicket, setLoadingTicket] = useState(false)
  const [mostrarTicket, setMostrarTicket] = useState(false)
  const [mostrarModalFactura, setMostrarModalFactura] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [descargandoPdf, setDescargandoPdf] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await cobrosService.obtener(id)
      setCobro(data)
    } catch (e) {
      toast.error('Cobro no encontrado')
      navigate('/cobros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [id])

  const verTicketTexto = async () => {
    if (ticketTexto) { setMostrarTicket(v => !v); return }
    setLoadingTicket(true)
    try {
      // El endpoint devuelve text/plain
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/cobros/${id}/ticket-texto`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      )
      const txt = await resp.text()
      setTicketTexto(txt)
      setMostrarTicket(true)
    } catch {
      toast.error('Error al obtener el ticket')
    } finally {
      setLoadingTicket(false)
    }
  }

  const descargarFacturaPdf = async () => {
    setDescargandoPdf(true)
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/cobros/${id}/factura-pdf`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      )
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Error al descargar' }))
        toast.error(err.detail || 'Este cobro no tiene factura. Genera una primero.')
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `factura-cobro-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar el PDF')
    } finally {
      setDescargandoPdf(false)
    }
  }

  const confirmarAnulacion = async () => {
    if (!window.confirm('¿Seguro que quieres anular este cobro? Esta acción no se puede deshacer.')) return
    setAnulando(true)
    try {
      await cobrosService.anular(id)
      toast.success('Cobro anulado correctamente')
      cargar()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al anular el cobro')
    } finally {
      setAnulando(false)
    }
  }

  const formatFecha = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-ES', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <>
        <Topbar titulo="Detalle de cobro" />
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={36} />
        </div>
      </>
    )
  }

  if (!cobro) return null

  const tieneDescuento = cobro.descuento_hermano_pct > 0 || cobro.descuento_extra_pct > 0 || cobro.descuento_extra_importe > 0

  return (
    <>
      <Topbar
        titulo={`Cobro #${cobro.id}`}
        subtitulo={formatFecha(cobro.fecha)}
        accion={{ label: '← Volver', variant: 'ghost', onClick: () => navigate('/cobros') }}
      />

      {mostrarModalFactura && (
        <ModalFactura
          cobroId={cobro.id}
          onClose={() => setMostrarModalFactura(false)}
          onGenerada={cargar}
        />
      )}

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Banner anulado */}
        {cobro.anulado && (
          <div style={{
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: 'var(--radius)', padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 10,
            color: 'var(--red-text)', fontWeight: 700,
          }}>
            🚫 Este cobro ha sido anulado
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

          {/* Columna principal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Alumno */}
            <Card>
              <CardHeader>
                <span>🎓</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Alumno</span>
                {cobro.alumno && (
                  <Button
                    size="sm" variant="ghost" style={{ marginLeft: 'auto' }}
                    onClick={() => navigate(`/alumnos/${cobro.alumno.id}`)}
                  >
                    Ver ficha →
                  </Button>
                )}
              </CardHeader>
              <CardBody>
                {cobro.alumno ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar nombre={cobro.alumno.nombre} apellidos={cobro.alumno.apellidos} size={44} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {cobro.alumno.nombre} {cobro.alumno.apellidos}
                      </div>
                      {cobro.alumno.telefono1 && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--grey-mid)', marginTop: 2 }}>
                          {cobro.alumno.telefono1}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <span style={{ color: 'var(--grey-mid)', fontSize: '0.85rem' }}>Alumno no disponible</span>
                )}
              </CardBody>
            </Card>

            {/* Conceptos */}
            <Card>
              <CardHeader>
                <span>📦</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Conceptos cobrados</span>
              </CardHeader>
              <CardBody>
                {(cobro.packs_cobro || []).length === 0 ? (
                  <span style={{ color: 'var(--grey-mid)', fontSize: '0.85rem' }}>Sin conceptos registrados</span>
                ) : (
                  <>
                    {cobro.packs_cobro.map((p, i) => (
                      <LineaTicket
                        key={i}
                        descripcion={p.pack_alumno?.tarifa?.nombre || `Pack #${p.pack_alumno_id}`}
                        importe={p.importe}
                      />
                    ))}

                    {/* Descuentos */}
                    {tieneDescuento && (
                      <div style={{ marginTop: 10, padding: '10px 0', borderTop: '1px dashed var(--grey-border)' }}>
                        {cobro.descuento_hermano_pct > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--grey-mid)', marginBottom: 3 }}>
                            <span>Descuento hermanos ({cobro.descuento_hermano_pct}%)</span>
                            <span style={{ color: 'var(--green-text)' }}>
                              -{((Number(cobro.subtotal) * cobro.descuento_hermano_pct) / 100).toFixed(2)}€
                            </span>
                          </div>
                        )}
                        {cobro.descuento_extra_pct > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--grey-mid)', marginBottom: 3 }}>
                            <span>Descuento extra ({cobro.descuento_extra_pct}%)</span>
                            <span style={{ color: 'var(--green-text)' }}>
                              -{((Number(cobro.subtotal) * cobro.descuento_extra_pct) / 100).toFixed(2)}€
                            </span>
                          </div>
                        )}
                        {cobro.descuento_extra_importe > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--grey-mid)' }}>
                            <span>Descuento fijo</span>
                            <span style={{ color: 'var(--green-text)' }}>-{Number(cobro.descuento_extra_importe).toFixed(2)}€</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Total */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingTop: 12, marginTop: 4,
                      borderTop: '2px solid var(--black)',
                    }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem' }}>TOTAL</span>
                      <span style={{
                        fontWeight: 800, fontSize: '1.25rem',
                        color: cobro.anulado ? 'var(--grey-mid)' : 'var(--orange)',
                        textDecoration: cobro.anulado ? 'line-through' : 'none',
                      }}>
                        {Number(cobro.total).toFixed(2)}€
                      </span>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            {/* Notas */}
            {cobro.notas && (
              <Card>
                <CardHeader>
                  <span>📝</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Notas</span>
                </CardHeader>
                <CardBody>
                  <p style={{ fontSize: '0.88rem', color: 'var(--grey-mid)', margin: 0 }}>{cobro.notas}</p>
                </CardBody>
              </Card>
            )}
          </div>

          {/* Columna lateral */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Formas de pago */}
            <Card>
              <CardHeader>
                <span>💳</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Pago</span>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(cobro.pagos || []).map((p, i) => {
                    const meta = FORMA_LABEL[p.forma_pago] || { label: p.forma_pago, icon: '💰' }
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', background: 'var(--white-off)',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        <span style={{ fontSize: '0.85rem' }}>
                          {meta.icon} {meta.label}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
                          {Number(p.importe).toFixed(2)}€
                        </span>
                      </div>
                    )
                  })}
                  {(!cobro.pagos || cobro.pagos.length === 0) && (
                    <span style={{ color: 'var(--grey-mid)', fontSize: '0.85rem' }}>Sin pagos registrados</span>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Ticket */}
            <Card>
              <CardHeader>
                <span>🧾</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Ticket</span>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  variant="ghost"
                  onClick={verTicketTexto}
                  loading={loadingTicket}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {mostrarTicket ? '🙈 Ocultar ticket' : '👁 Ver ticket (texto)'}
                </Button>

                {mostrarTicket && ticketTexto && (
                  <pre style={{
                    fontFamily: 'monospace', fontSize: '0.7rem',
                    background: 'var(--black)', color: '#39ff14',
                    padding: 14, borderRadius: 'var(--radius-sm)',
                    overflowX: 'auto', whiteSpace: 'pre',
                    maxHeight: 300, overflowY: 'auto',
                    margin: 0,
                  }}>
                    {ticketTexto}
                  </pre>
                )}
              </CardBody>
            </Card>

            {/* Factura */}
            <Card>
              <CardHeader>
                <span>📄</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Factura</span>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!cobro.anulado && (
                  <Button
                    variant="ghost"
                    onClick={() => setMostrarModalFactura(true)}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    🧾 Generar factura
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={descargarFacturaPdf}
                  loading={descargandoPdf}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  ⬇ Descargar PDF
                </Button>
              </CardBody>
            </Card>

            {/* Acciones peligrosas */}
            {!cobro.anulado && (
              <Card accentColor="var(--red)">
                <CardHeader>
                  <span>⚠️</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--red-text)' }}>
                    Zona peligrosa
                  </span>
                </CardHeader>
                <CardBody>
                  <Button
                    variant="danger"
                    onClick={confirmarAnulacion}
                    loading={anulando}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    🚫 Anular cobro
                  </Button>
                  <p style={{
                    fontSize: '0.72rem', color: 'var(--grey-mid)',
                    marginTop: 8, marginBottom: 0, textAlign: 'center',
                  }}>
                    Esta acción no se puede deshacer
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
