import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { asistenciasService, profesoresService, alumnosService, tarifasService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, Spinner, EmptyState, Button } from '../components/ui'

const CATEGORIAS = [
  { value: '',        label: 'Todas' },
  { value: 'normal',  label: '📚 Normal' },
  { value: 'ingles',  label: '🇬🇧 Inglés' },
  { value: 'sesion',  label: '🏥 Sesión' },
]

const CAT_ICON = { normal: '📚', ingles: '🇬🇧', sesion: '🏥' }

const PRESETS = [
  { key: 'hoy',   label: 'Hoy' },
  { key: 'semana',label: 'Esta semana' },
  { key: 'mes',   label: 'Este mes' },
  { key: '30d',   label: 'Últimos 30 días' },
  { key: 'rango', label: 'Rango personalizado' },
]

const toISO = (d) => d.toISOString().slice(0, 10)
const hoy = () => toISO(new Date())

const rangoPreset = (key) => {
  const h = new Date()
  if (key === 'hoy') return { desde: toISO(h), hasta: toISO(h) }
  if (key === 'semana') {
    const lunes = new Date(h); const d = (h.getDay() + 6) % 7
    lunes.setDate(h.getDate() - d)
    return { desde: toISO(lunes), hasta: toISO(h) }
  }
  if (key === 'mes') {
    const primero = new Date(h.getFullYear(), h.getMonth(), 1)
    return { desde: toISO(primero), hasta: toISO(h) }
  }
  if (key === '30d') {
    const d = new Date(h); d.setDate(h.getDate() - 30)
    return { desde: toISO(d), hasta: toISO(h) }
  }
  return null
}

/* ── MODAL REGISTRAR / EDITAR ASISTENCIA ────────────── */
function ModalAsistencia({ asistencia, onClose, onGuardado }) {
  const esEdicion = Boolean(asistencia)
  const [alumnos, setAlumnos] = useState([])
  const [profesores, setProfesores] = useState([])
  const [tiposClase, setTiposClase] = useState([])
  const [busquedaAlumno, setBusquedaAlumno] = useState('')
  const [form, setForm] = useState({
    alumno_id:     asistencia?.alumno_id     || '',
    tipo_clase_id: asistencia?.tipo_clase_id || '',
    profesor_id:   asistencia?.profesor_id   || '',
    fecha:         asistencia?.fecha          || hoy(),
    hora_inicio:   asistencia?.hora_inicio  ? asistencia.hora_inicio.slice(0,5) : '10:00',
    duracion_min:  asistencia?.duracion_min   || 60,
  })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})

  // Cargar catálogos
  useEffect(() => {
    if (!esEdicion) {
      alumnosService.listar({ activo: true }).then(({ data }) => setAlumnos(data)).catch(() => {})
    }
    profesoresService.listar({ activo: true, incluir_admins: true }).then(({ data }) => setProfesores(data)).catch(() => {})
    tarifasService.tiposClase().then(({ data }) => setTiposClase(data)).catch(() => {})
  }, [esEdicion])

  const alumnoSeleccionado = alumnos.find(a => a.id === Number(form.alumno_id))

  const alumnosFiltrados = useMemo(() => {
    if (!busquedaAlumno.trim()) return alumnos.slice(0, 20)
    const q = busquedaAlumno.toLowerCase()
    return alumnos
      .filter(a => `${a.nombre} ${a.apellidos}`.toLowerCase().includes(q))
      .slice(0, 20)
  }, [alumnos, busquedaAlumno])

  const tipoSeleccionado = tiposClase.find(t => t.id === Number(form.tipo_clase_id))
  const esSesion = tipoSeleccionado?.categoria === 'sesion'

  const validar = () => {
    const e = {}
    if (!esEdicion) {
      if (!form.alumno_id)     e.alumno_id     = 'Selecciona un alumno'
      if (!form.tipo_clase_id) e.tipo_clase_id = 'Selecciona tipo de clase'
      if (!form.profesor_id)   e.profesor_id   = 'Selecciona el profesor que dio la clase'
      if (!form.fecha)         e.fecha         = 'Indica la fecha'
    } else {
      if (!form.profesor_id)   e.profesor_id   = 'Selecciona el profesor'
      if (!form.tipo_clase_id) e.tipo_clase_id = 'Selecciona tipo de clase'
      if (!form.fecha)         e.fecha         = 'Indica la fecha'
    }
    if (!form.duracion_min || form.duracion_min <= 0 || form.duracion_min > 240) {
      e.duracion_min = 'Duración entre 1 y 240 minutos'
    }
    return e
  }

  const handleSubmit = async () => {
    const e = validar()
    if (Object.keys(e).length > 0) { setErrores(e); return }

    setGuardando(true)
    try {
      if (esEdicion) {
        await asistenciasService.actualizar(asistencia.id, {
          profesor_id:   form.profesor_id ? Number(form.profesor_id) : null,
          tipo_clase_id: form.tipo_clase_id ? Number(form.tipo_clase_id) : null,
          fecha:         form.fecha,
          hora_inicio:   form.hora_inicio || null,
          duracion_min:  Number(form.duracion_min),
        })
        toast.success('Asistencia corregida')
      } else {
        await asistenciasService.registrar({
          alumno_id:      Number(form.alumno_id),
          pack_alumno_id: 0,
          tipo_clase_id:  Number(form.tipo_clase_id),
          profesor_id:    Number(form.profesor_id),
          fecha:          form.fecha,
          hora_inicio:    form.hora_inicio || null,
          duracion_min:   Number(form.duracion_min),
          es_sesion:      esSesion,
        })
        toast.success('Asistencia registrada')
      }
      onGuardado()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const set = (k) => (e) => {
    const v = e.target.value
    setForm(f => ({ ...f, [k]: v }))
    if (errores[k]) setErrores(er => ({ ...er, [k]: null }))
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
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 20 }}>
          {esEdicion ? '✏️ Editar asistencia' : '➕ Registrar asistencia'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Alumno (solo en crear) */}
          {!esEdicion && (
            <div>
              <label style={labelStyle}>Alumno *</label>
              {alumnoSeleccionado ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: 'var(--orange-pale)',
                  border: '1px solid var(--orange)', borderRadius: 'var(--radius-sm)',
                }}>
                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600 }}>
                    {alumnoSeleccionado.nombre} {alumnoSeleccionado.apellidos}
                  </span>
                  <button
                    onClick={() => { setForm(f => ({ ...f, alumno_id: '' })); setBusquedaAlumno('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grey-mid)', fontSize: '1rem' }}
                  >✕</button>
                </div>
              ) : (
                <>
                  <input
                    type="text" placeholder="Buscar alumno por nombre..."
                    value={busquedaAlumno} onChange={e => setBusquedaAlumno(e.target.value)}
                    style={inputStyle}
                  />
                  {busquedaAlumno.trim() && (
                    <div style={{
                      maxHeight: 180, overflowY: 'auto', marginTop: 4,
                      border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--white)',
                    }}>
                      {alumnosFiltrados.length === 0 ? (
                        <div style={{ padding: 12, color: 'var(--grey-mid)', fontSize: '0.8rem', textAlign: 'center' }}>
                          Sin resultados
                        </div>
                      ) : alumnosFiltrados.map(a => (
                        <div
                          key={a.id}
                          onClick={() => {
                            setForm(f => ({ ...f, alumno_id: a.id }))
                            setBusquedaAlumno('')
                          }}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem',
                            borderBottom: '1px solid var(--white-off)',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {a.nombre} {a.apellidos}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {errores.alumno_id && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.alumno_id}</div>}
            </div>
          )}

          {/* Tipo de clase */}
          <div>
            <label style={labelStyle}>Tipo de clase *</label>
            <select value={form.tipo_clase_id} onChange={set('tipo_clase_id')} style={inputStyle}>
              <option value="">— Selecciona —</option>
              {tiposClase.map(t => (
                <option key={t.id} value={t.id}>
                  {CAT_ICON[t.categoria] || '📚'} {t.nombre}
                </option>
              ))}
            </select>
            {errores.tipo_clase_id && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.tipo_clase_id}</div>}
          </div>

          {/* Profesor */}
          <div>
            <label style={labelStyle}>Profesor *</label>
            <select value={form.profesor_id} onChange={set('profesor_id')} style={inputStyle}>
              <option value="">— Selecciona el profesor —</option>
              {profesores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
              ))}
            </select>
            <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', marginTop: 3 }}>
              Se usa para informes y para el color en el calendario.
            </div>
            {errores.profesor_id && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.profesor_id}</div>}
          </div>

          {/* Fecha */}
          <div>
            <label style={labelStyle}>Fecha *</label>
            <input type="date" value={form.fecha} onChange={set('fecha')} style={inputStyle} />
            {errores.fecha && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.fecha}</div>}
          </div>

          {/* Hora inicio */}
          <div>
            <label style={labelStyle}>Hora de inicio</label>
            <input type="time" value={form.hora_inicio} onChange={set('hora_inicio')} style={inputStyle} />
          </div>

          {/* Duración */}
          <div>
            <label style={labelStyle}>Duración *</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[30, 45, 60, 90].map(min => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, duracion_min: min }))}
                  style={{
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${Number(form.duracion_min) === min ? 'var(--orange)' : 'var(--grey-border)'}`,
                    background: Number(form.duracion_min) === min ? 'var(--orange-pale)' : 'white',
                    color: Number(form.duracion_min) === min ? 'var(--orange-dark)' : 'var(--grey-mid)',
                    fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                  }}
                >
                  {min} min
                </button>
              ))}
            </div>
            <input type="number" min="1" max="240" step="5"
              value={form.duracion_min} onChange={set('duracion_min')} style={inputStyle}
            />
            {errores.duracion_min && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.duracion_min}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={guardando}>
            {esEdicion ? 'Guardar cambios' : 'Registrar asistencia'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600,
  color: 'var(--grey-mid)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4,
}
const inputStyle = {
  fontFamily: 'var(--font-body)', fontSize: '0.85rem',
  padding: '7px 10px', border: '1px solid var(--grey-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--white)',
  color: 'var(--black)', outline: 'none', width: '100%', boxSizing: 'border-box',
}

/* ── PAGE ───────────────────────────────────────────── */
export function AsistenciasPage() {
  const navigate = useNavigate()
  const [asistencias, setAsistencias] = useState([])
  const [profesores, setProfesores] = useState([])
  const [loading, setLoading] = useState(false)

  // Filtros
  const [preset, setPreset] = useState('mes')
  const [fechaDesde, setFechaDesde] = useState(() => rangoPreset('mes').desde)
  const [fechaHasta, setFechaHasta] = useState(() => rangoPreset('mes').hasta)
  const [profesorId, setProfesorId] = useState('')
  const [categoria, setCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')

  // Filtros clicables (tarjetas)
  const [filtroTipo, setFiltroTipo] = useState(null)
  const [soloNoSync, setSoloNoSync] = useState(false)

  // Modal
  const [modalAbierto, setModalAbierto] = useState(false)
  const [asistenciaEditando, setAsistenciaEditando] = useState(null)

  // ── Presets de fecha ──
  const aplicarPreset = (key) => {
    setPreset(key)
    if (key === 'rango') return
    const r = rangoPreset(key)
    if (r) { setFechaDesde(r.desde); setFechaHasta(r.hasta) }
  }

  const onFechaChange = (k, v) => {
    setPreset('rango')
    if (k === 'desde') setFechaDesde(v); else setFechaHasta(v)
  }

  // ── Carga ──
  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, limit: 500 }
      if (profesorId) params.profesor_id = profesorId
      if (categoria) params.categoria = categoria
      const { data } = await asistenciasService.listar(params)
      setAsistencias(data)
    } catch {
      toast.error('No se pudieron cargar las asistencias')
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta, profesorId, categoria])

  useEffect(() => {
    profesoresService.listar({ activo: true, incluir_admins: true }).then(({ data }) => setProfesores(data)).catch(() => {})
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Filtrado local ──
  const filtradas = useMemo(() => {
    let list = asistencias
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(a => a.alumno_nombre.toLowerCase().includes(q))
    }
    if (filtroTipo === 'normal') list = list.filter(a => !a.es_sesion)
    if (filtroTipo === 'sesion') list = list.filter(a => a.es_sesion)
    if (soloNoSync) list = list.filter(a => !a.sincronizado)
    return list
  }, [asistencias, busqueda, filtroTipo, soloNoSync])

  const totalHoras = filtradas
    .filter(a => !a.es_sesion)
    .reduce((s, a) => s + a.duracion_min / 60, 0)
  const totalSesiones = filtradas.filter(a => a.es_sesion).length
  const noSyncCount = filtradas.filter(a => !a.sincronizado).length

  const porFecha = useMemo(() => {
    return filtradas.reduce((acc, a) => {
      if (!acc[a.fecha]) acc[a.fecha] = []
      acc[a.fecha].push(a)
      return acc
    }, {})
  }, [filtradas])

  // ── Acciones ──
  const abrirNueva   = () => { setAsistenciaEditando(null); setModalAbierto(true) }
  const abrirEdicion = (a) => { setAsistenciaEditando(a);  setModalAbierto(true) }
  const cerrarModal  = () => { setModalAbierto(false); setAsistenciaEditando(null) }

  const handleEliminar = async (a) => {
    if (!confirm(`¿Eliminar la asistencia de ${a.alumno_nombre} del ${new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-ES')}?`)) return
    try {
      await asistenciasService.eliminar(a.id)
      toast.success('Asistencia eliminada')
      cargar()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar')
    }
  }

  const limpiarFiltros = () => {
    aplicarPreset('mes')
    setProfesorId('')
    setCategoria('')
    setBusqueda('')
    setFiltroTipo(null)
    setSoloNoSync(false)
  }

  const hayFiltrosActivos = busqueda || profesorId || categoria || filtroTipo || soloNoSync || preset === 'rango'

  return (
    <>
      <Topbar
        titulo="Asistencias"
        subtitulo={`${filtradas.length} registros`}
        accion={{ label: 'Registrar asistencia', icon: '➕', onClick: abrirNueva }}
      />

      {modalAbierto && (
        <ModalAsistencia
          asistencia={asistenciaEditando}
          onClose={cerrarModal}
          onGuardado={cargar}
        />
      )}

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <span>🔍</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Filtros</span>
            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--grey-mid)' }}>
                ✕ Limpiar filtros
              </button>
            )}
          </CardHeader>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => aplicarPreset(p.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${preset === p.key ? 'var(--orange)' : 'var(--grey-border)'}`,
                    background: preset === p.key ? 'var(--orange-pale)' : 'white',
                    color: preset === p.key ? 'var(--orange-dark)' : 'var(--grey-mid)',
                    fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                    transition: 'all 0.15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle}>Desde</label>
                <input type="date" value={fechaDesde} onChange={e => onFechaChange('desde', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Hasta</label>
                <input type="date" value={fechaHasta} onChange={e => onFechaChange('hasta', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Profesor</label>
                <select value={profesorId} onChange={e => setProfesorId(e.target.value)} style={inputStyle}>
                  <option value="">Todos</option>
                  {profesores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Categoría</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle}>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={labelStyle}>Buscar alumno</label>
                <input
                  type="text" placeholder="Nombre o apellidos..."
                  value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Tarjetas resumen CLICABLES */}
        {!loading && asistencias.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { key: 'total', icon: '✅', label: 'Registros', value: filtradas.length, activo: !filtroTipo && !soloNoSync, onClick: () => { setFiltroTipo(null); setSoloNoSync(false) } },
              { key: 'horas', icon: '⏱️', label: 'Horas clases', value: `${totalHoras.toFixed(1)}h`, activo: filtroTipo === 'normal', onClick: () => { setFiltroTipo(filtroTipo === 'normal' ? null : 'normal'); setSoloNoSync(false) } },
              { key: 'sesiones', icon: '🏥', label: 'Sesiones', value: totalSesiones, activo: filtroTipo === 'sesion', onClick: () => { setFiltroTipo(filtroTipo === 'sesion' ? null : 'sesion'); setSoloNoSync(false) } },
              { key: 'nosync', icon: '⚠️', label: 'No sincronizadas', value: noSyncCount, activo: soloNoSync, onClick: () => { setSoloNoSync(!soloNoSync); setFiltroTipo(null) } },
            ].map(s => (
              <div
                key={s.key}
                onClick={s.onClick}
                style={{
                  background: s.activo ? 'var(--orange-pale)' : 'var(--white)',
                  border: `1px solid ${s.activo ? 'var(--orange)' : 'var(--grey-border)'}`,
                  borderRadius: 'var(--radius)', padding: '12px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  transform: s.activo ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: s.activo ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
                  {s.activo && <span style={{ fontSize: '0.65rem', color: 'var(--orange-dark)', fontWeight: 700 }}>✕</span>}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4 }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={36} /></div>
        ) : filtradas.length === 0 ? (
          <EmptyState
            icon="✅"
            title={hayFiltrosActivos ? 'Sin resultados' : 'Sin asistencias'}
            description={hayFiltrosActivos ? 'Prueba a cambiar los filtros o el rango de fechas' : 'No hay asistencias en este rango'}
          />
        ) : (
          <Card>
            <div style={{ overflowX: 'auto' }}>
              {Object.entries(porFecha).map(([fecha, registros]) => (
                <div key={fecha}>
                  <div style={{
                    padding: '8px 20px', background: 'var(--white-off)',
                    borderTop: '1px solid var(--grey-border)',
                    borderBottom: '1px solid var(--grey-border)',
                    fontSize: '0.78rem', fontWeight: 700, color: 'var(--grey-mid)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    📅 {new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--grey-light)' }}>
                      {registros.length} registro{registros.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {registros.map((a, i) => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '11px 20px',
                      borderBottom: i < registros.length - 1 ? '1px solid var(--white-off)' : 'none',
                      transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                        {CAT_ICON[a.categoria] || '📚'}
                      </span>

                      <div style={{ flex: '2 1 160px', minWidth: 0 }}>
                        <div
                          style={{ fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', color: 'var(--orange)' }}
                          onClick={() => navigate(`/alumnos/${a.alumno_id}`)}
                        >
                          {a.alumno_nombre}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--grey-mid)', marginTop: 1 }}>
                          {a.tipo_clase}
                        </div>
                      </div>

                      <div style={{ flex: '1 1 100px', fontSize: '0.82rem', color: 'var(--grey-mid)', minWidth: 0 }}>
                        👩‍🏫 {a.profesor_nombre}
                      </div>

                      <div style={{ flex: '0 0 auto', fontSize: '0.82rem', color: 'var(--grey-mid)', textAlign: 'right' }}>
                        {a.hora_inicio ? a.hora_inicio.slice(0, 5) : '—'}
                        <span style={{ marginLeft: 6, fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--grey-light)' }}>
                          {a.duracion_min}min
                        </span>
                      </div>

                      {!a.sincronizado && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px',
                          background: '#FEF3C7', color: '#92400E',
                          borderRadius: 20, flexShrink: 0,
                        }}>
                          OFFLINE
                        </span>
                      )}

                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => abrirEdicion(a)}
                          title="Editar"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 4, fontSize: '0.9rem', color: 'var(--grey-mid)',
                          }}
                        >✏️</button>
                        <button
                          onClick={() => handleEliminar(a)}
                          title="Eliminar"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 4, fontSize: '0.9rem', color: 'var(--red)',
                          }}
                        >🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}