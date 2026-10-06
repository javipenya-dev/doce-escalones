import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { dashboardService, asistenciasService, cobrosService } from '../utils/api'

const TIPO_CONFIG = {
  asistencia_nueva:     { icon: '✅', label: 'Asistencia',  color: '#16A34A', bg: '#DCFCE7' },
  asistencia_editada:   { icon: '✏️', label: 'Editada',     color: '#0891B2', bg: '#CFFAFE' },
  asistencia_eliminada: { icon: '🗑️', label: 'Eliminada',   color: '#DC2626', bg: '#FEE2E2' },
  cobro_realizado:      { icon: '💳', label: 'Cobro',       color: '#F26419', bg: 'var(--orange-pale)' },
  cobro_anulado:        { icon: '🚫', label: 'Anulado',     color: '#DC2626', bg: '#FEE2E2' },
  sync_completado:      { icon: '🔄', label: 'Sync',        color: '#7C3AED', bg: '#F3E8FF' },
}

const toISO = (d) => d.toISOString().slice(0, 10)
const hoyISO = () => toISO(new Date())

function relativo(fechaMs) {
  const seg = Math.floor((Date.now() - fechaMs) / 1000)
  if (seg < 10)  return 'ahora'
  if (seg < 60)  return `hace ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60)  return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `hace ${h}h`
  return new Date(fechaMs).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function horaCorta(horaStr) {
  if (!horaStr) return '—'
  return horaStr.slice(0, 5)  // "16:00:00" → "16:00"
}

function describirEvento(ev) {
  const partes = []
  if (ev.alumno_nombre)   partes.push(<strong key="a">{ev.alumno_nombre}</strong>)
  if (ev.profesor_nombre) partes.push(<span key="p" style={{ color: 'var(--grey-mid)' }}> · {ev.profesor_nombre}</span>)
  if (ev.total !== undefined && ev.total !== null) {
    partes.push(<span key="t" style={{ marginLeft: 6, color: 'var(--orange)', fontWeight: 700 }}>· {Number(ev.total).toFixed(2)}€</span>)
  }
  if (ev.procesadas !== undefined) {
    partes.push(<span key="pr" style={{ marginLeft: 6 }}>· {ev.procesadas} procesadas</span>)
  }
  return partes
}

export function DirectoPage() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [filtro, setFiltro] = useState('todo')
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const [stats, setStats] = useState(null)
  const [ahora, setAhora] = useState(null)
  const [cargandoInicial, setCargandoInicial] = useState(true)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => forceTick(x => x + 1), 15000)
    return () => clearInterval(t)
  }, [])

  // ── Carga de resumen + precarga del feed ──
  const cargarResumen = useCallback(async () => {
    try {
      const [{ data: s }, { data: a }] = await Promise.all([
        dashboardService.stats(),
        dashboardService.ahora(),
      ])
      setStats(s)
      setAhora(a)
    } catch { /* silencioso */ }
  }, [])

  const precargarFeed = useCallback(async () => {
    try {
      const [asist, cobros] = await Promise.all([
        asistenciasService.listar({ fecha_desde: hoyISO(), fecha_hasta: hoyISO(), limit: 30 }),
        cobrosService.listar({ limit: 30 }),
      ])

      // Convertir asistencias de hoy a eventos de feed
      const eventosAsist = (asist.data || []).map(a => ({
        id:          `a-${a.id}`,
        tipo:        'asistencia_nueva',
        ts:          new Date(`${a.fecha}T${a.hora_inicio || '12:00:00'}`).getTime(),
        alumno_id:   a.alumno_id,
        alumno_nombre: a.alumno_nombre,
        profesor_nombre: a.profesor_nombre,
        _histórico: true,
      }))

      // Convertir cobros a eventos de feed
      const eventosCobro = (cobros.data || []).map(c => ({
        id:          `c-${c.id}`,
        tipo:        c.anulado ? 'cobro_anulado' : 'cobro_realizado',
        ts:          new Date(c.fecha).getTime(),
        alumno_id:   c.alumno_id,
        alumno_nombre: c.alumno_nombre || '—',
        total:       c.total,
        estado_nuevo: c.anulado ? 'rojo' : 'verde',
        _histórico: true,
      }))

      // Unir, ordenar por ts descendente, tomar los últimos 50
      const todos = [...eventosAsist, ...eventosCobro]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 50)

      setLogs(todos)
    } catch { /* silencioso */ }
    finally { setCargandoInicial(false) }
  }, [])

  useEffect(() => {
    cargarResumen()
    precargarFeed()
    const t = setInterval(cargarResumen, 60000)
    return () => clearInterval(t)
  }, [cargarResumen, precargarFeed])

  // ── WebSocket en vivo ──
  const onWsMessage = useCallback((msg) => {
    setLogs(prev => [
      { ...msg, id: `${Date.now()}-${Math.random()}`, ts: Date.now() },
      ...prev,
    ].slice(0, 100))
    if (['asistencia_nueva','asistencia_eliminada','cobro_realizado','cobro_anulado'].includes(msg.tipo)) {
      cargarResumen()
    }
  }, [cargarResumen])

  const { conectado } = useWebSocket(onWsMessage)

  // ── Filtrado ──
  const logsFiltrados = useMemo(() => {
    if (filtro === 'todo') return logs
    if (filtro === 'asistencias') return logs.filter(l => l.tipo?.startsWith('asistencia') || l.tipo === 'sync_completado')
    if (filtro === 'cobros')      return logs.filter(l => l.tipo?.startsWith('cobro'))
    return logs
  }, [logs, filtro])

  const totalAsistencias = logs.filter(l => l.tipo === 'asistencia_nueva').length
  const totalCobros      = logs.filter(l => l.tipo === 'cobro_realizado').length

  const cardStyle = {
    background: 'var(--white)',
    border: '1px solid var(--grey-border)',
    borderRadius: 'var(--radius)',
    padding: '16px 20px',
    boxShadow: 'var(--shadow-sm)',
  }

  return (
    <div style={{
      padding: pantallaCompleta ? '16px 20px' : '24px 32px',
      maxWidth: pantallaCompleta ? '100%' : 1600,
      margin: '0 auto',
      fontFamily: 'var(--font-body)',
      minHeight: '100vh',
      transition: 'padding 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: pantallaCompleta ? '2rem' : '1.6rem', fontWeight: 900, color: 'var(--black)', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            📡 Panel en Directo
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', marginTop: 4 }}>
            Monitorización en tiempo real de asistencias y cobros
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 20,
            background: conectado ? 'var(--green-bg)' : '#FEE2E2',
            color: conectado ? 'var(--green-text)' : '#DC2626',
            fontSize: '0.75rem', fontWeight: 700,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: conectado ? 'var(--green-text)' : '#DC2626',
              display: 'inline-block',
              boxShadow: conectado ? '0 0 0 4px rgba(22,163,74,0.2)' : 'none',
              animation: conectado ? 'pulse 2s infinite' : 'none',
            }} />
            {conectado ? 'CONECTADO' : 'DESCONECTADO'}
          </div>

          <button
            onClick={() => setPantallaCompleta(v => !v)}
            style={{
              background: 'var(--white)', border: '1px solid var(--grey-border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              padding: '7px 12px', fontSize: '0.8rem', color: 'var(--grey-mid)',
              fontFamily: 'var(--font-body)', fontWeight: 600,
            }}
          >
            {pantallaCompleta ? '✕ Salir' : '⛶ Pantalla completa'}
          </button>
        </div>
      </div>

      {/* Tarjetas resumen */}
      {!pantallaCompleta && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>✅</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', fontWeight: 700, textTransform: 'uppercase' }}>Asistencias hoy</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 6 }}>
              {stats?.asistencias_hoy ?? '—'}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>🎓</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', fontWeight: 700, textTransform: 'uppercase' }}>Clases ahora</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 6 }}>
              {ahora?.clases_en_curso?.length ?? '—'}
            </div>
            {ahora?.total_alumnos_ahora > 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', marginTop: 2 }}>
                {ahora.total_alumnos_ahora} alumnos dentro
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>💳</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', fontWeight: 700, textTransform: 'uppercase' }}>Cobrado (mes)</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 6, color: 'var(--orange)' }}>
              {stats?.recaudado_mes != null ? `${Number(stats.recaudado_mes).toFixed(0)}€` : '—'}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>⚡</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', fontWeight: 700, textTransform: 'uppercase' }}>En esta sesión</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 6 }}>
              {totalAsistencias + totalCobros}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', marginTop: 2 }}>
              {totalAsistencias} asis · {totalCobros} cobros
            </div>
          </div>
        </div>
      )}

      {/* Clases ahora mismo — AGRUPADAS POR PROFESOR */}
{!pantallaCompleta && ahora?.clases_en_curso?.length > 0 && (() => {
  // Agrupar por profesor
  const porProfe = ahora.clases_en_curso.reduce((acc, c) => {
    const key = c.profesor_id
    if (!acc[key]) {
      acc[key] = {
        profesor_id: c.profesor_id,
        profesor_nombre: c.profesor_nombre,
        clases: [],
      }
    }
    acc[key].clases.push(c)
    return acc
  }, {})

  // Ordenar cada profesor por hora
  Object.values(porProfe).forEach(p => {
    p.clases.sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''))
  })

  // Ordenar profesores por hora de su primera clase
  const profesOrdenados = Object.values(porProfe).sort((a, b) => {
    const ha = a.clases[0]?.hora_inicio || ''
    const hb = b.clases[0]?.hora_inicio || ''
    return ha.localeCompare(hb)
  })

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{
        fontSize: '0.85rem', fontWeight: 700, marginBottom: 14,
        textTransform: 'uppercase', color: 'var(--grey-mid)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        🟢 Clases ahora mismo
        <span style={{
          fontSize: '0.68rem', fontWeight: 600,
          color: 'var(--grey-light)',
          textTransform: 'none', letterSpacing: 0,
        }}>
          · {profesOrdenados.length} profesor{profesOrdenados.length !== 1 ? 'es' : ''}
          · {ahora.clases_en_curso.length} clase{ahora.clases_en_curso.length !== 1 ? 's' : ''}
          · {ahora.total_alumnos_ahora} alumno{ahora.total_alumnos_ahora !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{
        display: 'grid',
        //gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
      }}>
        {profesOrdenados.map(prof => (
          <div
            key={prof.profesor_id}
            style={{
              border: '1px solid var(--grey-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--white-off)',
              overflow: 'hidden',
            }}
          >
            {/* Cabecera del profesor */}
            <div style={{
              padding: '9px 12px',
              background: 'var(--white)',
              borderBottom: '1px solid var(--grey-border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '0.95rem' }}>👩‍🏫</span>
              <span style={{
                fontWeight: 700, fontSize: '0.82rem',
                color: 'var(--black)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {prof.profesor_nombre}
              </span>
              <span style={{
                fontSize: '0.66rem',
                padding: '2px 7px',
                borderRadius: 12,
                background: 'var(--orange-pale)',
                color: 'var(--orange-dark)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                {prof.clases.reduce((s, c) => s + (c.alumnos?.length || 0), 0)} alumnos
              </span>
            </div>

            {/* Lista de horas con sus clases */}
            <div style={{ padding: '6px 0' }}>
              {prof.clases.map((c, i) => (
                <div
                  key={i}
                  style={{
                    padding: '7px 12px',
                    borderBottom: i < prof.clases.length - 1 ? '1px solid var(--white-off)' : 'none',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Hora */}
                  <div style={{
                    flexShrink: 0,
                    fontFamily: 'DM Mono, monospace',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: 'var(--orange)',
                    minWidth: 40,
                    paddingTop: 2,
                  }}>
                    {horaCorta(c.hora_inicio)}
                  </div>

                  {/* Detalle de la clase */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Tipo */}
                    <div style={{
                      fontSize: '0.62rem',
                      padding: '1px 7px',
                      borderRadius: 12,
                      background: 'var(--orange-pale)',
                      color: 'var(--orange-dark)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      display: 'inline-block',
                      marginBottom: 5,
                    }}>
                      {c.tipo_clase}
                    </div>

                    {/* Alumnos */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {(c.alumnos || []).map(al => (
                        <span
                          key={al.id}
                          onClick={() => navigate(`/alumnos/${al.id}`)}
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 7px',
                            borderRadius: 12,
                            background: 'var(--white)',
                            border: '1px solid var(--grey-border)',
                            cursor: 'pointer',
                            color: 'var(--black)',
                            fontWeight: 500,
                            transition: 'background 0.15s, border-color 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--orange-pale)'
                            e.currentTarget.style.borderColor = 'var(--orange-mid)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'var(--white)'
                            e.currentTarget.style.borderColor = 'var(--grey-border)'
                          }}
                        >
                          {al.nombre} {al.apellidos}
                        </span>
                      ))}
                      {(!c.alumnos || c.alumnos.length === 0) && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--grey-light)' }}>
                          Sin alumnos
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})()}
      {/* Feed */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{
          padding: '12px 20px', background: 'var(--black)', color: 'var(--white)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>📋 Feed de actividad</div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'todo', label: `Todo (${logs.length})` },
              { key: 'asistencias', label: 'Asistencias' },
              { key: 'cobros', label: 'Cobros' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                style={{
                  background: filtro === f.key ? 'var(--orange)' : 'rgba(255,255,255,0.1)',
                  border: 'none', borderRadius: 20, cursor: 'pointer',
                  padding: '5px 14px', color: 'white',
                  fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                  transition: 'background 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
            {logs.length > 0 && (
              <button
                onClick={() => setLogs([])}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 20, cursor: 'pointer',
                  padding: '5px 12px', color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.72rem', fontFamily: 'var(--font-body)',
                }}
                title="Limpiar feed"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        <div style={{ minHeight: 300, maxHeight: pantallaCompleta ? 'calc(100vh - 200px)' : 600, overflowY: 'auto' }}>
          {cargandoInicial ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.9rem' }}>
              Cargando eventos del día...
            </div>
          ) : logsFiltrados.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.9rem' }}>
              {logs.length === 0
                ? 'Sin actividad hoy todavía. Registra una asistencia o cobro para ver la actividad.'
                : 'No hay eventos con este filtro.'}
            </div>
          ) : (
            logsFiltrados.map(log => {
              const cfg = TIPO_CONFIG[log.tipo] || { icon: '📌', label: log.tipo || 'Evento', color: 'var(--grey-mid)', bg: 'var(--white-off)' }
              return (
                <div key={log.id} style={{
                  padding: pantallaCompleta ? '18px 24px' : '14px 20px',
                  borderBottom: '1px solid var(--white-off)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 16, flexWrap: 'wrap',
                  transition: 'background 0.2s',
                  opacity: log._histórico ? 0.85 : 1,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: pantallaCompleta ? '1.6rem' : '1.2rem',
                      width: pantallaCompleta ? 48 : 36, height: pantallaCompleta ? 48 : 36,
                      background: cfg.bg, borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {cfg.icon}
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                          padding: '2px 8px', borderRadius: 4,
                          background: cfg.bg, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--grey-light)', fontFamily: 'DM Mono, monospace' }}>
                          {relativo(log.ts)}
                        </span>
                      </div>
                      <div style={{ fontSize: pantallaCompleta ? '1rem' : '0.88rem', color: 'var(--black)' }}>
                        {describirEvento(log)}
                      </div>
                    </div>
                  </div>

                  {log.estado_nuevo && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 20,
                      background: log.estado_nuevo === 'verde' ? 'var(--green-bg)' : (log.estado_nuevo === 'rojo' ? '#FEE2E2' : 'var(--orange-pale)'),
                      color: log.estado_nuevo === 'verde' ? 'var(--green-text)' : (log.estado_nuevo === 'rojo' ? '#DC2626' : 'var(--orange-dark)'),
                    }}>
                      {log.estado_nuevo}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}