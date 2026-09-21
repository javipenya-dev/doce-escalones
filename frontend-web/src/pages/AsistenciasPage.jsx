import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { asistenciasService, profesoresService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, Spinner, EmptyState, Button } from '../components/ui'

const CATEGORIAS = [
  { value: '', label: 'Todas' },
  { value: 'normal', label: '📚 Normal' },
  { value: 'ingles', label: '🇬🇧 Inglés' },
  { value: 'sesion', label: '🏥 Sesión' },
]

const CAT_ICON = { normal: '📚', ingles: '🇬🇧', sesion: '🏥' }

const hoy = () => new Date().toISOString().slice(0, 10)
const hace30 = () => {
  const d = new Date(); d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

export function AsistenciasPage() {
  const navigate = useNavigate()
  const [asistencias, setAsistencias] = useState([])
  const [profesores, setProfesores] = useState([])
  const [loading, setLoading] = useState(false)

  const [filtros, setFiltros] = useState({
    fecha_desde: hace30(),
    fecha_hasta: hoy(),
    profesor_id: '',
    categoria: '',
  })

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...filtros }
      if (!params.profesor_id) delete params.profesor_id
      if (!params.categoria) delete params.categoria
      const { data } = await asistenciasService.listar(params)
      setAsistencias(data)
    } catch {
      toast.error('No se pudieron cargar las asistencias')
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    profesoresService.listar().then(({ data }) => setProfesores(data)).catch(() => {})
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  // Agrupar por fecha para mostrar separadores de día
  const porFecha = asistencias.reduce((acc, a) => {
    const key = a.fecha
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  const totalHoras = asistencias
    .filter(a => !a.es_sesion)
    .reduce((s, a) => s + a.duracion_min / 60, 0)
  const totalSesiones = asistencias.filter(a => a.es_sesion).length

  return (
    <>
      <Topbar titulo="Asistencias" subtitulo="Historial global de clases y sesiones" />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <span>🔍</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Filtros</span>
            <button
              onClick={() => setFiltros({ fecha_desde: hace30(), fecha_hasta: hoy(), profesor_id: '', categoria: '' })}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--grey-mid)' }}
            >
              Limpiar
            </button>
          </CardHeader>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>Desde</label>
              <input type="date" value={filtros.fecha_desde} onChange={e => set('fecha_desde', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Hasta</label>
              <input type="date" value={filtros.fecha_hasta} onChange={e => set('fecha_hasta', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Profesor</label>
              <select value={filtros.profesor_id} onChange={e => set('profesor_id', e.target.value)} style={inputStyle}>
                <option value="">Todos</option>
                {profesores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Categoría</label>
              <select value={filtros.categoria} onChange={e => set('categoria', e.target.value)} style={inputStyle}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </Card>

        {/* Resumen rápido */}
        {!loading && asistencias.length > 0 && (
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { icon: '✅', label: 'Registros', value: asistencias.length },
              { icon: '⏱️', label: 'Horas clases', value: `${totalHoras.toFixed(1)}h` },
              { icon: '🏥', label: 'Sesiones', value: totalSesiones },
              { icon: '⚠️', label: 'No sincronizadas', value: asistencias.filter(a => !a.sincronizado).length },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: 'var(--white)', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius)', padding: '12px 16px',
              }}>
                <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={36} /></div>
        ) : asistencias.length === 0 ? (
          <EmptyState icon="✅" title="Sin asistencias" description="Prueba a ampliar el rango de fechas o cambiar los filtros" />
        ) : (
          <Card>
            <div style={{ overflowX: 'auto' }}>
              {Object.entries(porFecha).map(([fecha, registros]) => (
                <div key={fecha}>
                  {/* Separador de día */}
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
                      {/* Categoría */}
                      <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                        {CAT_ICON[a.categoria] || '📚'}
                      </span>

                      {/* Alumno */}
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

                      {/* Profesor */}
                      <div style={{ flex: '1 1 100px', fontSize: '0.82rem', color: 'var(--grey-mid)', minWidth: 0 }}>
                        👩‍🏫 {a.profesor_nombre}
                      </div>

                      {/* Hora y duración */}
                      <div style={{ flex: '0 0 auto', fontSize: '0.82rem', color: 'var(--grey-mid)', textAlign: 'right' }}>
                        {a.hora_inicio ? a.hora_inicio.slice(0, 5) : '—'}
                        <span style={{ marginLeft: 6, fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--grey-light)' }}>
                          {a.duracion_min}min
                        </span>
                      </div>

                      {/* Badge sync */}
                      {!a.sincronizado && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px',
                          background: '#FEF3C7', color: '#92400E',
                          borderRadius: 20, flexShrink: 0,
                        }}>
                          OFFLINE
                        </span>
                      )}
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

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600,
  color: 'var(--grey-mid)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4,
}
const inputStyle = {
  fontFamily: 'var(--font-body)', fontSize: '0.85rem',
  padding: '7px 10px', border: '1px solid var(--grey-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--white)',
  color: 'var(--black)', outline: 'none',
}
