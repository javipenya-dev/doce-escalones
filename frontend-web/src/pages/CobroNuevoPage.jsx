import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService, cobrosService, tarifasService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { AsignarPackModal } from '../components/AsignarPackModal'
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

function PasoIndicator({ paso, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
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

export function CobroNuevoPage() {
  const { alumnoId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const soloConceptos      = searchParams.get('solo_conceptos') === '1'
  const descripcionInicial = searchParams.get('descripcion') || ''
  const importeInicial     = searchParams.get('importe') || ''
  const horasCubiertasIni  = searchParams.get('horas_cubiertas') || ''

  const [alumno, setAlumno] = useState(null)
  const [hermanos, setHermanos] = useState([])
  const [loading, setLoading] = useState(true)
  const [paso, setPaso] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [cobroCreado, setCobroCreado] = useState(null)
  const [reimprimiendo, setReimprimiendo] = useState(false)
  const [modalPack, setModalPack] = useState(false)
  const [tarifasCatalogo, setTarifasCatalogo] = useState([])

  const [fechaOperacion, setFechaOperacion] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })

  // packsSeleccionados = [{ ...pack, cantidad: N }]
  const [packsSeleccionados, setPacksSeleccionados] = useState([])
  const [conceptosExtra, setConceptosExtra] = useState(
    soloConceptos && descripcionInicial
      ? [{
          descripcion: descripcionInicial,
          importe: importeInicial,
          cantidad: 1,
          horas_cubiertas: horasCubiertasIni,
          es_tasa_examen: false,
        }]
      : []
  )
  const [descuentoHermano, setDescuentoHermano] = useState(false)
  const [descuentoExtraTipo, setDescuentoExtraTipo] = useState('pct')
  const [descuentoExtraValor, setDescuentoExtraValor] = useState('')
  const [formasPago, setFormasPago] = useState([{ forma: 'efectivo', importe: '' }])
  const [notas, setNotas] = useState('')

  const cargarAlumno = async () => {
    try {
      const [{ data: a }, { data: h }] = await Promise.all([
        alumnosService.obtener(alumnoId),
        alumnosService.obtenerHermanos(alumnoId),
      ])
      setAlumno(a)
      setHermanos(h)
      if (h.length > 0 && !soloConceptos) setDescuentoHermano(true)
    } catch {
      toast.error('No se pudo cargar el alumno')
      navigate('/cobros')
    }
  }

  useEffect(() => {
    const cargarTarifas = async () => {
      try {
        const { data } = await tarifasService.listar({})
        setTarifasCatalogo(data)
      } catch (e) {
        console.error('Error cargando tarifas:', e)
      }
    }
    cargarTarifas()
  }, [])

  useEffect(() => {
    const cargar = async () => {
      await cargarAlumno()
      setLoading(false)
    }
    cargar()
  }, [alumnoId])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Spinner size={40} />
    </div>
  )

  const packsActivos    = alumno?.packs?.filter(p => p.activo && p.tarifa_id) || []
  const packsPendientes = alumno?.packs?.filter(p => p.activo && !p.tarifa_id) || []

  // ── Cálculos ─────────────────────────────────────
  // Subtotal packs = Σ (precio_unit × cantidad)
  const subtotal = packsSeleccionados.reduce((sum, p) => {
    const cant = parseInt(p.cantidad) || 1
    return sum + parseFloat(p.tarifa?.precio_base || 0) * cant
  }, 0)

  const descHermanoPct = descuentoHermano && hermanos.length > 0 ? 10 : 0
  const descHermanoEur = subtotal * descHermanoPct / 100

  const descExtraEur = descuentoExtraTipo === 'pct'
    ? (subtotal - descHermanoEur) * (parseFloat(descuentoExtraValor) || 0) / 100
    : parseFloat(descuentoExtraValor) || 0

  const totalPacks = Math.max(0, subtotal - descHermanoEur - descExtraEur)

  const conceptosValidos = conceptosExtra.filter(
    c => (c.descripcion || '').trim() && parseFloat(c.importe) > 0
  )
  const conceptosTotal = conceptosValidos.reduce((s, c) => {
    const cant = parseInt(c.cantidad) || 1
    return s + cant * (parseFloat(c.importe) || 0)
  }, 0)

  const total = totalPacks + conceptosTotal

  const totalPagado = formasPago.reduce((s, f) => s + (parseFloat(f.importe) || 0), 0)
  const diferencia = total - totalPagado

  const pasoValido = () => {
    if (paso === 0) {
      if (soloConceptos) return conceptosValidos.length > 0
      return packsSeleccionados.length > 0 || conceptosValidos.length > 0
    }
    if (paso === 1) return true
    if (paso === 2) return Math.abs(diferencia) < 0.01
    return true
  }

  // ── Handlers packs ────────────────────────────────
  const togglePack = (pack) => {
    const sel = packsSeleccionados.some(p => p.id === pack.id)
    setPacksSeleccionados(prev =>
      sel
        ? prev.filter(p => p.id !== pack.id)
        : [...prev, { ...pack, cantidad: 1 }]
    )
  }

  const updateCantidadPack = (packId, valor) => {
    setPacksSeleccionados(prev =>
      prev.map(p => p.id === packId ? { ...p, cantidad: valor } : p)
    )
  }

  // ── Handlers conceptos extra ──────────────────────
  const addConcepto = () =>
    setConceptosExtra(c => [
      ...c,
      { descripcion: '', importe: '', cantidad: 1, horas_cubiertas: '', es_tasa_examen: false }
    ])

  const addTarifaComoConcepto = (tarifaId) => {
    const t = tarifasCatalogo.find(x => x.id === Number(tarifaId))
    if (!t) return
    setConceptosExtra(c => [
      ...c,
      {
        descripcion: t.nombre,
        importe: String(t.precio_base),
        cantidad: 1,
        horas_cubiertas: '',
        es_tasa_examen: !!t.es_tasa_examen,
      },
    ])
  }

  const updateConcepto = (idx, campo, valor) =>
    setConceptosExtra(c =>
      c.map((item, i) => i === idx ? { ...item, [campo]: valor } : item)
    )

  const removeConcepto = (idx) =>
    setConceptosExtra(c => c.filter((_, i) => i !== idx))

  // ── Handlers formas de pago ───────────────────────
  const addFormaPago = () => setFormasPago(f => [...f, { forma: 'efectivo', importe: '' }])
  const updateFormaPago = (idx, campo, valor) =>
    setFormasPago(f => f.map((item, i) => i === idx ? { ...item, [campo]: valor } : item))
  const removeFormaPago = (idx) => {
    if (formasPago.length === 1) return
    setFormasPago(f => f.filter((_, i) => i !== idx))
  }
  const distribuirTotal = () => {
    setFormasPago(f => f.map((item, i) =>
      i === 0 ? { ...item, importe: total.toFixed(2) } : { ...item, importe: '' }
    ))
  }

  // ── Confirmar cobro ───────────────────────────────
  const handleConfirmar = async () => {
    setGuardando(true)
    try {
      const payload = {
        alumno_id: parseInt(alumnoId),
        packs: packsSeleccionados.map(p => ({
          id: p.id,
          cantidad: parseInt(p.cantidad) || 1,
        })),
        descuento_hermano: descuentoHermano && hermanos.length > 0,
        descuento_extra_pct: descuentoExtraTipo === 'pct' ? parseFloat(descuentoExtraValor) || 0 : 0,
        descuento_extra_importe: descuentoExtraTipo === 'importe' ? parseFloat(descuentoExtraValor) || 0 : 0,
        formas_pago: formasPago
          .filter(f => parseFloat(f.importe) > 0)
          .map(f => ({ forma: f.forma, importe: parseFloat(f.importe) })),
        notas: notas.trim() || null,
        fecha_operacion: fechaOperacion,
        conceptos_extra: conceptosValidos.map(c => {
          const cantidad = parseInt(c.cantidad) || 1
          const item = {
            descripcion: c.descripcion.trim(),
            importe: parseFloat(c.importe),
            cantidad,
            es_tasa_examen: c.es_tasa_examen || false,
          }
          const hc = parseFloat(c.horas_cubiertas)
          if (!isNaN(hc) && hc > 0) item.horas_cubiertas = hc
          return item
        }),
      }
      const { data } = await cobrosService.crear(payload)
      setCobroCreado(data)
      setPaso(4)

      if (data.ticket_impreso)      toast.success('Cobro registrado e impreso 🖨️')
      else if (data.ticket_error)   toast.error('Cobro OK, pero falló la impresión del ticket')
      else                          toast.success('¡Cobro registrado correctamente! 🎉')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar el cobro')
    } finally {
      setGuardando(false)
    }
  }

  const handleReimprimir = async () => {
    if (!cobroCreado) return
    setReimprimiendo(true)
    try {
      await cobrosService.imprimir(cobroCreado.id, 2)
      toast.success('Ticket reenviado a la impresora 🖨️')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo imprimir el ticket')
    } finally {
      setReimprimiendo(false)
    }
  }

  const PASOS = soloConceptos
    ? ['Concepto', 'Descuentos', 'Pago', 'Confirmar']
    : ['Packs', 'Descuentos', 'Pago', 'Confirmar']

  return (
    <>
      <Topbar
        titulo={soloConceptos ? 'Cobro de concepto' : 'Nuevo cobro'}
        subtitulo={alumno ? `${alumno.nombre} ${alumno.apellidos}` : ''}
      />

      <div style={{ padding: '24px 32px', maxWidth: 680 }}>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 20,
        }}>
          <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={36} />
          <div>
            <div style={{ fontWeight: 700 }}>{alumno.nombre} {alumno.apellidos}</div>
            {hermanos.length > 0 && !soloConceptos && (
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

        {paso === 4 && cobroCreado && (
          <Card>
            <CardBody>
              {cobroCreado.ticket_error && (
                <div style={{
                  padding: '10px 14px', marginBottom: 16,
                  background: '#FFF4E5', border: '1px solid #FFB84D',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
                  color: '#8A4B00', lineHeight: 1.5,
                }}>
                  ⚠️ El cobro se registró pero la impresora no respondió:
                  <br /><code style={{ fontSize: '0.78rem' }}>{cobroCreado.ticket_error}</code>
                  <br />Puedes reintentar con <strong>Reimprimir ticket</strong>.
                </div>
              )}

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
                  <Button variant="primary" loading={reimprimiendo} onClick={handleReimprimir}>
                    🖨️ Reimprimir ticket (2 copias)
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

              {/* ── PASO 0 ── */}
              {paso === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                  {!soloConceptos && (
                    <>
                      <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', marginBottom: 8 }}>
                        Selecciona los packs que se incluyen en este cobro:
                      </p>

                      {packsPendientes.length > 0 && (
                        <div style={{
                          padding: '10px 14px',
                          background: '#FFF4E5', border: '1px solid #FFB84D',
                          borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
                          color: '#8A4B00', lineHeight: 1.5, marginBottom: 8,
                        }}>
                          ⚠️ Este alumno tiene {packsPendientes.length} pack(s) <strong>pendiente(s) de asignar tarifa</strong>.
                          <br />Ve a su ficha y pulsa <strong>"Asignar pack"</strong> para elegir la tarifa correspondiente.
                        </div>
                      )}

                      {packsActivos.length === 0 ? (
                        <div style={{
                          padding: 24, textAlign: 'center',
                          background: 'var(--white-off)', borderRadius: 'var(--radius-sm)',
                          border: '1px dashed var(--grey-border)',
                        }}>
                          <div style={{ fontSize: '0.9rem', color: 'var(--grey-mid)', marginBottom: 12 }}>
                            {packsPendientes.length > 0
                              ? 'Este alumno solo tiene packs pendientes de asignar tarifa.'
                              : 'Este alumno no tiene packs activos asignados.'}
                          </div>
                          <Button variant="primary" size="sm" onClick={() => setModalPack(true)}>
                            + Añadir pack a este alumno
                          </Button>
                        </div>
                      ) : (
                        packsActivos.map(pack => {
                          const sel = packsSeleccionados.some(p => p.id === pack.id)
                          const selPack = packsSeleccionados.find(p => p.id === pack.id)
                          const cant = parseInt(selPack?.cantidad) || 1
                          const precioUnit = parseFloat(pack.tarifa?.precio_base || 0)
                          const lineTotal = precioUnit * cant

                          return (
                            <div
                              key={pack.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                                border: `2px solid ${sel ? 'var(--orange)' : 'var(--grey-border)'}`,
                                background: sel ? 'var(--orange-pale)' : 'var(--white)',
                                transition: 'all var(--transition)',
                              }}
                            >
                              {/* Checkbox de selección */}
                              <div
                                onClick={() => togglePack(pack)}
                                style={{
                                  width: 20, height: 20, borderRadius: '50%',
                                  border: `2px solid ${sel ? 'var(--orange)' : 'var(--grey-light)'}`,
                                  background: sel ? 'var(--orange)' : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.65rem', color: 'white', flexShrink: 0,
                                  cursor: 'pointer',
                                }}
                              >
                                {sel && '✓'}
                              </div>

                              <TipoBadge categoria={pack.tarifa?.categoria} nombre={pack.tarifa?.categoria?.toUpperCase() || '—'} />

                              <div
                                onClick={() => togglePack(pack)}
                                style={{ flex: 1, cursor: 'pointer' }}
                              >
                                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{pack.tarifa?.nombre || 'Pack'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)' }}>
                                  {pack.tarifa?.horas_semanales ? `${pack.tarifa.horas_semanales}h/semana` : pack.tarifa?.num_sesiones ? `${pack.tarifa.num_sesiones} sesiones` : ''}
                                </div>
                              </div>

                              {/* 👇 Cantidad (solo si está seleccionado) */}
                              {sel ? (
                                <>
                                  <input
                                    type="number" min="1" step="1"
                                    value={selPack.cantidad}
                                    onChange={e => updateCantidadPack(pack.id, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    title="Cantidad"
                                    style={{
                                      width: 52,
                                      fontFamily: 'DM Mono, monospace', fontSize: '0.85rem',
                                      padding: '5px 6px', border: '1px solid var(--orange)',
                                      borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'center',
                                    }}
                                  />
                                  <span style={{ color: 'var(--grey-mid)', fontSize: '0.8rem' }}>×</span>
                                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--grey-mid)' }}>
                                    {precioUnit.toFixed(2)}€
                                  </span>
                                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)', minWidth: 60, textAlign: 'right' }}>
                                    {lineTotal.toFixed(2)}€
                                  </span>
                                </>
                              ) : (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)' }}>
                                  {precioUnit.toFixed(2)}€
                                </span>
                              )}
                            </div>
                          )
                        })
                      )}
                    </>
                  )}

                  {soloConceptos && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', marginBottom: 4 }}>
                      Este cobro no lleva ningún pack — solo un concepto libre.
                    </p>
                  )}

                  {/* ── BLOQUE CONCEPTOS ── */}
                  <div style={{
                    marginTop: 12, padding: '12px 14px',
                    background: 'var(--white-off)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--grey-border)',
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: 10,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {soloConceptos ? '💡 Concepto a cobrar' : '🧾 Conceptos adicionales (productos, tasas, matrícula...)'}
                      </div>
                      {conceptosTotal > 0 && (
                        <span style={{
                          fontSize: '0.78rem', color: 'var(--orange)',
                          fontFamily: 'DM Mono, monospace', fontWeight: 700,
                        }}>
                          +{conceptosTotal.toFixed(2)}€
                        </span>
                      )}
                    </div>

                    {!soloConceptos && tarifasCatalogo.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{
                          fontSize: '0.72rem', color: 'var(--grey-mid)',
                          marginBottom: 6, fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          ⚡ Añadir del catálogo
                        </div>
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) {
                              addTarifaComoConcepto(e.target.value)
                              e.target.value = ''
                            }
                          }}
                          style={{
                            width: '100%',
                            fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                            padding: '8px 12px', border: '1px solid var(--grey-border)',
                            borderRadius: 'var(--radius-sm)', outline: 'none',
                            background: 'var(--white)', cursor: 'pointer',
                          }}
                        >
                          <option value="">— Selecciona un producto o tasa —</option>
                          {tarifasCatalogo.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.es_tasa_examen ? '🎫 ' : ''}{t.nombre} · {Number(t.precio_base).toFixed(2)}€
                              {t.es_tasa_examen ? ' (tasa)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {conceptosExtra.length === 0 && soloConceptos && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--grey-mid)', marginBottom: 8 }}>
                        No hay concepto definido. Añade uno abajo.
                      </p>
                    )}

                    {conceptosExtra.map((c, idx) => {
                      const cantidad = parseInt(c.cantidad) || 1
                      const importeUnit = parseFloat(c.importe) || 0
                      const lineTotal = cantidad * importeUnit

                      return (
                        <div key={idx} style={{
                          marginBottom: 8,
                          padding: c.es_tasa_examen ? '8px 10px' : 0,
                          background: c.es_tasa_examen ? '#FFF9F0' : 'transparent',
                          border: c.es_tasa_examen ? '1px solid #FFB84D' : 'none',
                          borderRadius: c.es_tasa_examen ? 'var(--radius-sm)' : 0,
                        }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder={soloConceptos ? 'Ej: Sesión psicología' : 'Descripción'}
                              value={c.descripcion}
                              onChange={e => updateConcepto(idx, 'descripcion', e.target.value)}
                              style={{
                                flex: 1,
                                fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                                padding: '7px 10px', border: '1px solid var(--grey-border)',
                                borderRadius: 'var(--radius-sm)', outline: 'none',
                              }}
                              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                            />

                            <input
                              type="number" min="1" step="1" placeholder="1"
                              value={c.cantidad || 1}
                              onChange={e => updateConcepto(idx, 'cantidad', e.target.value)}
                              title="Cantidad de unidades"
                              style={{
                                width: 52,
                                fontFamily: 'DM Mono, monospace', fontSize: '0.85rem',
                                padding: '7px 6px', border: '1px solid var(--grey-border)',
                                borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'center',
                              }}
                              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                            />
                            <span style={{ color: 'var(--grey-mid)', fontSize: '0.8rem' }}>×</span>

                            <input
                              type="number" min="0" step="0.01" placeholder="0.00"
                              value={c.importe}
                              onChange={e => updateConcepto(idx, 'importe', e.target.value)}
                              title="Precio unitario"
                              style={{
                                width: 84,
                                fontFamily: 'DM Mono, monospace', fontSize: '0.85rem',
                                padding: '7px 10px', border: '1px solid var(--grey-border)',
                                borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'right',
                              }}
                              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                            />
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', color: 'var(--grey-mid)' }}>€</span>

                            {c.es_tasa_examen && (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 700,
                                padding: '2px 8px', borderRadius: 20,
                                background: '#FFF4E5', border: '1px solid #FFB84D',
                                color: '#8A4B00', whiteSpace: 'nowrap',
                              }}>
                                🎫 Tasa
                              </span>
                            )}

                            <button onClick={() => removeConcepto(idx)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--grey-light)', fontSize: '1rem', padding: '0 4px',
                              }}>✕</button>
                          </div>

                          {cantidad > 1 && (
                            <div style={{
                              fontSize: '0.7rem', color: 'var(--orange)',
                              marginTop: 2, paddingLeft: 2,
                              fontFamily: 'DM Mono, monospace',
                            }}>
                              = {lineTotal.toFixed(2)}€
                            </div>
                          )}

                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            marginTop: 4, paddingLeft: 2,
                          }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)' }}>Cubre</span>
                            <input
                              type="number" min="0" step="0.25" placeholder="—"
                              value={c.horas_cubiertas || ''}
                              onChange={e => updateConcepto(idx, 'horas_cubiertas', e.target.value)}
                              style={{
                                width: 60,
                                fontFamily: 'DM Mono, monospace', fontSize: '0.75rem',
                                padding: '3px 6px', border: '1px solid var(--grey-border)',
                                borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'right',
                              }}
                              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                            />
                            <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)' }}>
                              h de exceso (silencia el aviso naranja)
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    <button
                      onClick={addConcepto}
                      style={{
                        background: 'transparent',
                        border: '1px dashed var(--grey-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px', fontSize: '0.78rem',
                        cursor: 'pointer', color: 'var(--orange)',
                        fontWeight: 600, fontFamily: 'var(--font-body)',
                        marginTop: conceptosExtra.length > 0 ? 4 : 0,
                      }}
                    >
                      + Añadir concepto libre
                    </button>
                  </div>

                </div>
              )}

              {/* ── PASO 1: Descuentos ── */}
              {paso === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{
                    padding: '14px', borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${descuentoHermano && hermanos.length > 0 ? 'var(--orange)' : 'var(--grey-border)'}`,
                    background: descuentoHermano && hermanos.length > 0 ? 'var(--orange-pale)' : 'var(--white)',
                    opacity: hermanos.length === 0 ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox"
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
                      <input type="number" min="0" step="0.01"
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

                  <div style={{
                    padding: '14px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--white-off)', border: '1px solid var(--grey-border)',
                    fontFamily: 'DM Mono, monospace', fontSize: '0.82rem',
                  }}>
                    {subtotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--grey-mid)' }}>
                        <span>Subtotal packs</span><span>{subtotal.toFixed(2)}€</span>
                      </div>
                    )}
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
                    {conceptosTotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--orange)' }}>
                        <span>Otros conceptos</span><span>+{conceptosTotal.toFixed(2)}€</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--grey-border)', paddingTop: 8, fontWeight: 700, fontSize: '1rem', color: 'var(--orange)' }}>
                      <span>Total</span><span>{total.toFixed(2)}€</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PASO 2: Forma de pago ── */}
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
                          <button key={f.key} onClick={() => updateFormaPago(idx, 'forma', f.key)}
                            style={{
                              padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                              border: `2px solid ${fp.forma === f.key ? 'var(--orange)' : 'var(--grey-border)'}`,
                              background: fp.forma === f.key ? 'var(--orange-pale)' : 'white',
                              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-body)',
                              fontWeight: fp.forma === f.key ? 700 : 400,
                              color: fp.forma === f.key ? 'var(--orange-dark)' : 'var(--grey-mid)',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            {f.icon} {f.label}
                          </button>
                        ))}
                      </div>
                      <input type="number" min="0" step="0.01" placeholder="0.00"
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

              {/* ── PASO 3: Confirmar ── */}
              {paso === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>
                    Revisa el resumen antes de confirmar:
                  </p>

                  {packsSeleccionados.map(p => {
                    const cant = parseInt(p.cantidad) || 1
                    const precioUnit = parseFloat(p.tarifa?.precio_base || 0)
                    const lineTotal = precioUnit * cant
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid var(--grey-border)' }}>
                        <span>
                          {p.tarifa?.nombre}
                          {cant > 1 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--orange)', marginLeft: 6, fontWeight: 700 }}>
                              × {cant}
                            </span>
                          )}
                        </span>
                        <span style={{ fontFamily: 'DM Mono, monospace' }}>{lineTotal.toFixed(2)}€</span>
                      </div>
                    )
                  })}

                  {conceptosValidos.map((c, i) => {
                    const cantidad = parseInt(c.cantidad) || 1
                    const importeUnit = parseFloat(c.importe) || 0
                    const lineTotal = cantidad * importeUnit

                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid var(--grey-border)' }}>
                        <span>
                          💡 {c.descripcion}
                          {cantidad > 1 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--orange)', marginLeft: 6, fontWeight: 700 }}>
                              × {cantidad}
                            </span>
                          )}
                          {parseFloat(c.horas_cubiertas) > 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginLeft: 6 }}>
                              (cubre {parseFloat(c.horas_cubiertas)}h)
                            </span>
                          )}
                          {c.es_tasa_examen && (
                            <span style={{ fontSize: '0.7rem', color: '#8A4B00', marginLeft: 6, fontWeight: 700 }}>
                              🎫 TASA
                            </span>
                          )}
                        </span>
                        <span style={{ fontFamily: 'DM Mono, monospace' }}>{lineTotal.toFixed(2)}€</span>
                      </div>
                    )
                  })}

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

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', color: 'var(--orange)', padding: '8px 0', borderTop: '2px solid var(--grey-border)' }}>
                    <span>TOTAL</span>
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>{total.toFixed(2)}€</span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--grey-mid)' }}>
                    {formasPago.filter(f => parseFloat(f.importe) > 0).map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>{FORMAS_PAGO.find(fp => fp.key === f.forma)?.icon} {FORMAS_PAGO.find(fp => fp.key === f.forma)?.label}</span>
                        <span style={{ fontFamily: 'DM Mono, monospace' }}>{parseFloat(f.importe).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label style={{
                      fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      display: 'block', marginBottom: 6,
                    }}>
                      📅 Fecha de contabilización
                    </label>
                    <input type="date" value={fechaOperacion}
                      onChange={e => setFechaOperacion(e.target.value)}
                      style={{
                        width: '100%', fontFamily: 'DM Mono, monospace', fontSize: '0.9rem',
                        padding: '8px 12px', border: '1px solid var(--grey-border)',
                        borderRadius: 'var(--radius-sm)', outline: 'none',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                      onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--grey-light)', marginTop: 4 }}>
                      Si el pago se realiza hoy pero corresponde a un mes anterior, cambia esta fecha.
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label style={{
                      fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      display: 'block', marginBottom: 6,
                    }}>
                      Observaciones (opcional)
                    </label>
                    <textarea rows={3} value={notas} onChange={e => setNotas(e.target.value)}
                      placeholder="Ej: Mensualidad de junio + matrícula"
                      style={{
                        width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                        padding: '8px 12px', border: '1px solid var(--grey-border)',
                        borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                      onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                    />
                  </div>

                  <div style={{
                    marginTop: 8, padding: '10px 12px',
                    background: 'var(--white-off)', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--grey-mid)',
                  }}>
                    🖨️ Al confirmar se imprimirán <strong>2 copias del ticket</strong> en la impresora térmica.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <Button variant="ghost" onClick={() => paso === 0 ? navigate(-1) : setPaso(p => p - 1)}>
                  ← {paso === 0 ? 'Cancelar' : 'Atrás'}
                </Button>
                {paso < 3 ? (
                  <Button variant="primary" onClick={() => setPaso(p => p + 1)} disabled={!pasoValido()}>
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

      {modalPack && (
        <AsignarPackModal
          alumnoId={parseInt(alumnoId)}
          onClose={() => setModalPack(false)}
          onCreado={async () => {
            setModalPack(false)
            await cargarAlumno()
            toast.success('Pack añadido — selecciónalo para continuar')
          }}
        />
      )}
    </>
  )
}