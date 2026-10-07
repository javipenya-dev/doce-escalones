import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { tarifasService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Button, EmptyState, Spinner } from '../components/ui'

const CATEGORIA_CONFIG = {
  normal:  { label: 'Clases normales', icon: '🎓', color: 'var(--orange)',  bg: 'var(--orange-pale)',  border: 'var(--orange-mid)',  text: 'var(--orange-dark)' },
  ingles:  { label: 'Inglés',          icon: '🇬🇧', color: 'var(--green)',   bg: 'var(--green-bg)',    border: 'var(--green)',       text: 'var(--green-text)'  },
  sesion:  { label: 'Sesiones',        icon: '⏱️',  color: '#8B5CF6',       bg: '#F5F3FF',            border: '#C4B5FD',            text: '#6D28D9'            },
}

function CategoriaBadge({ categoria }) {
  const cfg = CATEGORIA_CONFIG[categoria] || CATEGORIA_CONFIG.normal
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function TasaBadge() {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: '#FFF4E5', border: '1px solid #FFB84D', color: '#8A4B00',
      marginLeft: 6,
    }}>
      🎫 Tasa (no cuenta beneficio)
    </span>
  )
}

function describeTarifa(t) {
  if (t.categoria === 'sesion') {
    if (t.es_bono_sesion) return `Bono ${t.num_sesiones} sesiones · ${t.duracion_sesion_min ?? '?'}min/sesión`
    return `Sesión suelta · ${t.duracion_sesion_min ?? '?'}min`
  }
  if (t.horas_semanales) return `${t.horas_semanales}h/semana · ${(t.horas_semanales * 4).toFixed(1)}h/mes`
  return '—'
}

/* ── MODAL ALTA / EDICIÓN / CLONAR ────────────────── */
function ModalTarifa({ tarifa, modo = 'editar', onClose, onGuardado }) {
  const esEdicion = modo === 'editar'
  const esClonar  = modo === 'clonar'

  const [form, setForm] = useState({
    nombre:              esClonar ? `Copia de ${tarifa?.nombre || ''}` : (tarifa?.nombre              || ''),
    categoria:           tarifa?.categoria           || 'normal',
    horas_semanales:     tarifa?.horas_semanales     ?? '',
    num_sesiones:        tarifa?.num_sesiones        ?? '',
    es_bono_sesion:      tarifa?.es_bono_sesion      ?? false,
    duracion_sesion_min: tarifa?.duracion_sesion_min ?? '',
    precio_base:         tarifa?.precio_base         ?? '',
    es_tasa_examen:      tarifa?.es_tasa_examen      ?? false,   // 👈 NUEVO
  })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})

  const esSesion = form.categoria === 'sesion'

  const validar = () => {
    const e = {}
    if (!form.nombre.trim())      e.nombre      = 'El nombre es obligatorio'
    if (!form.precio_base || Number(form.precio_base) <= 0) e.precio_base = 'El precio debe ser mayor que 0'
    if (!esSesion && !form.horas_semanales && !form.es_tasa_examen) e.horas_semanales = 'Indica las horas semanales'
    if (esSesion && form.es_bono_sesion && !form.num_sesiones) e.num_sesiones = 'Indica el número de sesiones del bono'
    return e
  }

  const handleSubmit = async () => {
    const e = validar()
    if (Object.keys(e).length > 0) { setErrores(e); return }

    const payload = {
      nombre:              form.nombre.trim(),
      categoria:           form.categoria,
      precio_base:         Number(form.precio_base),
      horas_semanales:     !esSesion && form.horas_semanales ? Number(form.horas_semanales) : null,
      num_sesiones:        esSesion && form.num_sesiones ? Number(form.num_sesiones) : null,
      es_bono_sesion:      esSesion ? form.es_bono_sesion : false,
      duracion_sesion_min: esSesion && form.duracion_sesion_min ? Number(form.duracion_sesion_min) : null,
      es_tasa_examen:      form.es_tasa_examen,   // 👈 NUEVO
    }

    setGuardando(true)
    try {
      if (esEdicion) {
        await tarifasService.actualizar(tarifa.id, payload)
        toast.success('Tarifa actualizada')
      } else {
        await tarifasService.crear(payload)
        toast.success(esClonar ? 'Tarifa clonada' : 'Tarifa creada')
      }
      onGuardado()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const set = (campo) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [campo]: val }))
    if (errores[campo]) setErrores(er => ({ ...er, [campo]: null }))
  }

  const inputStyle = {
    fontFamily: 'var(--font-body)', fontSize: '0.85rem',
    padding: '8px 12px', border: '1px solid var(--grey-border)',
    borderRadius: 'var(--radius-sm)', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  const labelStyle = {
    fontSize: '0.73rem', fontWeight: 600, color: 'var(--grey-mid)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    display: 'block', marginBottom: 4,
  }

  const titulo = esEdicion ? '✏️ Editar tarifa' : (esClonar ? '📋 Clonar tarifa' : '➕ Nueva tarifa')
  const labelBoton = esEdicion ? 'Guardar cambios' : (esClonar ? 'Crear copia' : 'Crear tarifa')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--radius)',
        padding: 28, width: 480, boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 22 }}>
          {titulo}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input style={inputStyle} placeholder='Ej: Tasa Cambridge B2'
              value={form.nombre} onChange={set('nombre')}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
            {errores.nombre && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.nombre}</div>}
          </div>

          {/* Categoría */}
          <div>
            <label style={labelStyle}>Categoría *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => (
                <div
                  key={key}
                  onClick={() => setForm(f => ({ ...f, categoria: key }))}
                  style={{
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: `2px solid ${form.categoria === key ? cfg.color : 'var(--grey-border)'}`,
                    background: form.categoria === key ? cfg.bg : 'transparent',
                    textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: '1.2rem', marginBottom: 2 }}>{cfg.icon}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: form.categoria === key ? cfg.text : 'var(--grey-mid)' }}>
                    {cfg.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 👇 NUEVO: Checkbox Es tasa de examen */}
          <div style={{
            padding: '10px 12px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${form.es_tasa_examen ? '#FFB84D' : 'var(--grey-border)'}`,
            background: form.es_tasa_examen ? '#FFF4E5' : 'var(--white)',
            transition: 'all 0.15s',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.es_tasa_examen} onChange={set('es_tasa_examen')}
                style={{ width: 16, height: 16, accentColor: 'var(--orange)', marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: form.es_tasa_examen ? '#8A4B00' : 'var(--black)' }}>
                  🎫 Es tasa de examen
                </div>
                <div style={{ fontSize: '0.72rem', color: form.es_tasa_examen ? '#8A4B00' : 'var(--grey-mid)', marginTop: 2, lineHeight: 1.4 }}>
                  No cuenta como beneficio en Dashboard ni Informes (ej: tasas Cambridge que luego se pagan).
                </div>
              </div>
            </label>
          </div>

          {/* Campos según categoría */}
          {!esSesion && !form.es_tasa_examen && (
            <div>
              <label style={labelStyle}>Horas semanales *</label>
              <input style={inputStyle} type="number" step="0.5" min="0.5" placeholder="2.0"
                value={form.horas_semanales} onChange={set('horas_semanales')}
                onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
              />
              {form.horas_semanales > 0 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', marginTop: 3 }}>
                  → {(Number(form.horas_semanales) * 4).toFixed(1)}h/mes (a 4 semanas/mes)
                </div>
              )}
              {errores.horas_semanales && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.horas_semanales}</div>}
            </div>
          )}

          {esSesion && !form.es_tasa_examen && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={form.es_bono_sesion} onChange={set('es_bono_sesion')}
                  style={{ width: 16, height: 16, accentColor: 'var(--orange)' }} />
                Es bono de sesiones (múltiples sesiones prepagadas)
              </label>

              {form.es_bono_sesion && (
                <div>
                  <label style={labelStyle}>Número de sesiones *</label>
                  <input style={inputStyle} type="number" min="1" placeholder="10"
                    value={form.num_sesiones} onChange={set('num_sesiones')}
                    onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                    onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                  />
                  {errores.num_sesiones && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.num_sesiones}</div>}
                </div>
              )}

              <div>
                <label style={labelStyle}>Duración por sesión (minutos)</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {[30, 45, 60, 90].map(min => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, duracion_sesion_min: min }))}
                      style={{
                        padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                        border: `1px solid ${Number(form.duracion_sesion_min) === min ? 'var(--orange)' : 'var(--grey-border)'}`,
                        background: Number(form.duracion_sesion_min) === min ? 'var(--orange-pale)' : 'white',
                        color: Number(form.duracion_sesion_min) === min ? 'var(--orange-dark)' : 'var(--grey-mid)',
                        fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
                <input style={inputStyle} type="number" min="15" step="5" placeholder="60"
                  value={form.duracion_sesion_min} onChange={set('duracion_sesion_min')}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                />
              </div>
            </>
          )}

          {/* Precio */}
          <div>
            <label style={labelStyle}>Precio base (€) *</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle, paddingRight: 32 }} type="number" min="0" step="0.01" placeholder="0.00"
                value={form.precio_base} onChange={set('precio_base')}
                onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
              />
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--grey-mid)', fontSize: '0.9rem', pointerEvents: 'none',
              }}>€</span>
            </div>
            {errores.precio_base && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.precio_base}</div>}
          </div>

        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={guardando}>
            {labelBoton}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── TARIFA ROW ──────────────────────────────────── */
function TarifaRow({ tarifa, onEditar, onClonar, onToggle, toggling }) {
  const cfg = CATEGORIA_CONFIG[tarifa.categoria] || CATEGORIA_CONFIG.normal
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--white-off)',
        transition: 'background var(--transition)',
        opacity: tarifa.activo ? 1 : 0.55,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: tarifa.es_tasa_examen ? '#FFF4E5' : cfg.bg,
            border: `1px solid ${tarifa.es_tasa_examen ? '#FFB84D' : cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}>
            {tarifa.es_tasa_examen ? '🎫' : cfg.icon}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              {tarifa.nombre}
              {tarifa.es_tasa_examen && <TasaBadge />}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', marginTop: 1 }}>
              {describeTarifa(tarifa)}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 20px' }}>
        <CategoriaBadge categoria={tarifa.categoria} />
      </td>
      <td style={{ padding: '12px 20px', fontWeight: 700, fontSize: '1rem', color: 'var(--orange)', fontVariantNumeric: 'tabular-nums' }}>
        {Number(tarifa.precio_base).toFixed(2)}€
      </td>
      <td style={{ padding: '12px 20px' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: tarifa.activo ? 'var(--green-bg)' : 'var(--grey-border)',
          color: tarifa.activo ? 'var(--green-text)' : 'var(--grey-mid)',
        }}>
          {tarifa.activo ? 'Activa' : 'Inactiva'}
        </span>
      </td>
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => onEditar(tarifa)}>✏️ Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => onClonar(tarifa)}>📋 Clonar</Button>
          <Button
            size="sm"
            variant={tarifa.activo ? 'ghost' : 'success'}
            onClick={() => onToggle(tarifa)}
            loading={toggling === tarifa.id}
          >
            {tarifa.activo ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

/* ── TARIFAS PAGE ────────────────────────────────── */
export function TarifasPage() {
  const [tarifas, setTarifas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [tarifaEditando, setTarifaEditando] = useState(null)
  const [modoModal, setModoModal] = useState('crear')
  const [toggling, setToggling] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('activas')

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await tarifasService.listar({ todas: true })
      setTarifas(data)
    } catch {
      toast.error('Error al cargar tarifas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const abrirNueva   = () => { setTarifaEditando(null); setModoModal('crear');  setModalAbierto(true) }
  const abrirEdicion = (t) => { setTarifaEditando(t);   setModoModal('editar'); setModalAbierto(true) }
  const abrirClonar  = (t) => { setTarifaEditando(t);   setModoModal('clonar'); setModalAbierto(true) }
  const cerrarModal  = () => { setModalAbierto(false); setTarifaEditando(null) }

  const handleToggle = async (tarifa) => {
    setToggling(tarifa.id)
    try {
      await tarifasService.toggle(tarifa.id)
      toast.success(tarifa.activo ? 'Tarifa desactivada' : 'Tarifa activada')
      cargar()
    } catch {
      toast.error('Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  const tarifasFiltradas = useMemo(() => {
    let list = tarifas

    if (filtroEstado === 'activas')   list = list.filter(t => t.activo)
    if (filtroEstado === 'inactivas') list = list.filter(t => !t.activo)

    if (categoriaFiltro) list = list.filter(t => t.categoria === categoriaFiltro)

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(t => t.nombre.toLowerCase().includes(q))
    }

    return list
  }, [tarifas, filtroEstado, categoriaFiltro, busqueda])

  const activas = tarifas.filter(t => t.activo)
  const porCategoria = {}
  for (const cat of ['normal', 'ingles', 'sesion']) {
    porCategoria[cat] = activas.filter(t => t.categoria === cat && !t.es_tasa_examen)
  }
  const numTasas = activas.filter(t => t.es_tasa_examen).length

  const subtitulo = (() => {
    const n = tarifasFiltradas.length
    if (filtroEstado === 'inactivas') return `${n} inactivas`
    if (filtroEstado === 'todas')     return `${n} totales`
    return `${n} activas`
  })()

  return (
    <>
      <Topbar
        titulo="Tarifas y packs"
        subtitulo={subtitulo}
        accion={{ label: 'Nueva tarifa', icon: '➕', onClick: abrirNueva }}
      />

      {modalAbierto && (
        <ModalTarifa
          tarifa={tarifaEditando}
          modo={modoModal}
          onClose={cerrarModal}
          onGuardado={cargar}
        />
      )}

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner size={32} />
          </div>
        ) : tarifas.length === 0 ? (
          <Card>
            <EmptyState
              icon="📦"
              title="No hay tarifas"
              description='Crea la primera tarifa pulsando "Nueva tarifa"'
            />
          </Card>
        ) : (
          <>
            {/* Tarjetas resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numTasas > 0 ? 4 : 3}, 1fr)`, gap: 14 }}>
              {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => {
                const grupo = porCategoria[key] || []
                const activa = categoriaFiltro === key
                return (
                  <div
                    key={key}
                    onClick={() => setCategoriaFiltro(activa ? null : key)}
                    style={{
                      background: activa ? cfg.bg : 'var(--white)',
                      borderTopWidth: '3px', borderTopStyle: 'solid', borderTopColor: cfg.color,
                      borderRightWidth: '1px', borderRightStyle: 'solid', borderRightColor: activa ? cfg.border : 'var(--grey-border)',
                      borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: activa ? cfg.border : 'var(--grey-border)',
                      borderLeftWidth: '1px', borderLeftStyle: 'solid', borderLeftColor: activa ? cfg.border : 'var(--grey-border)',
                      borderRadius: 'var(--radius)', padding: '14px 18px',
                      boxShadow: activa ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                      cursor: 'pointer', transition: 'all 0.15s',
                      transform: activa ? 'translateY(-2px)' : 'translateY(0)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '1.4rem' }}>{cfg.icon}</div>
                      {activa && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: cfg.text, opacity: 0.8 }}>
                          Filtrando ✕
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--black)', marginTop: 6 }}>
                      {grupo.length}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--grey-mid)', fontWeight: 500 }}>
                      {cfg.label}
                    </div>
                    {grupo.length > 0 && (
                      <div style={{ fontSize: '0.7rem', color: cfg.text, marginTop: 4, fontWeight: 600 }}>
                        Desde {Math.min(...grupo.map(t => t.precio_base)).toFixed(0)}€
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 👇 Tarjeta nueva: Tasas */}
              {numTasas > 0 && (
                <div
                  style={{
                    background: 'var(--white)',
                    borderTopWidth: '3px', borderTopStyle: 'solid', borderTopColor: '#FFB84D',
                    borderRightWidth: '1px', borderRightStyle: 'solid', borderRightColor: 'var(--grey-border)',
                    borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--grey-border)',
                    borderLeftWidth: '1px', borderLeftStyle: 'solid', borderLeftColor: 'var(--grey-border)',
                    borderRadius: 'var(--radius)', padding: '14px 18px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ fontSize: '1.4rem' }}>🎫</div>
                  <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--black)', marginTop: 6 }}>
                    {numTasas}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--grey-mid)', fontWeight: 500 }}>
                    Tasas de examen
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#8A4B00', marginTop: 4, fontWeight: 600 }}>
                    No cuentan como beneficio
                  </div>
                </div>
              )}
            </div>

            {/* Barra de filtros */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240, maxWidth: 400, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar tarifa por nombre..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  style={{
                    width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                    padding: '9px 12px 9px 36px', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius-sm)', outline: 'none', background: 'var(--white)',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                />
              </div>

              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                  padding: '9px 12px', border: '1px solid var(--grey-border)',
                  borderRadius: 'var(--radius-sm)', background: 'var(--white)',
                  color: 'var(--black)', cursor: 'pointer',
                }}
              >
                <option value="activas">Activas</option>
                <option value="inactivas">Inactivas</option>
                <option value="todas">Todas</option>
              </select>

              {(categoriaFiltro || busqueda || filtroEstado !== 'activas') && (
                <button
                  onClick={() => { setCategoriaFiltro(null); setBusqueda(''); setFiltroEstado('activas') }}
                  style={{
                    background: 'none', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    padding: '9px 14px', fontSize: '0.8rem', color: 'var(--grey-mid)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  ✕ Limpiar filtros
                </button>
              )}
            </div>

            {/* Tabla */}
            <Card>
              <CardHeader>
                <span>📦</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {filtroEstado === 'inactivas' ? 'Tarifas inactivas' : filtroEstado === 'todas' ? 'Todas las tarifas' : 'Tarifas activas'}
                  {categoriaFiltro && ` · ${CATEGORIA_CONFIG[categoriaFiltro].label}`}
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600,
                  padding: '2px 8px', borderRadius: 20,
                  background: 'var(--green-bg)', color: 'var(--green-text)',
                }}>
                  {tarifasFiltradas.length}
                </span>
              </CardHeader>

              {tarifasFiltradas.length === 0 ? (
                <CardBody>
                  <p style={{ color: 'var(--grey-mid)', fontSize: '0.85rem', margin: 0, textAlign: 'center', padding: 24 }}>
                    {busqueda
                      ? `No hay tarifas que coincidan con "${busqueda}"`
                      : 'No hay tarifas con los filtros actuales'}
                  </p>
                </CardBody>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--white-off)' }}>
                      {['Tarifa', 'Categoría', 'Precio', 'Estado', 'Acciones'].map(h => (
                        <th key={h} style={{ padding: '9px 20px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--grey-mid)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--grey-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tarifasFiltradas.map(t => (
                      <TarifaRow
                        key={t.id}
                        tarifa={t}
                        onEditar={abrirEdicion}
                        onClonar={abrirClonar}
                        onToggle={handleToggle}
                        toggling={toggling}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  )
}