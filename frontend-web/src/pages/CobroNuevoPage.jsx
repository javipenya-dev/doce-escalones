import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService, cobrosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import {
  Card, CardHeader, CardBody,
  Button, Avatar, EstadoBadge, TipoBadge, Spinner, Input,
} from '../components/ui'

const FORMAS_PAGO = [
  { key: 'efectivo',      label: 'Efectivo',      icon: '💵' },
  { key: 'tarjeta',       label: 'Tarjeta',       icon: '💳' },
  { key: 'bizum',         label: 'Bizum',         icon: '📱' },
  { key: 'transferencia', label: 'Transferencia', icon: '🏦' },
]

/* ── PASO INDICATOR ──────────────────────────────── */
function PasoIndicator({ paso, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <div style={{
            width: i < paso ? 28 : 28, height: 28,
            borderRadius: '50%',
            background: i < paso ? 'var(--orange)' : i === paso ? 'var(--white)' : 'var(--grey-border)',
            border: i === paso ? '2px solid var(--orange)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700,
            color: i < paso ? 'white' : i === paso ? 'var(--orange)' : 'var(--grey-mid)',
            transition: 'all 0.2s',
          }}>
            {i < paso ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div style={{
              flex: 1, height: 2,
              background: i < paso ? 'var(--orange)' : 'var(--grey-border)',
              transition: 'background 0.2s',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ── COBRO WIZARD PAGE ───────────────────────────── */
export function CobroNuevoPage() {
  const { alumnoId } = useParams()
  const navigate = useNavigate()

  const [alumno, setAlumno] = useState(null)
  const [hermanos, setHermanos] = useState([])
  const [loading, setLoading] = useState(true)
  const [paso, setPaso] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [cobroCreado, setCobroCreado] = useState(null)

  // Estado del cobro
  const [packsSeleccionados, setPacksSeleccionados] = useState([])
  const [descuentoHermano, setDescuentoHermano] = useState(false)
  const [descuentoExtraTipo, setDescuentoExtraTipo] = useState('pct') // 'pct' | 'importe'
  const [descuentoExtraValor, setDescuentoExtraValor] = useState('')
  const [formasPago, setFormasPago] = useState([{ forma: 'efectivo', importe: '' }])

  useEffect(() => {
    const cargar = async () => {
      try {
        const [{ data: a }, { data: h }] = await Promise.all([
          alumnosService.obtener(alumnoId),
          alumnosService.obtenerHermanos(alumnoId),
        ])
        setAlumno(a)
        setHermanos(h)
        // Autodetectar descuento hermano si tiene hermanos activos
        if (h.length > 0) setDescuentoHermano(true)
      } catch {
        toast.error('No se pudo cargar el alumno')
        navigate('/cobros')
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [alumnoId])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Spinner size={40} />
    </div>
  )

  const packsActivos = alumno?.packs?.filter(p => p.activo) || []

  // ── Cálculos ─────────────────────────────────────
  const subtotal = packsSeleccionados.reduce((sum, pack) => {
    return sum + parseFloat(pack.tarifa?.precio_base || 0)
  }, 0)

  const descHermanoPct = descuentoHermano && hermanos.length > 0 ? 10 : 0
  const descHermanoEur = subtotal * descHermanoPct / 100

  const descExtraEur = descuentoExtraTipo === 'pct'
    ? (subtotal - descHermanoEur) * (parseFloat(descuentoExtraValor) || 0) / 100
    : parseFloat(descuentoExtraValor) || 0
  const descExtraPct = descuentoExtraTipo === 'pct' ? parseFloat(descuentoExtraValor) || 0 : 0

  const total = Math.max(0, subtotal - descHermanoEur - descExtraEur)

  const totalPagado = formasPago.reduce((s, f) => s + (parseFloat(f.importe) || 0), 0)
  const diferencia = total - totalPagado

  const pasoValido = () => {
    if (paso === 0) return packsSeleccionados.length > 0
    if (paso === 1) return true // Descuentos siempre válidos
    if (paso === 2) return Math.abs(diferencia) < 0.01
    return true
  }

  // ── Handlers formas de pago ───────────────────────
  const addFormaPago = () => {
    setFormasPago(f => [...f, { forma: 'efectivo', importe: '' }])
  }

  const updateFormaPago = (idx, campo, valor) => {
    setFormasPago(f => f.map((item, i) => i === idx ? { ...item, [campo]: valor } : item))
  }

  const removeFormaPago = (idx) => {
    if (formasPago.length === 1) return
    setFormasPago(f => f.filter((_, i) => i !== idx))
  }

  const distribuirTotal = () => {
    // Poner todo el total en la primera forma de pago
    setFormasPago(f => f.map((item, i) => i === 0 ? { ...item, importe: total.toFixed(2) } : { ...item, importe: '' }))
  }

  // ── Confirmar cobro ───────────────────────────────
  const handleConfirmar = async () => {
    setGuardando(true)
    try {
      const payload = {
        alumno_id: parseInt(alumnoId),
        packs_ids: packsSeleccionados.map(p => p.id),
        descuento_hermano: descuentoHermano && hermanos.length > 0,
        descuento_extra_pct: descuentoExtraTipo === 'pct' ? parseFloat(descuentoExtraValor) || 0 : 0,
        descuento_extra_importe: descuentoExtraTipo === 'importe' ? parseFloat(descuentoExtraValor) || 0 : 0,
        formas_pago: formasPago
          .filter(f => parseFloat(f.importe) > 0)
          .map(f => ({ forma: f.forma, importe: parseFloat(f.importe) })),
      }
      const { data } = await cobrosService.crear(payload)
      setCobroCreado(data)
      setPaso(4)
      toast.success('¡Cobro registrado correctamente! 🎉')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar el cobro')
    } finally {
      setGuardando(false)
    }
  }

  const PASOS = ['Packs', 'Descuentos', 'Pago', 'Confirmar']

  // ── RENDER ────────────────────────────────────────
  return (
    <>
      <Topbar
        titulo="Nuevo cobro"
        subtitulo={alumno ? `${alumno.nombre} ${alumno.apellidos}` : ''}
      />

      <div style={{ padding: '24px 32px', maxWidth: 680 }}>

        {/* Cabecera alumno */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 20,
        }}>
          <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={36} />
          <div>
            <div style={{ fontWeight: 700 }}>{alumno.nombre} {alumno.apellidos}</div>
            {hermanos.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--orange)', fontWeight: 600 }}>
                👨‍👧‍👦 Tiene hermanos — descuento 10% disponible
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '1.4rem', fontWeight: 700, color: 'var(--orange)' }}>
              {total.toFixed(2)}€
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', textAlign: 'right' }}>total</div>
          </div>
        </div>

        {/* Éxito */}
        {paso === 4 && cobroCreado && (
          <Card>
            <CardBody>
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
                <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 8 }}>Cobro registrado</h2>
                <p style={{ color: 'var(--grey-mid)', marginBottom: 4 }}>
                  Total cobrado: <strong style={{ color: 'var(--black)' }}>{cobroCreado.total?.toFixed(2)}€</strong>
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--grey-light)', marginBottom: 24 }}>
                  Cobro nº {cobroCreado.id}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Button variant="primary" onClick={() => window.open(cobrosService.ticketPdf(cobroCreado.id), '_blank')}>
                    🖨️ Imprimir ticket
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(`/alumnos/${alumnoId}`)}>
                    Ver ficha del alumno
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/cobros')}>
                    Ver todos los cobros
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Wizard */}
        {paso < 4 && (
          <Card>
            <CardHeader>
              <span>💳</span>
              <span style={{ fontWeight: 700 }}>
                Paso {paso + 1} — {PASOS[paso]}
              </span>
            </CardHeader>
            <CardBody>
              <PasoIndicator paso={paso} total={PASOS.length} />

              {/* ── PASO 0: Seleccionar packs ─────────────── */}
              {paso === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', marginBottom: 8 }}>
                    Selecciona los packs que se incluyen en este cobro:
                  </p>
                  {packsActivos.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.85rem' }}>
                      Este alumno no tiene packs activos asignados
                    </div>
                  ) : (
                    packsActivos.map(pack => {
                      const sel = packsSeleccionados.some(p => p.id === pack.id)
                      return (
                        <div
                          key={pack.id}
                          onClick={() => setPacksSeleccionados(prev =>
                            sel ? prev.filter(p => p.id !== pack.id) : [...prev, pack]
                          )}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                            border: `2px solid ${sel ? 'var(--orange)' : 'var(--grey-border)'}`,
                            background: sel ? 'var(--orange-pale)' : 'var(--white)',
                            cursor: 'pointer', transition: 'all var(--transition)',
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            border: `2px solid ${sel ? 'var(--orange)' : 'var(--grey-light)'}`,
                            background: sel ? 'var(--orange)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.65rem', color: 'white', flexShrink: 0,
                          }}>
                            {sel && '✓'}
                          </div>
                          <TipoBadge categoria={pack.tarifa?.categoria} nombre={pack.tarifa?.categoria?.toUpperCase() || '—'} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{pack.tarifa?.nombre || 'Pack'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)' }}>
                              {pack.tarifa?.horas_semanales ? `${pack.tarifa.horas_semanales}h/semana` : pack.tarifa?.num_sesiones ? `${pack.tarifa.num_sesiones} sesiones` : ''}
                            </div>
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)' }}>
                            {parseFloat(pack.tarifa?.precio_base || 0).toFixed(2)}€
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* ── PASO 1: Descuentos ────────────────────── */}
              {paso === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Descuento hermano */}
                  <div style={{
                    padding: '14px', borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${descuentoHermano && hermanos.length > 0 ? 'var(--orange)' : 'var(--grey-border)'}`,
                    background: descuentoHermano && hermanos.length > 0 ? 'var(--orange-pale)' : 'var(--white)',
                    opacity: hermanos.length === 0 ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={descuentoHermano && hermanos.length > 0}
                        onChange={e => setDescuentoHermano(e.target.checked)}
                        disabled={hermanos.length === 0}
                        style={{ width: 16, height: 16, accentColor: 'var(--orange)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          👨‍👧‍👦 Descuento hermano — 10%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)' }}>
                          {hermanos.length > 0
                            ? `Hermanos: ${hermanos.map(h => h.nombre).join(', ')}`
                            : 'Sin hermanos vinculados'}
                        </div>
                      </div>
                      {descuentoHermano && hermanos.length > 0 && (
                        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--green)' }}>
                          -{descHermanoEur.toFixed(2)}€
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Descuento adicional */}
                  <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--grey-border)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 10 }}>
                      Descuento adicional (opcional)
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        value={descuentoExtraTipo}
                        onChange={e => { setDescuentoExtraTipo(e.target.value); setDescuentoExtraValor('') }}
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                          padding: '8px 10px', border: '1px solid var(--grey-border)',
                          borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer',
                        }}
                      >
                        <option value="pct">Porcentaje (%)</option>
                        <option value="importe">Importe fijo (€)</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        max={descuentoExtraTipo === 'pct' ? 100 : undefined}
                        step="0.01"
                        placeholder={descuentoExtraTipo === 'pct' ? 'Ej: 5' : 'Ej: 10'}
                        value={descuentoExtraValor}
                        onChange={e => setDescuentoExtraValor(e.target.value)}
                        style={{
                          flex: 1, fontFamily: 'DM Mono, monospace', fontSize: '0.9rem',
                          padding: '8px 12px', border: '1px solid var(--grey-border)',
                          borderRadius: 'var(--radius-sm)', outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                        onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                      />
                      {descExtraEur > 0 && (
                        <span style={{
                          display: 'flex', alignItems: 'center',
                          fontFamily: 'DM Mono, monospace', fontWeight: 700,
                          color: 'var(--green)', fontSize: '0.9rem', padding: '0 8px',
                        }}>
                          -{descExtraEur.toFixed(2)}€
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resumen */}
                  <div style={{
                    padding: '14px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--white-off)', border: '1px solid var(--grey-border)',
                    fontFamily: 'DM Mono, monospace', fontSize: '0.82rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--grey-mid)' }}>
                      <span>Subtotal</span><span>{subtotal.toFixed(2)}€</span>
                    </div>
                    {descHermanoEur > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--green)' }}>
                        <span>Dto. hermano (10%)</span><span>-{descHermanoEur.toFixed(2)}€</span>
                      </div>
                    )}
                    {descExtraEur > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--green)' }}>
                        <span>Dto. adicional {descuentoExtraTipo === 'pct' ? `(${descuentoExtraValor}%)` : ''}</span>
                        <span>-{descExtraEur.toFixed(2)}€</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--grey-border)', paddingTop: 8, fontWeight: 700, fontSize: '1rem', color: 'var(--orange)' }}>
                      <span>Total</span><span>{total.toFixed(2)}€</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PASO 2: Forma de pago ─────────────────── */}
              {paso === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>
                      Total a cobrar: <strong style={{ color: 'var(--orange)', fontFamily: 'DM Mono, monospace' }}>{total.toFixed(2)}€</strong>
                    </p>
                    <Button size="sm" variant="ghost" onClick={distribuirTotal}>
                      Poner todo en la primera forma
                    </Button>
                  </div>

                  {formasPago.map((fp, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {FORMAS_PAGO.map(f => (
                          <button
                            key={f.key}
                            onClick={() => updateFormaPago(idx, 'forma', f.key)}
                            style={{
                              padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                              border: `2px solid ${fp.forma === f.key ? 'var(--orange)' : 'var(--grey-border)'}`,
                              background: fp.forma === f.key ? 'var(--orange-pale)' : 'white',
                              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-body)',
                              fontWeight: fp.forma === f.key ? 700 : 400,
                              color: fp.forma === f.key ? 'var(--orange-dark)' : 'var(--grey-mid)',
                              transition: 'all var(--transition)',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            {f.icon} {f.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={fp.importe}
                        onChange={e => updateFormaPago(idx, 'importe', e.target.value)}
                        style={{
                          width: 100, fontFamily: 'DM Mono, monospace', fontSize: '0.95rem',
                          padding: '8px 10px', border: '1px solid var(--grey-border)',
                          borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'right',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                        onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                      />
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', color: 'var(--grey-mid)' }}>€</span>
                      {formasPago.length > 1 && (
                        <button onClick={() => removeFormaPago(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grey-light)', fontSize: '1rem' }}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  <Button size="sm" variant="ghost" onClick={addFormaPago}>
                    + Añadir otra forma de pago (cobro mixto)
                  </Button>

                  {/* Diferencia */}
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    background: Math.abs(diferencia) < 0.01 ? 'var(--green-bg)' : 'var(--red-bg)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontFamily: 'DM Mono, monospace', fontSize: '0.85rem',
                  }}>
                    <span style={{ color: Math.abs(diferencia) < 0.01 ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600 }}>
                      {Math.abs(diferencia) < 0.01 ? '✓ Cuadra exacto' : diferencia > 0 ? `Faltan ${diferencia.toFixed(2)}€` : `Sobran ${Math.abs(diferencia).toFixed(2)}€`}
                    </span>
                    <span style={{ fontWeight: 700 }}>Pagado: {totalPagado.toFixed(2)}€ / {total.toFixed(2)}€</span>
                  </div>
                </div>
              )}

              {/* ── PASO 3: Confirmar ─────────────────────── */}
              {paso === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>
                    Revisa el resumen antes de confirmar:
                  </p>

                  {/* Packs */}
                  {packsSeleccionados.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid var(--grey-border)' }}>
                      <span>{p.tarifa?.nombre}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace' }}>{parseFloat(p.tarifa?.precio_base || 0).toFixed(2)}€</span>
                    </div>
                  ))}

                  {/* Descuentos */}
                  {descHermanoEur > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--green)' }}>
                      <span>Dto. hermano (10%)</span>
                      <span style={{ fontFamily: 'DM Mono, monospace' }}>-{descHermanoEur.toFixed(2)}€</span>
                    </div>
                  )}
                  {descExtraEur > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--green)' }}>
                      <span>Dto. adicional</span>
                      <span style={{ fontFamily: 'DM Mono, monospace' }}>-{descExtraEur.toFixed(2)}€</span>
                    </div>
                  )}

                  {/* Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', color: 'var(--orange)', padding: '8px 0', borderTop: '2px solid var(--grey-border)' }}>
                    <span>TOTAL</span>
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>{total.toFixed(2)}€</span>
                  </div>

                  {/* Formas de pago */}
                  <div style={{ fontSize: '0.82rem', color: 'var(--grey-mid)' }}>
                    {formasPago.filter(f => parseFloat(f.importe) > 0).map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>{FORMAS_PAGO.find(fp => fp.key === f.forma)?.icon} {FORMAS_PAGO.find(fp => fp.key === f.forma)?.label}</span>
                        <span style={{ fontFamily: 'DM Mono, monospace' }}>{parseFloat(f.importe).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Navegación */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <Button variant="ghost" onClick={() => paso === 0 ? navigate(-1) : setPaso(p => p - 1)}>
                  ← {paso === 0 ? 'Cancelar' : 'Atrás'}
                </Button>
                {paso < 3 ? (
                  <Button
                    variant="primary"
                    onClick={() => setPaso(p => p + 1)}
                    disabled={!pasoValido()}
                  >
                    Siguiente →
                  </Button>
                ) : (
                  <Button variant="primary" loading={guardando} onClick={handleConfirmar}>
                    ✓ Confirmar cobro
                  </Button>
                )}
              </div>

            </CardBody>
          </Card>
        )}
      </div>
    </>
  )
}
