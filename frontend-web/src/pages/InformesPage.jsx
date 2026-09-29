import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { informesService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Spinner, EmptyState, Button } from '../components/ui'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const FORMAS_PAGO_CONFIG = {
  efectivo:      { label: 'Efectivo',      icon: '💵', color: '#22c55e' },
  tarjeta:       { label: 'Tarjeta',       icon: '💳', color: '#3b82f6' },
  bizum:         { label: 'Bizum',         icon: '📱', color: '#a855f7' },
  transferencia: { label: 'Transferencia', icon: '🏦', color: '#f59e0b' },
  mixto:         { label: 'Pago mixto',    icon: '🔀', color: '#6b7280' },
}

/* ── StatCard con comparativa ───────────────────── */
function StatCard({ icon, label, value, sub, comparativa }) {
  const pct = comparativa
  const sube = pct > 0
  const baja = pct < 0
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--grey-border)',
      borderRadius: 'var(--radius)', padding: '18px 22px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--grey-light)' }}>{sub}</div>}
      {comparativa !== undefined && comparativa !== null && (
        <div style={{
          fontSize: '0.72rem', fontWeight: 700,
          color: sube ? 'var(--green-text)' : baja ? '#DC2626' : 'var(--grey-mid)',
          marginTop: 4,
        }}>
          {sube ? '▲' : baja ? '▼' : '='} {pct > 0 ? '+' : ''}{pct.toFixed(1)}% vs mes anterior
        </div>
      )}
    </div>
  )
}

/* ── Gráfico de barras por forma de pago ────────── */
function GraficoFormasPago({ formas_pago, cobros_mixtos, total_mixtos }) {
  const datos = Object.entries(formas_pago)
    .map(([key, val]) => ({ key, ...FORMAS_PAGO_CONFIG[key], total: val.total, num: val.num_cobros }))
    .concat(cobros_mixtos > 0 ? [{ key: 'mixto', ...FORMAS_PAGO_CONFIG.mixto, total: total_mixtos, num: cobros_mixtos }] : [])
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)

  if (datos.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.85rem' }}>Sin cobros este mes</div>
  }

  const maxVal = Math.max(...datos.map(d => d.total))
  const W = 480, BAR_H = 32, GAP = 14, LABEL_W = 110, AMOUNT_W = 80
  const H = datos.length * (BAR_H + GAP) + 16

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        {datos.map((d, i) => {
          const y = i * (BAR_H + GAP) + 8
          const barW = maxVal > 0 ? ((d.total / maxVal) * (W - LABEL_W - AMOUNT_W - 16)) : 0
          return (
            <g key={d.key}>
              <text x={0} y={y + BAR_H / 2 + 5} fontSize={12} fill="#666" fontFamily="sans-serif">
                {d.icon} {d.label}
              </text>
              <rect x={LABEL_W} y={y} width={W - LABEL_W - AMOUNT_W - 8} height={BAR_H} rx={6} fill="#F5F5F5" />
              <rect x={LABEL_W} y={y} width={barW} height={BAR_H} rx={6} fill={d.color} opacity={0.85} />
              <text x={W - AMOUNT_W + 4} y={y + BAR_H / 2 + 5} fontSize={12} fontWeight={700} fill="#111" fontFamily="sans-serif">
                {d.total.toFixed(2)}€
              </text>
              {barW > 40 && (
                <text x={LABEL_W + 8} y={y + BAR_H / 2 + 5} fontSize={10} fill="white" fontFamily="sans-serif">
                  {d.num} cobro{d.num !== 1 ? 's' : ''}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── Gráfico de evolución anual ─────────────────── */
function GraficoEvolucion({ evolucion }) {
  if (!evolucion || !evolucion.meses?.length) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.85rem' }}>Sin datos</div>
  }

  const meses = evolucion.meses
  const maxVal = Math.max(...meses.map(m => m.recaudado), 1)
  const W = 720, H = 240
  const padL = 50, padR = 20, padT = 20, padB = 40
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const barW = chartW / meses.length
  const barInnerW = barW * 0.6

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    value: maxVal * t,
    y: padT + chartH - (t * chartH),
  }))

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        {/* Grid horizontal */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#eee" strokeWidth={1} />
            <text x={padL - 6} y={t.y + 4} fontSize={10} fill="#999" textAnchor="end" fontFamily="sans-serif">
              {Math.round(t.value)}€
            </text>
          </g>
        ))}

        {/* Barras */}
        {meses.map((m, i) => {
          const x = padL + i * barW + (barW - barInnerW) / 2
          const h = maxVal > 0 ? (m.recaudado / maxVal) * chartH : 0
          const y = padT + chartH - h
          const esMesActual = new Date().getMonth() + 1 === m.mes && new Date().getFullYear() === evolucion.anio
          return (
            <g key={m.mes}>
              <rect x={x} y={y} width={barInnerW} height={h} rx={3}
                fill={esMesActual ? '#F26419' : '#FFD4BA'} />
              {m.recaudado > 0 && (
                <text x={x + barInnerW / 2} y={y - 4} fontSize={9} fill="#666" textAnchor="middle" fontFamily="sans-serif">
                  {Math.round(m.recaudado)}€
                </text>
              )}
              <text x={x + barInnerW / 2} y={H - padB + 16} fontSize={10} fill="#666" textAnchor="middle" fontFamily="sans-serif">
                {m.mes_label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── Top alumnos ────────────────────────────────── */
function TopAlumnos({ alumnos }) {
  if (!alumnos || alumnos.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.85rem' }}>Sin actividad de alumnos este mes</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--grey-border)' }}>
            {['#', 'Alumno', 'Horas', 'Sesiones', 'Pagado', 'Cobros'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((a, i) => (
            <tr key={a.alumno_id} style={{ borderBottom: '1px solid var(--white-off)' }}>
              <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--grey-mid)' }}>#{i + 1}</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--black)' }}>{a.nombre}</td>
              <td style={tdStyle}>{a.horas > 0 ? `${a.horas.toFixed(1)} h` : '—'}</td>
              <td style={tdStyle}>{a.sesiones > 0 ? a.sesiones : '—'}</td>
              <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--orange)' }}>{a.importe_pagado > 0 ? `${a.importe_pagado.toFixed(2)}€` : '—'}</td>
              <td style={tdStyle}>{a.num_cobros}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Página principal ───────────────────────────── */
export function InformesPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [informe, setInforme] = useState(null)
  const [evolucion, setEvolucion] = useState(null)
  const [loading, setLoading] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await informesService.mensual(anio, mes)
      setInforme(data)
    } catch {
      toast.error('No se pudo cargar el informe')
      setInforme(null)
    } finally {
      setLoading(false)
    }
  }

  const cargarEvolucion = async () => {
    try {
      const { data } = await informesService.evolucion(anio)
      setEvolucion(data)
    } catch { /* silencioso */ }
  }

  useEffect(() => { cargar() }, [anio, mes])
  useEffect(() => { cargarEvolucion() }, [anio])

  const exportarCSV = () => {
    if (!informe) return
    const cabecera = ['Profesor', 'H. Normal', 'H. Inglés', 'Sesiones', 'Total clases']
    const filas = informe.por_profesor.map(p =>
      [p.nombre, p.horas_normal.toFixed(1), p.horas_ingles.toFixed(1), p.sesiones, p.total_clases]
    )
    const pagos = Object.entries(informe.formas_pago || {}).map(([k, v]) =>
      [`Pago: ${k}`, '', '', '', `${v.total.toFixed(2)}€`]
    )
    const csv = [cabecera, ...filas, [], ...pagos].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `informe_${informe.mes_label.replace(' ', '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportarPDF = async () => {
  if (!informe) return
  try {
    await informesService.descargarPDF(anio, mes)
    toast.success('PDF descargado')
  } catch {
    toast.error('Error al generar el PDF')
  }
}

  const aniosDisponibles = []
  for (let y = 2024; y <= hoy.getFullYear() + 1; y++) aniosDisponibles.push(y)

  // Comparativa con mes anterior
  const comparativa = informe && informe.recaudado_mes_anterior > 0
    ? ((informe.recaudado - informe.recaudado_mes_anterior) / informe.recaudado_mes_anterior) * 100
    : (informe && informe.recaudado > 0 ? null : 0)

  const mediaPorAlumno = informe && informe.alumnos_activos > 0
    ? informe.recaudado / informe.alumnos_activos
    : 0

  return (
    <>
      <Topbar
        titulo="Informes"
        subtitulo="Resumen mensual de actividad y recaudación"
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>

        {/* Selector de período + acciones */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', padding: '14px 20px',
        }}>
          <span style={{ fontSize: '1.1rem' }}>📅</span>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', marginRight: 8 }}>Período:</span>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={selectorStyle}>
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={selectorStyle}>
            {aniosDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {loading && <Spinner size={18} />}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={exportarCSV} disabled={!informe}>
              📊 Exportar CSV
            </Button>
            <Button variant="primary" onClick={exportarPDF} disabled={!informe}>
              🖨️ Exportar PDF
            </Button>
          </div>
        </div>

        {!loading && !informe && (
          <EmptyState icon="📊" title="Sin datos" description="No hay actividad registrada para este período" />
        )}

        {informe && (
          <>
            {/* Stats globales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <StatCard
                icon="💰"
                label="Recaudado"
                value={`${informe.recaudado.toFixed(2)}€`}
                sub={`${informe.num_cobros} cobro${informe.num_cobros !== 1 ? 's' : ''}`}
                comparativa={comparativa}
              />
              <StatCard
                icon="👥"
                label="Alumnos activos"
                value={informe.alumnos_activos}
                sub={mediaPorAlumno > 0 ? `${mediaPorAlumno.toFixed(2)}€/alumno` : null}
              />
              <StatCard icon="⏱️" label="Horas totales" value={informe.horas_total.toFixed(1)} />
              <StatCard icon="🏥" label="Sesiones" value={informe.sesiones_total} />
            </div>

            {/* Anulados */}
            {informe.num_anulados > 0 && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FCA5A5',
                borderRadius: 'var(--radius)', padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#991B1B' }}>
                    {informe.num_anulados} cobro{informe.num_anulados !== 1 ? 's' : ''} anulado{informe.num_anulados !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#991B1B', opacity: 0.8 }}>
                    Importe total anulado: <strong>{informe.total_anulado.toFixed(2)}€</strong>
                    {' '}· Sin contar en la recaudación
                  </div>
                </div>
              </div>
            )}

            {/* Comparativas */}
            {(informe.recaudado_mes_anterior > 0 || informe.recaudado_anio_anterior > 0) && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              }}>
                {informe.recaudado_mes_anterior > 0 && (
                  <div style={{
                    background: 'var(--white-off)', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius)', padding: '12px 18px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>💬 Mes anterior</span>
                    <strong style={{ fontFamily: 'DM Mono, monospace' }}>{informe.recaudado_mes_anterior.toFixed(2)}€</strong>
                  </div>
                )}
                {informe.recaudado_anio_anterior > 0 && (
                  <div style={{
                    background: 'var(--white-off)', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius)', padding: '12px 18px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>📅 Mismo mes {anio - 1}</span>
                    <strong style={{ fontFamily: 'DM Mono, monospace' }}>{informe.recaudado_anio_anterior.toFixed(2)}€</strong>
                  </div>
                )}
              </div>
            )}

            {/* Formas de pago - tarjetas */}
            {informe.formas_pago && Object.values(informe.formas_pago).some(v => v.total > 0) && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--grey-mid)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
                  Desglose por forma de pago
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {Object.entries(informe.formas_pago).filter(([, v]) => v.total > 0).map(([key, val]) => {
                    const cfg = FORMAS_PAGO_CONFIG[key]
                    return (
                      <div key={key} style={{
                        background: 'var(--white)', border: '1px solid var(--grey-border)',
                        borderRadius: 'var(--radius)', padding: '12px 16px',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        <span style={{
                          fontSize: '1.4rem', width: 40, height: 40, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: cfg.color + '18', borderRadius: 8,
                        }}>{cfg.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{cfg.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)' }}>
                            {val.num_cobros} cobro{val.num_cobros !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: cfg.color }}>
                          {val.total.toFixed(2)}€
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gráfico formas de pago */}
            {informe.formas_pago && (
              <Card>
                <CardHeader>
                  <span>📊</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Distribución de ingresos</span>
                </CardHeader>
                <CardBody>
                  <GraficoFormasPago
                    formas_pago={informe.formas_pago}
                    cobros_mixtos={informe.cobros_mixtos || 0}
                    total_mixtos={informe.total_mixtos || 0}
                  />
                </CardBody>
              </Card>
            )}

            {/* Evolución anual */}
            <Card>
              <CardHeader>
                <span>📈</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Evolución anual {anio}</span>
                {evolucion && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--grey-mid)', fontWeight: 600 }}>
                    Total: {evolucion.total_anio.toFixed(2)}€
                  </span>
                )}
              </CardHeader>
              <CardBody>
                <GraficoEvolucion evolucion={evolucion} />
              </CardBody>
            </Card>

            {/* Top alumnos */}
            <Card>
              <CardHeader>
                <span>🏆</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Top 10 alumnos del mes</span>
              </CardHeader>
              <TopAlumnos alumnos={informe.top_alumnos} />
            </Card>

            {/* Desglose por profesor */}
            <Card>
              <CardHeader>
                <span>👩‍🏫</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Actividad por profesor</span>
              </CardHeader>
              {informe.por_profesor.length === 0 ? (
                <EmptyState icon="👤" title="Sin asistencias" description="No hay asistencias registradas este mes" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--grey-border)' }}>
                        {['Profesor', '📚 Normal', '🇬🇧 Inglés', '🏥 Sesiones', 'Total'].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {informe.por_profesor.map(p => (
                        <tr key={p.profesor_id}
                          style={{ borderBottom: '1px solid var(--white-off)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--black)' }}>{p.nombre}</td>
                          <td style={tdStyle}>{p.horas_normal > 0 ? `${p.horas_normal.toFixed(1)}h` : <span style={{ color: 'var(--grey-light)' }}>—</span>}</td>
                          <td style={tdStyle}>{p.horas_ingles > 0 ? `${p.horas_ingles.toFixed(1)}h` : <span style={{ color: 'var(--grey-light)' }}>—</span>}</td>
                          <td style={tdStyle}>{p.sesiones > 0 ? p.sesiones : <span style={{ color: 'var(--grey-light)' }}>—</span>}</td>
                          <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--orange)' }}>{p.total_clases}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--grey-border)', background: 'var(--white-off)' }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>TOTAL</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{informe.por_profesor.reduce((s, p) => s + p.horas_normal, 0).toFixed(1)}h</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{informe.por_profesor.reduce((s, p) => s + p.horas_ingles, 0).toFixed(1)}h</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{informe.por_profesor.reduce((s, p) => s + p.sesiones, 0)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--orange)' }}>{informe.por_profesor.reduce((s, p) => s + p.total_clases, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  )
}

const selectorStyle = {
  fontFamily: 'var(--font-body)', fontSize: '0.88rem',
  padding: '6px 10px', border: '1px solid var(--grey-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--white)',
  color: 'var(--black)', cursor: 'pointer',
}

const thStyle = {
  padding: '8px 14px', textAlign: 'left', fontWeight: 700,
  color: 'var(--grey-mid)', fontSize: '0.72rem',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdStyle = {
  padding: '10px 14px', color: 'var(--grey-mid)',
}