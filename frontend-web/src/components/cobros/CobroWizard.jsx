import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService, cobrosService } from '../../utils/api'
import { Topbar } from '../layout/Topbar'
import { Button, Avatar, EstadoBadge, Spinner, Card, CardHeader, CardBody } from '../ui'

const FORMAS_PAGO = [
  { key: 'efectivo',      label: 'Efectivo',      icon: '💵' },
  { key: 'tarjeta',       label: 'Tarjeta',        icon: '💳' },
  { key: 'bizum',         label: 'Bizum',          icon: '📱' },
  { key: 'transferencia', label: 'Transferencia',  icon: '🏦' },
]

const PASOS = ['Alumno y packs', 'Descuentos', 'Forma de pago', 'Confirmar']

export function CobroWizard() {
  const { alumnoId } = useParams()
  const navigate = useNavigate()

  const [paso, setPaso] = useState(0)
  const [alumno, setAlumno] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [hermanos, setHermanos] = useState([])

  // Estado del cobro
  const [packsSeleccionados, setPacksSeleccionados] = useState([])
  const [descuentoHermano, setDescuentoHermano] = useState(false)
  const [descuentoExtraTipo, setDescuentoExtraTipo] = useState('pct')  // 'pct' | 'importe'
  const [descuentoExtraValor, setDescuentoExtraValor] = useState('')
  const [formasPago, setFormasPago] = useState([{ forma: 'efectivo', importe: '' }])
  const [notas, setNotas] = useState('')

  useEffect(() => {
    if (!alumnoId) return
    Promise.all([
      alumnosService.obtener(alumnoId),
      alumnosService.obtenerHermanos(alumnoId),
    ]).then(([{ data: a }, { data: h }]) => {
      setAlumno(a)
      setHermanos(h)
      setDescuentoHermano(h.length > 0)
      // Seleccionar todos los packs activos por defecto
      const packsActivos = (a.packs || []).filter(p => p.activo)
      setPacksSeleccionados(packsActivos.map(p => p.id))
    }).catch(() => toast.error('No se pudo cargar el alumno'))
      .finally(() => setLoading(false))
  }, [alumnoId])

  /* ── Cálculos ────────────────────────────────── */
  const packsActivos = (alumno?.packs || []).filter(p => p.activo)

  const subtotal = packsActivos
    .filter(p => packsSeleccionados.includes(p.id))
    .reduce((s, p) => s + (p.tarifa?.precio_base || 0), 0)

  const descuentoHermanoImporte = descuentoHermano ? subtotal * 0.10 : 0

  const descuentoExtraImporte = (() => {
    const v = parseFloat(descuentoExtraValor) || 0
    if (descuentoExtraTipo === 'pct') return (subtotal - descuentoHermanoImporte) * (v / 100)
    return v
  })()

  const total = Math.max(0, subtotal - descuentoHermanoImporte - descuentoExtraImporte)

  const totalPagado = formasPago.reduce((s, f) => s + (parseFloat(f.importe) || 0), 0)
  const diferencia = totalPagado - total
  const pagoExacto = Math.abs(diferencia) < 0.01

  /* ── Formas de pago ──────────────────────────── */
  const addFormaPago = () => {
    const usadas = formasPago.map(f => f.forma)
    const disponible = FORMAS_PAGO.find(f => !usadas.includes(f.key))
    if (disponible) setFormasPago(fp => [...fp, { forma: disponible.key, importe: '' }])
  }

  const updateFormaPago = (i, campo, val) => {
    setFormasPago(fp => fp.map((f, idx) => idx === i ? { ...f, [campo]: val } : f))
  }

  const removeFormaPago = (i) => {
    if (formasPago.length > 1) setFormasPago(fp => fp.filter((_, idx) => idx !== i))
  }

  // Distribuir el total en la primera forma de pago automáticamente
  useEffect(() => {
    if (formasPago.length === 1 && total > 0) {
      setFormasPago([{ ...formasPago[0], importe: total.toFixed(2) }])
    }
  }, [total])

  /* ── Guardar cobro ───────────────────────────── */
  const handleGuardar = async () => {
    if (!pagoExacto) {
      toast.error(`El total pagado (${totalPagado.toFixed(2)}€) no coincide con el total (${total.toFixed(2)}€)`)
      return
    }
    if (packsSeleccionados.length === 0) {
      toast.error('Selecciona al menos un pack')
      return
    }

    setGuardando(true)
    try {
      const payload = {
        alumno_id: parseInt(alumnoId),
        packs_ids: packsSeleccionados,
        descuento_hermano: descuentoHermano,
        descuento_extra_pct:     descuentoExtraTipo === 'pct'    ? parseFloat(descuentoExtraValor) || 0 : 0,
        descuento_extra_importe: descuentoExtraTipo === 'importe' ? parseFloat(descuentoExtraValor) || 0 : 0,
        formas_pago: formasPago
          .filter(f => parseFloat(f.importe) > 0)
          .map(f => ({ forma: f.forma, importe: parseFloat(f.importe) })),
        notas: notas || null,
      }
      const { data } = await cobrosService.crear(payload)
      toast.success('Cobro registrado correctamente 💳')
      navigate(`/cobros/${data.id}`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar el cobro')
    } finally {
      setGuardando(false)
    }
  }

  /* ── Render ──────────────────────────────────── */
  if (loading) return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <Spinner size={36} />
    </div>
  )

  return (
    <>
      <Topbar
        titulo="Nuevo cobro"
        subtitulo={alumno ? `${alumno.nombre} ${alumno.apellidos}` : ''}
      />

      <div style={{ padding: '24px 32px', maxWidth: 720 }}>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28, background: 'var(--white)', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {PASOS.map((p, i) => (
            <div
              key={i}
              onClick={() => i < paso && setPaso(i)}
              style={{
                flex: 1, padding: '12px 8px', textAlign: 'center',
                fontSize: '0.78rem', fontWeight: 600,
                background: i === paso ? 'var(--orange)' : i < paso ? 'var(--orange-pale)' : 'var(--white)',
                color: i === paso ? 'white' : i < paso ? 'var(--orange-dark)' : 'var(--grey-light)',
                cursor: i < paso ? 'pointer' : 'default',
                borderRight: i < PASOS.length - 1 ? '1px solid var(--grey-border)' : 'none',
                transition: 'all var(--transition)',
              }}
            >
              <span style={{ marginRight: 5 }}>{i < paso ? '✓' : i + 1}</span>
              {p}
            </div>
          ))}
        </div>

        {/* Resumen total siempre visible */}
        <div style={{
          background: 'var(--black)', borderRadius: 'var(--radius)',
          padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          {alumno && <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={36} />}
          <div>
            <div style={{ color: 'var(--grey-light)', fontSize: '0.75rem' }}>Total a cobrar</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '1.6rem', fontWeight: 700, color: 'var(--orange)' }}>
              {total.toFixed(2)}€
            </div>
          </div>
          {descuentoHermanoImporte > 0 && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ color: 'var(--grey-light)', fontSize: '0.72rem' }}>Subtotal</div>
              <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--white)', fontSize: '0.9rem', textDecoration: 'line-through', opacity: 0.6 }}>
                {subtotal.toFixed(2)}€
              </div>
            </div>
          )}
        </div>

        {/* ── PASO 1: Packs ── */}
        {paso === 0 && (
          <Card>
            <CardHeader>
              <span>📦</span>
              <span style={{ fontWeight: 700 }}>Selecciona los packs a cobrar</span>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {packsActivos.length === 0 ? (
                <div style={{ padding: 24, color: 'var(--grey-mid)', textAlign: 'center', fontSize: '0.85rem' }}>
                  Este alumno no tiene packs activos
                </div>
              ) : (
                packsActivos.map((pack) => {
                  const sel = packsSeleccionados.includes(pack.id)
                  return (
                    <div
                      key={pack.id}
                      onClick={() => setPacksSeleccionados(ps =>
                        sel ? ps.filter(id => id !== pack.id) : [...ps, pack.id]
                      )}
                      style={{
                        padding: '14px 20px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 14,
                        borderBottom: '1px solid var(--white-off)',
                        background: sel ? 'var(--orange-pale)' : 'var(--white)',
                        transition: 'background var(--transition)',
                      }}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 5,
                        border: `2px solid ${sel ? 'var(--orange)' : 'var(--grey-border)'}`,
                        background: sel ? 'var(--orange)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all var(--transition)',
                      }}>
                        {sel && <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{pack.tarifa?.nombre || 'Pack'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: 2 }}>
                          {pack.tarifa?.categoria === 'sesion'
                            ? `${pack.tarifa?.num_sesiones || '?'} sesiones · ${pack.tarifa?.duracion_sesion_min || '?'}min`
                            : `${pack.tarifa?.horas_semanales || '?'}h/semana`}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)', fontSize: '1rem' }}>
                        {pack.tarifa?.precio_base?.toFixed(2)}€
                      </div>
                    </div>
                  )
                })
              )}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--grey-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: '1rem' }}>
                  Subtotal: {subtotal.toFixed(2)}€
                </span>
                <Button onClick={() => setPaso(1)} disabled={packsSeleccionados.length === 0}>
                  Siguiente →
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── PASO 2: Descuentos ── */}
        {paso === 1 && (
          <Card>
            <CardHeader>
              <span>🏷️</span>
              <span style={{ fontWeight: 700 }}>Descuentos</span>
            </CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Descuento hermano */}
              <div style={{
                padding: '14px 16px', borderRadius: 'var(--radius-sm)',
                border: `2px solid ${descuentoHermano ? 'var(--orange)' : 'var(--grey-border)'}`,
                background: descuentoHermano ? 'var(--orange-pale)' : 'var(--white)',
                cursor: hermanos.length > 0 ? 'pointer' : 'not-allowed',
                opacity: hermanos.length === 0 ? 0.5 : 1,
                transition: 'all var(--transition)',
              }}
                onClick={() => hermanos.length > 0 && setDescuentoHermano(d => !d)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>👨‍👧‍👦</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Descuento hermanos</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: 1 }}>
                      {hermanos.length === 0
                        ? 'No hay hermanos vinculados'
                        : `${hermanos.map(h => h.nombre).join(', ')} · -10%`}
                    </div>
                  </div>
                  {descuentoHermano && (
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)' }}>
                      -{descuentoHermanoImporte.toFixed(2)}€
                    </span>
                  )}
                </div>
              </div>

              {/* Descuento adicional */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--grey-mid)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Descuento adicional (opcional)
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    {[{ key: 'pct', label: '%' }, { key: 'importe', label: '€' }].map(({ key, label }) => (
                      <button key={key}
                        onClick={() => { setDescuentoExtraTipo(key); setDescuentoExtraValor('') }}
                        style={{
                          padding: '8px 16px', border: 'none', cursor: 'pointer',
                          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem',
                          background: descuentoExtraTipo === key ? 'var(--orange)' : 'var(--white)',
                          color: descuentoExtraTipo === key ? 'white' : 'var(--grey-mid)',
                          transition: 'all var(--transition)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" min="0"
                    placeholder={descuentoExtraTipo === 'pct' ? 'Ej: 5' : 'Ej: 10.00'}
                    value={descuentoExtraValor}
                    onChange={e => setDescuentoExtraValor(e.target.value)}
                    style={{
                      flex: 1, fontFamily: 'DM Mono, monospace', fontSize: '0.95rem',
                      padding: '8px 12px', border: '1px solid var(--grey-border)',
                      borderRadius: 'var(--radius-sm)', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                    onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                  />
                  {descuentoExtraImporte > 0 && (
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                      -{descuentoExtraImporte.toFixed(2)}€
                    </span>
                  )}
                </div>
              </div>

              {/* Resumen descuentos */}
              <div style={{ background: 'var(--white-off)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: '0.82rem' }}>
                <LineResumen label="Subtotal"          valor={subtotal}                  />
                {descuentoHermanoImporte > 0 && <LineResumen label="Dto. hermanos (10%)" valor={-descuentoHermanoImporte} color="var(--green-text)" />}
                {descuentoExtraImporte > 0    && <LineResumen label={`Dto. adicional (${descuentoExtraTipo === 'pct' ? descuentoExtraValor + '%' : descuentoExtraValor + '€'})`} valor={-descuentoExtraImporte} color="var(--green-text)" />}
                <div style={{ borderTop: '1px solid var(--grey-border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1rem' }}>
                  <span>Total</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--orange)' }}>{total.toFixed(2)}€</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setPaso(0)}>← Atrás</Button>
                <Button onClick={() => setPaso(2)}>Siguiente →</Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── PASO 3: Forma de pago ── */}
        {paso === 2 && (
          <Card>
            <CardHeader>
              <span>💳</span>
              <span style={{ fontWeight: 700 }}>Forma de pago</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)' }}>
                Total: {total.toFixed(2)}€
              </span>
            </CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {formasPago.map((fp, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select
                    value={fp.forma}
                    onChange={e => updateFormaPago(i, 'forma', e.target.value)}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                      padding: '8px 10px', border: '1px solid var(--grey-border)',
                      borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer', width: 160,
                    }}
                  >
                    {FORMAS_PAGO.map(f => (
                      <option key={f.key} value={f.key}
                        disabled={formasPago.some((fp2, j) => j !== i && fp2.forma === f.key)}
                      >
                        {f.icon} {f.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Importe"
                    value={fp.importe}
                    onChange={e => updateFormaPago(i, 'importe', e.target.value)}
                    style={{
                      flex: 1, fontFamily: 'DM Mono, monospace', fontSize: '0.95rem',
                      padding: '8px 12px', border: '1px solid var(--grey-border)',
                      borderRadius: 'var(--radius-sm)', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                    onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                  />
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--grey-mid)', width: 16 }}>€</span>
                  {formasPago.length > 1 && (
                    <button onClick={() => removeFormaPago(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grey-light)', fontSize: '1rem' }}>✕</button>
                  )}
                </div>
              ))}

              {formasPago.length < 4 && (
                <button onClick={addFormaPago} style={{
                  background: 'none', border: '1px dashed var(--grey-border)', borderRadius: 'var(--radius-sm)',
                  padding: '8px', cursor: 'pointer', color: 'var(--grey-mid)', fontSize: '0.82rem',
                  fontFamily: 'var(--font-body)', transition: 'all var(--transition)',
                }}>
                  ➕ Añadir otra forma de pago
                </button>
              )}

              {/* Indicador diferencia */}
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: pagoExacto ? 'var(--green-bg)' : 'var(--red-bg)',
                display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600,
              }}>
                <span style={{ color: pagoExacto ? 'var(--green-text)' : 'var(--red-text)' }}>
                  {pagoExacto ? '✅ Pago cuadrado' : diferencia > 0 ? `⚠️ Sobra ${diferencia.toFixed(2)}€` : `⚠️ Faltan ${Math.abs(diferencia).toFixed(2)}€`}
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', color: pagoExacto ? 'var(--green-text)' : 'var(--red-text)' }}>
                  {totalPagado.toFixed(2)}€ / {total.toFixed(2)}€
                </span>
              </div>

              {/* Notas */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 5 }}>
                  Notas (opcional)
                </label>
                <textarea
                  rows={2} value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Ej: Pago mensualidad junio"
                  style={{
                    width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                    padding: '8px 12px', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setPaso(1)}>← Atrás</Button>
                <Button onClick={() => setPaso(3)} disabled={!pagoExacto}>Revisar →</Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── PASO 4: Confirmar ── */}
        {paso === 3 && (
          <Card>
            <CardHeader>
              <span>🧾</span>
              <span style={{ fontWeight: 700 }}>Resumen del cobro</span>
            </CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Alumno */}
              {alumno && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--white-off)', borderRadius: 'var(--radius-sm)' }}>
                  <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={36} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{alumno.nombre} {alumno.apellidos}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)' }}>{alumno.email || alumno.telefono1 || ''}</div>
                  </div>
                </div>
              )}

              {/* Packs */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Packs incluidos</div>
                {packsActivos.filter(p => packsSeleccionados.includes(p.id)).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.85rem', borderBottom: '1px solid var(--white-off)' }}>
                    <span>{p.tarifa?.nombre}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{p.tarifa?.precio_base?.toFixed(2)}€</span>
                  </div>
                ))}
              </div>

              {/* Totales */}
              <div style={{ background: 'var(--white-off)', borderRadius: 'var(--radius-sm)', padding: '14px 16px' }}>
                <LineResumen label="Subtotal" valor={subtotal} />
                {descuentoHermanoImporte > 0 && <LineResumen label="Dto. hermanos (10%)" valor={-descuentoHermanoImporte} color="var(--green-text)" />}
                {descuentoExtraImporte > 0    && <LineResumen label="Dto. adicional" valor={-descuentoExtraImporte} color="var(--green-text)" />}
                <div style={{ borderTop: '2px solid var(--grey-border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem' }}>
                  <span>TOTAL</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--orange)' }}>{total.toFixed(2)}€</span>
                </div>
              </div>

              {/* Formas de pago */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Forma de pago</div>
                {formasPago.filter(f => parseFloat(f.importe) > 0).map((f, i) => {
                  const cfg = FORMAS_PAGO.find(fp => fp.key === f.forma)
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.85rem' }}>
                      <span>{cfg?.icon} {cfg?.label}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{parseFloat(f.importe).toFixed(2)}€</span>
                    </div>
                  )
                })}
              </div>

              {notas && (
                <div style={{ fontSize: '0.82rem', color: 'var(--grey-mid)', fontStyle: 'italic' }}>
                  📝 {notas}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <Button variant="ghost" onClick={() => setPaso(2)}>← Atrás</Button>
                <Button loading={guardando} onClick={handleGuardar} size="lg">
                  💳 Confirmar y cobrar
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  )
}

function LineResumen({ label, valor, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.85rem' }}>
      <span style={{ color: color || 'var(--black)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: color || 'var(--black)' }}>
        {valor >= 0 ? '' : '-'}{Math.abs(valor).toFixed(2)}€
      </span>
    </div>
  )
}
