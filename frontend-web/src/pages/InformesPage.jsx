import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { informesService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Spinner, EmptyState } from '../components/ui'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const FORMAS_PAGO_CONFIG = {
  efectivo:      { label: 'Efectivo',      icon: '💵', color: '#22c55e' },
  tarjeta:       { label: 'Tarjeta',       icon: '💳', color: '#3b82f6' },
  bizum:         { label: 'Bizum',         icon: '📱', color: '#a855f7' },
  transferencia: { label: 'Transferencia', icon: '🏦', color: '#f59e0b' },
  mixto:         { label: 'Pago mixto',    icon: '🔀', color: '#6b7280' },
}

// ── Gráfico de barras SVG ──────────────────────────────────────────────────
function GraficoFormasPago({ formas_pago, cobros_mixtos, total_mixtos }) {
  const datos = Object.entries(formas_pago)
    .map(([key, val]) => ({
      key,
      ...FORMAS_PAGO_CONFIG[key],
      total: val.total,
      num: val.num_cobros,
    }))
    .concat(cobros_mixtos > 0 ? [{
      key: 'mixto',
      ...FORMAS_PAGO_CONFIG.mixto,
      total: total_mixtos,
      num: cobros_mixtos,
    }] : [])
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)

  if (datos.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.85rem' }}>
        Sin cobros registrados este mes
      </div>
    )
  }

  const maxVal = Math.max(...datos.map(d => d.total))
  const W = 480
  const BAR_H = 32
  const GAP = 14
  const LABEL_W = 110
  const AMOUNT_W = 80
  const H = datos.length * (BAR_H + GAP) + 16

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        {datos.map((d, i) => {
          const y = i * (BAR_H + GAP) + 8
          const barW = maxVal > 0 ? ((d.total / maxVal) * (W - LABEL_W - AMOUNT_W - 16)) : 0
          return (
            <g key={d.key}>
              {/* Etiqueta izquierda */}
              <text x={0} y={y + BAR_H / 2 + 5} fontSize={12} fill="var(--grey-mid)" fontFamily="var(--font-body)">
                {d.icon} {d.label}
              </text>
              {/* Barra de fondo */}
              <rect
                x={LABEL_W} y={y}
                width={W - LABEL_W - AMOUNT_W - 8} height={BAR_H}
                rx={6} fill="var(--white-off)"
              />
              {/* Barra de valor */}
              <rect
                x={LABEL_W} y={y}
                width={barW} height={BAR_H}
                rx={6} fill={d.color} opacity={0.85}
              />
              {/* Importe */}
              <text
                x={W - AMOUNT_W + 4} y={y + BAR_H / 2 + 5}
                fontSize={12} fontWeight={700}
                fill="var(--black)" fontFamily="var(--font-body)"
              >
                {d.total.toFixed(2)}€
              </text>
              {/* Número de cobros */}
              {barW > 40 && (
                <text
                  x={LABEL_W + 8} y={y + BAR_H / 2 + 5}
                  fontSize={10} fill="white" fontFamily="var(--font-body)"
                >
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

// ── Tarjeta de stat ────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub }) {
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
    </div>
  )
}

// ── Tarjeta por forma de pago ──────────────────────────────────────────────
function PagoCard({ formaKey, data }) {
  const cfg = FORMAS_PAGO_CONFIG[formaKey] || { label: formaKey, icon: '💶', color: '#6b7280' }
  if (data.total === 0) return null
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--grey-border)',
      borderRadius: 'var(--radius)', padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <span style={{
        fontSize: '1.6rem', width: 40, height: 40, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: cfg.color + '18', borderRadius: 8,
      }}>
        {cfg.icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{cfg.label}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)' }}>
          {data.num_cobros} cobro{data.num_cobros !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: cfg.color }}>
        {data.total.toFixed(2)}€
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────
export function InformesPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [informe, setInforme] = useState(null)
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

  useEffect(() => { cargar() }, [anio, mes])

  const exportarCSV = () => {
    if (!informe) return
    const cabecera = ['Profesor', 'H. Normal', 'H. Inglés', 'Sesiones', 'Total clases']
    const filas = informe.por_profesor.map(p =>
      [p.nombre, p.horas_normal.toFixed(1), p.horas_ingles.toFixed(1), p.sesiones, p.total_clases]
    )
    // Añadir resumen de formas de pago al CSV
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

  const aniosDisponibles = []
  for (let y = 2024; y <= hoy.getFullYear(); y++) aniosDisponibles.push(y)

  return (
    <>
      <Topbar
        titulo="Informes"
        subtitulo="Resumen mensual de actividad y recaudación"
        accion={informe ? { label: 'Exportar CSV', icon: '⬇️', onClick: exportarCSV } : null}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>

        {/* Selector de período */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
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
        </div>

        {!loading && !informe && (
          <EmptyState icon="📊" title="Sin datos" description="No hay actividad registrada para este período" />
        )}

        {informe && (
          <>
            {/* Stats globales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <StatCard icon="💰" label="Recaudado" value={`${informe.recaudado.toFixed(2)}€`} sub={`${informe.num_cobros} cobro${informe.num_cobros !== 1 ? 's' : ''}`} />
              <StatCard icon="👥" label="Alumnos activos" value={informe.alumnos_activos} />
              <StatCard icon="⏱️" label="Horas totales" value={informe.horas_total.toFixed(1)} />
              <StatCard icon="🏥" label="Sesiones" value={informe.sesiones_total} />
            </div>

            {/* Formas de pago — tarjetas resumen */}
            {informe.formas_pago && Object.values(informe.formas_pago).some(v => v.total > 0) && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--grey-mid)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
                  Desglose por forma de pago
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {Object.entries(informe.formas_pago).map(([key, val]) => (
                    <PagoCard key={key} formaKey={key} data={val} />
                  ))}
                  {informe.cobros_mixtos > 0 && (
                    <PagoCard formaKey="mixto" data={{ total: informe.total_mixtos, num_cobros: informe.cobros_mixtos }} />
                  )}
                </div>
              </div>
            )}

            {/* Gráfico de barras */}
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
                          <td style={tdStyle}><span style={{ fontWeight: 600 }}>{p.nombre}</span></td>
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
