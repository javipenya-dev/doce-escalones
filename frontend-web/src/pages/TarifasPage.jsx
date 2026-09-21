import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { tarifasService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Button, Avatar, EmptyState, Spinner, Input } from '../components/ui'

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

function describeTarifa(t) {
  if (t.categoria === 'sesion') {
    if (t.es_bono_sesion) return `Bono ${t.num_sesiones} sesiones · ${t.duracion_sesion_min ?? '?'}min/sesión`
    return `Sesión suelta · ${t.duracion_sesion_min ?? '?'}min`
  }
  if (t.horas_semanales) return `${t.horas_semanales}h/semana · ${(t.horas_semanales * 4).toFixed(1)}h/mes`
  return '—'
}

/* ── MODAL ALTA / EDICIÓN ────────────────────────── */
function ModalTarifa({ tarifa, onClose, onGuardado }) {
  const esEdicion = Boolean(tarifa)
  const [form, setForm] = useState({
    nombre:              tarifa?.nombre              || '',
    categoria:           tarifa?.categoria           || 'normal',
    horas_semanales:     tarifa?.horas_semanales     ?? '',
    num_sesiones:        tarifa?.num_sesiones        ?? '',
    es_bono_sesion:      tarifa?.es_bono_sesion      ?? false,
    duracion_sesion_min: tarifa?.duracion_sesion_min ?? '',
    precio_base:         tarifa?.precio_base         ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})

  const esSesion = form.categoria === 'sesion'

  const validar = () => {
    const e = {}
    if (!form.nombre.trim())      e.nombre      = 'El nombre es obligatorio'
    if (!form.precio_base || Number(form.precio_base) <= 0) e.precio_base = 'El precio debe ser mayor que 0'
    if (!esSesion && !form.horas_semanales) e.horas_semanales = 'Indica las horas semanales'
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
    }

    setGuardando(true)
    try {
      if (esEdicion) {
        await tarifasService.actualizar(tarifa.id, payload)
        toast.success('Tarifa actualizada')
      } else {
        await tarifasService.crear(payload)
        toast.success('Tarifa creada')
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
          {esEdicion ? '✏️ Editar tarifa' : '➕ Nueva tarifa'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input style={inputStyle} placeholder='Ej: Bono 2h/semana Inglés'
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

          {/* Campos según categoría */}
          {!esSesion && (
            <div>
              <label style={labelStyle}>Horas semanales *</label>
              <input style={inputStyle} type="number" step="0.5" min="0.5" placeholder="2.0"
                value={form.horas_semanales} onChange={set('horas_semanales')}
                onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
              />
              {form.horas_semanales > 0 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', marginTop: 3 }}>
                  → {(Number(form.horas_semanales) * 4).toFixed(1)}h/mes (semanas de 4h)
                </div>
              )}
              {errores.horas_semanales && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.horas_semanales}</div>}
            </div>
          )}

          {esSesion && (
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
                <input style={inputStyle} type="number" min="15" step="15" placeholder="60"
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
            {esEdicion ? 'Guardar cambios' : 'Crear tarifa'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── TARIFA CARD ─────────────────────────────────── */
function TarifaRow({ tarifa, onEditar, onToggle, toggling }) {
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
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}>
            {cfg.icon}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{tarifa.nombre}</div>
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
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => onEditar(tarifa)}>✏️ Editar</Button>
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
  const [mostrarInactivas, setMostrarInactivas] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [tarifaEditando, setTarifaEditando] = useState(null)
  const [toggling, setToggling] = useState(null)

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

  const abrirNueva   = () => { setTarifaEditando(null); setModalAbierto(true) }
  const abrirEdicion = (t) => { setTarifaEditando(t);  setModalAbierto(true) }
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

  const activas   = tarifas.filter(t => t.activo)
  const inactivas = tarifas.filter(t => !t.activo)

  // Agrupar activas por categoría
  const porCategoria = {}
  for (const cat of ['normal', 'ingles', 'sesion']) {
    porCategoria[cat] = activas.filter(t => t.categoria === cat)
  }

  const totalActivas = activas.length

  return (
    <>
      <Topbar
        titulo="Tarifas y packs"
        subtitulo={`${totalActivas} tarifas activas`}
        accion={{ label: 'Nueva tarifa', icon: '➕', onClick: abrirNueva }}
      />

      {modalAbierto && (
        <ModalTarifa tarifa={tarifaEditando} onClose={cerrarModal} onGuardado={cargar} />
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
            {/* Resumen por categoría */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => {
                const grupo = porCategoria[key] || []
                return (
                  <div key={key} style={{
                    background: 'var(--white)', border: `1px solid var(--grey-border)`,
                    borderTop: `3px solid ${cfg.color}`,
                    borderRadius: 'var(--radius)', padding: '14px 18px',
                    boxShadow: 'var(--shadow-sm)',
                  }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{cfg.icon}</div>
                    <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--black)' }}>
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
            </div>

            {/* Tabla tarifas activas */}
            <Card>
              <CardHeader>
                <span>📦</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Tarifas activas</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green-text)' }}>
                  {totalActivas}
                </span>
              </CardHeader>

              {activas.length === 0 ? (
                <CardBody>
                  <p style={{ color: 'var(--grey-mid)', fontSize: '0.85rem', margin: 0 }}>No hay tarifas activas</p>
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
                    {activas.map(t => (
                      <TarifaRow key={t.id} tarifa={t} onEditar={abrirEdicion} onToggle={handleToggle} toggling={toggling} />
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Tarifas inactivas (toggle) */}
            {inactivas.length > 0 && (
              <div>
                <button
                  onClick={() => setMostrarInactivas(v => !v)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.82rem', color: 'var(--grey-mid)',
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
                  }}
                >
                  {mostrarInactivas ? '▾' : '▸'} Ver tarifas inactivas ({inactivas.length})
                </button>

                {mostrarInactivas && (
                  <Card style={{ marginTop: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {inactivas.map(t => (
                          <TarifaRow key={t.id} tarifa={t} onEditar={abrirEdicion} onToggle={handleToggle} toggling={toggling} />
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
