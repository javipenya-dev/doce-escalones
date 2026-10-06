import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService } from '../../utils/api'
import { Button, Input, Spinner, Avatar } from '../ui'
import { Topbar } from '../layout/Topbar'

const EMPTY_FORM = {
  nombre: '', apellidos: '',
  fecha_nacimiento: '', fecha_inscripcion: new Date().toISOString().split('T')[0],
  telefono1: '', telefono2: '',
  direccion: '', email: '',
}

export function AlumnoForm({ modo = 'crear' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errores, setErrores] = useState({})
  const [loading, setLoading] = useState(false)
  const [cargando, setCargando] = useState(modo === 'editar')

  // ── Hermanos ──────────────────────────────────────────────
  const [hermanosSeleccionados, setHermanosSeleccionados] = useState([])
  const [sugerenciasHermanos, setSugerenciasHermanos]     = useState([])
  const [busquedaHermano, setBusquedaHermano]             = useState('')
  const [resultadosBusqueda, setResultadosBusqueda]       = useState([])
  const [buscandoHermanos, setBuscandoHermanos]           = useState(false)

  useEffect(() => {
    if (modo === 'editar' && id) {
      alumnosService.obtener(id).then(({ data }) => {
        setForm({
          nombre:            data.nombre || '',
          apellidos:         data.apellidos || '',
          fecha_nacimiento:  data.fecha_nacimiento || '',
          fecha_inscripcion: data.fecha_inscripcion || '',
          telefono1:         data.telefono1 || '',
          telefono2:         data.telefono2 || '',
          direccion:         data.direccion || '',
          email:             data.email || '',
        })
      }).catch(() => toast.error('No se pudo cargar el alumno'))
        .finally(() => setCargando(false))
    }
  }, [modo, id])

  // ── Auto-sugerencias por apellidos ────────────────────────
  useEffect(() => {
    if (modo !== 'crear') return
    const ap = (form.apellidos || '').trim()
    if (ap.length < 3) {
      setSugerenciasHermanos([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await alumnosService.listar({ nombre: ap, activo: true })
        const yaIds = new Set(hermanosSeleccionados.map(h => h.id))
        setSugerenciasHermanos(data.filter(a => !yaIds.has(a.id)).slice(0, 5))
      } catch { /* silencioso */ }
    }, 400)
    return () => clearTimeout(t)
  }, [form.apellidos, modo, hermanosSeleccionados])

  // ── Búsqueda manual de hermanos ───────────────────────────
  useEffect(() => {
    if (!busquedaHermano || busquedaHermano.trim().length < 2) {
      setResultadosBusqueda([])
      return
    }
    const t = setTimeout(async () => {
      setBuscandoHermanos(true)
      try {
        const { data } = await alumnosService.listar({ nombre: busquedaHermano.trim(), activo: true })
        const yaIds = new Set(hermanosSeleccionados.map(h => h.id))
        setResultadosBusqueda(data.filter(a => !yaIds.has(a.id)).slice(0, 8))
      } catch { /* silencioso */ }
      finally { setBuscandoHermanos(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [busquedaHermano, hermanosSeleccionados])

  const agregarHermano = (a) => {
    if (hermanosSeleccionados.find(h => h.id === a.id)) return
    setHermanosSeleccionados(prev => [...prev, {
      id: a.id,
      nombre: a.nombre,
      apellidos: a.apellidos,
    }])
    setBusquedaHermano('')
    setResultadosBusqueda([])
    setSugerenciasHermanos(prev => prev.filter(s => s.id !== a.id))
  }

  const quitarHermano = (hId) => {
    setHermanosSeleccionados(prev => prev.filter(h => h.id !== hId))
  }

  const set = (campo) => (e) => {
    setForm(f => ({ ...f, [campo]: e.target.value }))
    if (errores[campo]) setErrores(err => ({ ...err, [campo]: null }))
  }

  const validar = () => {
    const e = {}
    if (!form.nombre.trim())    e.nombre    = 'El nombre es obligatorio'
    if (!form.apellidos.trim()) e.apellidos = 'Los apellidos son obligatorios'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setLoading(true)
    try {
      const payload = {
        ...form,
        fecha_nacimiento:  form.fecha_nacimiento  || null,
        fecha_inscripcion: form.fecha_inscripcion || null,
        telefono2:  form.telefono2  || null,
        direccion:  form.direccion  || null,
        email:      form.email      || null,
      }
      if (modo === 'crear') {
        const { data: nuevo } = await alumnosService.crear(payload)

        // Vincular hermanos seleccionados (silencioso si alguno falla)
        if (hermanosSeleccionados.length > 0) {
          const vinculaciones = hermanosSeleccionados.map(h =>
            alumnosService.vincularHermano(nuevo.id, h.id).catch(() => null)
          )
          const res = await Promise.all(vinculaciones)
          const ok = res.filter(r => r !== null).length
          if (ok > 0) {
            toast.success(`Alumno creado con ${ok} hermano${ok > 1 ? 's' : ''} vinculado${ok > 1 ? 's' : ''} ✅`)
          } else {
            toast.success('Alumno creado correctamente ✅')
          }
        } else {
          toast.success('Alumno creado correctamente ✅')
        }
        navigate(`/alumnos/${nuevo.id}`)
      } else {
        await alumnosService.actualizar(id, payload)
        toast.success('Datos actualizados correctamente ✅')
        navigate(`/alumnos/${id}`)
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  if (cargando) return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <Spinner size={36} />
    </div>
  )

  return (
    <>
      <Topbar
        titulo={modo === 'crear' ? 'Nuevo alumno' : 'Editar alumno'}
        subtitulo={modo === 'editar' ? `${form.nombre} ${form.apellidos}` : 'Rellena los datos del alumno'}
      />
      <div style={{ padding: '28px 32px', maxWidth: 720 }}>
        <div style={{
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>

          {/* Sección datos personales */}
          <SectionHeader icon="👤" title="Datos personales" />
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Nombre *"    value={form.nombre}    onChange={set('nombre')}    error={errores.nombre}    placeholder="Ej: Lucas" />
            <Input label="Apellidos *" value={form.apellidos} onChange={set('apellidos')} error={errores.apellidos} placeholder="Ej: Fernández García" />
            <Input label="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
            <Input label="Fecha de inscripción" type="date" value={form.fecha_inscripcion} onChange={set('fecha_inscripcion')} />
          </div>

          {/* Sección contacto */}
          <SectionHeader icon="📞" title="Contacto" />
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Teléfono 1" type="tel" value={form.telefono1} onChange={set('telefono1')} placeholder="Ej: 956 000 000" />
            <Input label="Teléfono 2" type="tel" value={form.telefono2} onChange={set('telefono2')} placeholder="Opcional" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="Ej: familia@email.com" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Dirección" value={form.direccion} onChange={set('direccion')} placeholder="Ej: C/ Ejemplo 1, Jerez de la Frontera" />
            </div>
          </div>

          {/* ── Hermanos (solo en modo crear) ── */}
          {modo === 'crear' && (
            <>
              <SectionHeader icon="👨‍👧‍👦" title="Hermanos (opcional · descuento 10%)" />
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Sugerencias por apellidos */}
                {sugerenciasHermanos.length > 0 && (
                  <div>
                    <div style={miniLabel}>
                      Sugerencias por apellidos similares
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {sugerenciasHermanos.map(a => (
                        <SugerenciaHermano
                          key={a.id}
                          alumno={a}
                          onAgregar={() => agregarHermano(a)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Búsqueda manual */}
                <div>
                  <div style={miniLabel}>
                    Buscar otro alumno (por si no comparten apellidos)
                  </div>
                  <input
                    type="text"
                    placeholder="🔍 Buscar por nombre o apellidos..."
                    value={busquedaHermano}
                    onChange={e => setBusquedaHermano(e.target.value)}
                    style={{
                      width: '100%',
                      fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                      padding: '8px 12px',
                      border: '1px solid var(--grey-border)',
                      borderRadius: 'var(--radius-sm)',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                    onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                  />

                  {buscandoHermanos && (
                    <div style={{ padding: '8px 0', fontSize: '0.78rem', color: 'var(--grey-mid)' }}>
                      Buscando…
                    </div>
                  )}

                  {resultadosBusqueda.length > 0 && (
                    <div style={{
                      marginTop: 6,
                      background: 'var(--white)',
                      border: '1px solid var(--grey-border)',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                    }}>
                      {resultadosBusqueda.map(a => (
                        <div
                          key={a.id}
                          onClick={() => agregarHermano(a)}
                          style={{
                            padding: '8px 12px',
                            display: 'flex', alignItems: 'center', gap: 10,
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            borderBottom: '1px solid var(--white-off)',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Avatar nombre={a.nombre} apellidos={a.apellidos} size={26} />
                          <span style={{ flex: 1 }}>
                            {a.nombre} {a.apellidos}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 700 }}>
                            + Vincular
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chips de hermanos seleccionados */}
                {hermanosSeleccionados.length > 0 && (
                  <div>
                    <div style={miniLabel}>
                      Se vincularán como hermanos ({hermanosSeleccionados.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {hermanosSeleccionados.map(h => (
                        <div
                          key={h.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px',
                            background: 'var(--orange-pale)',
                            border: '1px solid var(--orange-mid)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <Avatar nombre={h.nombre} apellidos={h.apellidos} size={26} />
                          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>
                            {h.nombre} {h.apellidos}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--orange-dark)', fontWeight: 700 }}>
                            -10%
                          </span>
                          <button
                            type="button"
                            onClick={() => quitarHermano(h.id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--orange-dark)', fontSize: '0.95rem',
                              padding: '0 4px',
                            }}
                            title="Quitar"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Texto informativo */}
                {hermanosSeleccionados.length === 0 && sugerenciasHermanos.length === 0 && (
                  <div style={{
                    fontSize: '0.78rem',
                    color: 'var(--grey-mid)',
                    background: 'var(--white-off)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--orange-mid)',
                    lineHeight: 1.5,
                  }}>
                    💡 <strong>Se sugiere automáticamente</strong> al escribir los apellidos.<br />
                    También puedes <strong>buscar manualmente</strong> si los hermanos no comparten apellidos (por ejemplo, padres separados).
                  </div>
                )}

              </div>
            </>
          )}

          {/* Acciones */}
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--grey-border)',
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            background: 'var(--white-off)',
          }}>
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button loading={loading} onClick={handleGuardar}>
              {modo === 'crear'
                ? (hermanosSeleccionados.length > 0
                    ? `➕ Crear alumno y vincular ${hermanosSeleccionados.length} hermano${hermanosSeleccionados.length > 1 ? 's' : ''}`
                    : '➕ Crear alumno')
                : '💾 Guardar cambios'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Subcomponentes ────────────────────────────────────────────

function SugerenciaHermano({ alumno, onAgregar }) {
  return (
    <div
      onClick={onAgregar}
      style={{
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--white-off)',
        border: '1px solid var(--grey-border)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        fontSize: '0.85rem',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--orange-pale)'
        e.currentTarget.style.borderColor = 'var(--orange-mid)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--white-off)'
        e.currentTarget.style.borderColor = 'var(--grey-border)'
      }}
    >
      <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={26} />
      <span style={{ flex: 1 }}>
        {alumno.nombre} {alumno.apellidos}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 700 }}>
        + Vincular
      </span>
    </div>
  )
}

function SectionHeader({ icon, title }) {
  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--grey-border)',
      borderTop: '1px solid var(--grey-border)',
      background: 'var(--white-off)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </span>
    </div>
  )
}

const miniLabel = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--grey-mid)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 6,
}