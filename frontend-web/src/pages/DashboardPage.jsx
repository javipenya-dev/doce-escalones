import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { dashboardService } from '../utils/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { Topbar } from '../components/layout/Topbar'
import {
  Card, CardHeader,
  EstadoBadge, TipoBadge, Avatar, ProgressBar,
  Button, Spinner, EmptyState,
} from '../components/ui'

/* ── STAT CARD ───────────────────────────────────── */
function StatCard({ icon, label, value, sub, accent = false, delay = 0 }) {
  return (
    <div style={{
      background: accent ? 'var(--orange)' : 'var(--white)',
      border: `1px solid ${accent ? 'var(--orange)' : 'var(--grey-border)'}`,
      borderTop: !accent ? '3px solid var(--orange)' : undefined,
      borderRadius: 'var(--radius)',
      padding: '20px',
      display: 'flex', flexDirection: 'column', gap: 8,
      animation: `fadeUp 0.4s ease ${delay}s both`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: accent ? 'rgba(255,255,255,0.2)' : 'var(--orange-pale)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: accent ? 'rgba(255,255,255,0.7)' : 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color: accent ? 'white' : 'var(--black)', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value ?? <Spinner size={24} color={accent ? 'white' : 'var(--orange)'} />}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: accent ? 'rgba(255,255,255,0.6)' : 'var(--grey-light)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/* ── LIVE BADGE ──────────────────────────────────── */
function LiveBadge() {
  return (
    <span style={{
      marginLeft: 'auto',
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: '0.62rem', fontWeight: 700,
      color: 'var(--orange)', background: 'var(--orange-pale)',
      padding: '3px 8px', borderRadius: 20, letterSpacing: '0.06em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)', animation: 'pulse 1.5s infinite' }} />
      EN VIVO
    </span>
  )
}

/* ── ETIQUETA CATEGORÍA (para deudas acumuladas) ──── */
function CategoriaIcono({ categoria }) {
  const iconos = { normal: '📚', ingles: '🇬🇧', sesion: '🏥' }
  return <span>{iconos[categoria] || '📚'}</span>
}

/* ── DASHBOARD PAGE ──────────────────────────────── */
export function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [clases, setClases] = useState([])
  const [resumenMes, setResumenMes] = useState([])
  const [alertas, setAlertas] = useState([])
  const [deudasAcumuladas, setDeudasAcumuladas] = useState([])
  const [loadingClases, setLoadingClases] = useState(true)
  const [loadingMes, setLoadingMes] = useState(true)
  const [loadingAlertas, setLoadingAlertas] = useState(true)
  const [loadingDeudas, setLoadingDeudas] = useState(true)
  const [mostrarDeudas, setMostrarDeudas] = useState(false)

  // Handler de mensajes WebSocket
  const handleWsMessage = useCallback((msg) => {
    if (msg.tipo === 'asistencia_nueva') {
      toast.success(`✅ ${msg.alumno_nombre || 'Alumno'} — asistencia registrada`, { duration: 3000 })
      cargarClasesAhora()
      cargarStats()
      cargarAlertasSemaforo()
      cargarDeudasAcumuladas()
    }
    if (msg.tipo === 'cobro_realizado') {
      toast.success(`💳 Cobro registrado`, { duration: 3000 })
      cargarStats()
      cargarResumenMes()
      cargarAlertasSemaforo()
      cargarDeudasAcumuladas()
    }
  }, [])

  const { conectado } = useWebSocket(handleWsMessage)

  const cargarStats = async () => {
    try {
      const { data } = await dashboardService.stats()
      setStats(data)
    } catch (e) {
      console.error('Error cargando stats:', e)
    }
  }

  const cargarClasesAhora = async () => {
    setLoadingClases(true)
    try {
      const { data } = await dashboardService.ahora()
      setClases(data.clases_en_curso || [])
    } catch (e) {
      console.error('Error cargando clases:', e)
    } finally {
      setLoadingClases(false)
    }
  }

  const cargarResumenMes = async () => {
    setLoadingMes(true)
    try {
      const { data } = await dashboardService.mes()
      setResumenMes(data)
    } catch (e) {
      console.error('Error cargando resumen mes:', e)
    } finally {
      setLoadingMes(false)
    }
  }

  const cargarAlertasSemaforo = async () => {
    setLoadingAlertas(true)
    try {
      const data = await dashboardService.alertasSemaforo()
      setAlertas(data || [])
    } catch (e) {
      console.error('Error cargando alertas semáforo:', e)
    } finally {
      setLoadingAlertas(false)
    }
  }

  /**
   * Deudas acumuladas — panel HISTÓRICO independiente del mes actual.
   * A diferencia de alertasSemaforo (que solo mira el mes en curso y se
   * "reinicia" al cambiar de mes), esto recorre TODOS los packs pendientes
   * de cualquier alumno, sin importar de qué mes son sus asistencias.
   * Así un impago de hace 2 meses sigue visible hasta que se cobre.
   */
  const cargarDeudasAcumuladas = async () => {
    setLoadingDeudas(true)
    try {
      const { data } = await dashboardService.deudasAcumuladas()
      setDeudasAcumuladas(data || [])
    } catch (e) {
      console.error('Error cargando deudas acumuladas:', e)
    } finally {
      setLoadingDeudas(false)
    }
  }

  useEffect(() => {
    cargarStats()
    cargarClasesAhora()
    cargarResumenMes()
    cargarAlertasSemaforo()
    cargarDeudasAcumuladas()

    // Recargar fallback periódico cada 60 segundos
    const interval = setInterval(() => {
      cargarClasesAhora()
      cargarAlertasSemaforo()
      cargarDeudasAcumuladas()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const mesActual = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <Topbar
        titulo="Dashboard"
        subtitulo={hoy.charAt(0).toUpperCase() + hoy.slice(1)}
        wsConectado={conectado}
        accion={{ label: 'Nuevo cobro', icon: '➕', onClick: () => navigate('/cobros/nuevo') }}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 1. Tarjetas de Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard accent icon="👥" label="Alumnos activos"   value={stats?.alumnos_activos}    sub="+3 este mes"         delay={0.05} />
          <StatCard       icon="🔴" label="Pagos pendientes"  value={stats?.pagos_pendientes}    sub={stats ? `${stats.importe_pendiente.toFixed(0)}€ por cobrar` : ''} delay={0.10} />
          <StatCard       icon="✅" label="Asistencias hoy"   value={stats?.asistencias_hoy}     sub={`${clases.length} clases en curso`} delay={0.15} />
          <StatCard       icon="💶" label={`Recaudado (${new Date().toLocaleDateString('es-ES',{month:'short'})})`} value={stats ? `${stats.recaudado_mes.toFixed(0)}€` : null} sub="Efectivo + tarjeta + Bizum" delay={0.20} />
        </div>

        {/* 2. Sección del Semáforo Inteligente (Filtro Activo Urgente) */}
        {alertas.length > 0 && (
          <div style={{ 
            background: 'var(--white)', 
            padding: '20px', 
            borderRadius: 'var(--radius)', 
            border: '1px solid var(--grey-border)', 
            borderTop: '3px solid #EF4444',
            animation: 'fadeUp 0.4s ease 0.22s both'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700 }}>
              ⚠️ Control de Incidencias Requerido ({alertas.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
              {alertas.map((al) => {
                let badgeBg = '#FEE2E2'; let badgeColor = '#EF4444'; let msg = ''
                
                if (al.estado === 'rojo') {
                  msg = al.importe_debido ? `Falta cobro mensual (Estimado: ${al.importe_debido}€)` : 'Actividad registrada sin cobro asociado.'
                } else if (al.estado === 'amarillo') {
                  badgeBg = '#FEF3C7'; badgeColor = '#D97706'
                  msg = `Pack agotado (${al.horas_mes}h consumidas).`
                } else if (al.estado === 'naranja') {
                  badgeBg = '#FFEDD5'; badgeColor = '#EA580C'
                  msg = 'Mes largo (5 semanas): Evaluar horas extra.'
                }

                return (
                  <div 
                    key={al.id} 
                    onClick={() => navigate(`/alumnos/${al.id}`)}
                    style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      padding: '10px 14px', background: 'var(--white-off)', 
                      borderRadius: 'var(--radius-sm)', borderLeft: `4px solid ${badgeColor}`,
                      cursor: 'pointer', transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateX(2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--black)' }}>{al.nombre} {al.apellidos}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg}</div>
                    </div>
                    <span style={{ background: badgeBg, color: badgeColor, padding: '4px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', shrink: 0 }}>
                      {al.estado}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 2.5 PENDIENTES DE PAGO (HISTÓRICO) — no se resetea al cambiar de mes */}
        {deudasAcumuladas.length > 0 && (
          <div style={{
            background: 'var(--white)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--grey-border)',
            borderTop: '3px solid #9333EA',
            animation: 'fadeUp 0.4s ease 0.24s both',
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setMostrarDeudas(v => !v)}
              style={{
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>📌</span>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, flex: 1 }}>
                Pendientes de pago — histórico ({deudasAcumuladas.length})
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--grey-mid)' }}>
                {mostrarDeudas ? 'Ocultar ▲' : 'Ver detalle ▼'}
              </span>
            </div>

            {mostrarDeudas && (
              <div style={{ borderTop: '1px solid var(--grey-border)' }}>
                {loadingDeudas ? (
                  <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
                    <Spinner />
                  </div>
                ) : (
                  deudasAcumuladas.map((d) => {
                    const esVarios = d.meses_afectados > 1
                    return (
                      <div
                        key={d.pack_id}
                        onClick={() => navigate(`/alumnos/${d.alumno_id}`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 20px',
                          borderBottom: '1px solid var(--white-off)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <CategoriaIcono categoria={d.categoria_pendiente} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{d.alumno_nombre}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', marginTop: 2 }}>
                            {d.categoria_pendiente === 'sesion'
                              ? `${d.total_sesiones} sesiones`
                              : `${d.total_horas.toFixed(1)}h`}
                            {' · '}
                            {d.num_asistencias} clase{d.num_asistencias !== 1 ? 's' : ''}
                            {d.primera_asistencia && d.ultima_asistencia && (
                              <> · desde {new Date(d.primera_asistencia).toLocaleDateString('es-ES')}</>
                            )}
                          </div>
                        </div>
                        {esVarios && (
                          <span style={{
                            background: '#F3E8FF', color: '#9333EA',
                            padding: '3px 10px', borderRadius: 20,
                            fontSize: '0.68rem', fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}>
                            {d.meses_afectados} MESES
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. Paneles dobles (En Vivo / Historial Mes) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Panel en directo */}
          <Card style={{ animation: 'fadeUp 0.4s ease 0.25s both' }}>
            <CardHeader>
              <span>⚡</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Clases ahora mismo</span>
              <LiveBadge />
            </CardHeader>
            <div>
              {loadingClases ? (
                <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                  <Spinner />
                </div>
              ) : clases.length === 0 ? (
                <EmptyState icon="🏖️" title="Sin clases ahora" description="No hay asistencias registradas hoy todavía" />
              ) : (
                clases.map((clase, i) => (
                  <div key={i} style={{ padding: '12px 20px', borderBottom: '1px solid var(--white-off)' }}>
                    {/* Cabecera clase */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                        👩‍🏫 {clase.profesor_nombre}
                      </span>
                      <TipoBadge categoria="normal" nombre={clase.tipo_clase} />
                      {clase.hora_inicio && (
                        <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--grey-mid)' }}>
                          {clase.hora_inicio.slice(0,5)}
                        </span>
                      )}
                    </div>
                    {/* Alumnos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {clase.alumnos.map((alumno) => (
                        <div key={alumno.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--white-off)',
                          cursor: 'pointer',
                        }}
                          onClick={() => navigate(`/alumnos/${alumno.id}`)}
                        >
                          <span style={{ fontSize: '0.8rem', fontWeight: 500, flex: 1 }}>
                            {alumno.nombre} {alumno.apellidos}
                          </span>
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', color: 'var(--grey-mid)' }}>
                            {alumno.horas_mes}h
                          </span>
                          <EstadoBadge
                            estado={alumno.estado}
                            horas={alumno.horas_mes}
                            importe={alumno.importe_debido}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Resumen del mes */}
          <Card style={{ animation: 'fadeUp 0.4s ease 0.30s both' }}>
            <CardHeader>
              <span>📊</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                Resumen {mesActual}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <EstadoBadge estado="verde" />
                <EstadoBadge estado="rojo" />
              </div>
            </CardHeader>
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 380, overflowY: 'auto' }}>
              {loadingMes ? (
                <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                  <Spinner />
                </div>
              ) : resumenMes.length === 0 ? (
                <EmptyState icon="📅" title="Sin actividad este mes" />
              ) : (
                resumenMes.map((alumno) => (
                  <div
                    key={alumno.id}
                    onClick={() => navigate(`/alumnos/${alumno.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      background: 'var(--white)',
                      border: '1px solid var(--grey-border)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      transition: 'border-color var(--transition)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--orange)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--grey-border)'}
                  >
                    <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alumno.nombre} {alumno.apellidos}
                      </div>
                    </div>
                    {alumno.horas_contratadas ? (
                      <ProgressBar
                        value={alumno.horas_mes}
                        max={alumno.horas_contratadas}
                        estado={alumno.estado}
                      />
                    ) : (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.72rem', color: 'var(--grey-mid)' }}>
                        {alumno.sesiones_mes} ses.
                      </span>
                    )}
                    <EstadoBadge
                      estado={alumno.estado}
                      horas={alumno.horas_mes}
                      sesiones={alumno.sesiones_mes}
                      importe={alumno.importe_debido}
                    />
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* 4. Accesos rápidos */}
        <div style={{ display: 'flex', gap: 12, animation: 'fadeUp 0.4s ease 0.35s both' }}>
          <Button onClick={() => navigate('/alumnos/nuevo')} variant="ghost">➕ Nuevo alumno</Button>
          <Button onClick={() => navigate('/importar')} variant="ghost">📥 Importar Excel</Button>
          <Button onClick={() => navigate('/informes')} variant="ghost">📈 Ver informes</Button>
        </div>

      </div>
    </>
  )
}

