import React, { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { cobrosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, Spinner, EmptyState } from '../components/ui'

const MESES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const hoyDate = new Date()

export function FacturasPage() {
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(false)
  const [descargando, setDescargando] = useState(null)

  const [filtros, setFiltros] = useState({
    anio: hoyDate.getFullYear(),
    mes: '',
    busqueda: '',
  })

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filtros.anio) params.anio = filtros.anio
      if (filtros.mes)  params.mes  = filtros.mes
      const { data } = await cobrosService.listarFacturas(params)
      setFacturas(data)
    } catch {
      toast.error('No se pudieron cargar las facturas')
    } finally {
      setLoading(false)
    }
  }, [filtros.anio, filtros.mes])

  useEffect(() => { cargar() }, [cargar])

  const descargarPDF = async (cobroId, numero) => {
    setDescargando(cobroId)
    try {
      const url = cobrosService.facturaPdfUrl(cobroId)
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error('Error al descargar')
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${numero}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error('Error al descargar el PDF')
    } finally {
      setDescargando(null)
    }
  }

  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  const filtradas = filtros.busqueda
    ? facturas.filter(f =>
        (f.numero || '').toLowerCase().includes(filtros.busqueda.toLowerCase()) ||
        (f.alumno_nombre || '').toLowerCase().includes(filtros.busqueda.toLowerCase()) ||
        (f.nombre_fiscal || '').toLowerCase().includes(filtros.busqueda.toLowerCase()) ||
        (f.nif || '').toLowerCase().includes(filtros.busqueda.toLowerCase())
      )
    : facturas

  const aniosDisponibles = []
  for (let y = 2024; y <= hoyDate.getFullYear(); y++) aniosDisponibles.push(y)

  return (
    <>
      <Topbar
        titulo="Facturas"
        subtitulo={`${filtradas.length} factura${filtradas.length !== 1 ? 's' : ''}`}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <span>🔍</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Filtros</span>
          </CardHeader>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>Año</label>
              <select value={filtros.anio} onChange={e => set('anio', e.target.value)} style={inputStyle}>
                {aniosDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Mes</label>
              <select value={filtros.mes} onChange={e => set('mes', e.target.value)} style={inputStyle}>
                <option value="">Todos</option>
                {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Buscar</label>
              <input
                placeholder="Número, alumno, NIF..."
                value={filtros.busqueda}
                onChange={e => set('busqueda', e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
        </Card>

        {/* Resumen */}
        {!loading && filtradas.length > 0 && (
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { icon: '🧾', label: 'Facturas', value: filtradas.length },
              // 🛡️ MODIFICADO: Aseguramos que f.total se trate como Number para evitar errores al usar .toFixed()
              { 
                icon: '💰', 
                label: 'Total facturado', 
                value: `${filtradas.filter(f => !f.cobro_anulado).reduce((s, f) => s + (Number(f.total) || 0), 0).toFixed(2)}€` 
              },
              { icon: '❌', label: 'De cobros anulados', value: filtradas.filter(f => f.cobro_anulado).length },
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
        ) : filtradas.length === 0 ? (
          <EmptyState icon="🧾" title="Sin facturas" description="No se han generado facturas en el período seleccionado" />
        ) : (
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--grey-border)' }}>
                  {['Número', 'Fecha', 'Alumno', 'Datos fiscales', 'Total', ''].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map(f => (
                  <tr key={f.id}
                    style={{ borderBottom: '1px solid var(--white-off)', opacity: f.cobro_anulado ? 0.5 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: '0.82rem', color: 'var(--orange)' }}>
                        {f.numero}
                      </span>
                      {f.cobro_anulado && (
                        <span style={{ marginLeft: 6, fontSize: '0.68rem', background: '#FEE2E2', color: '#991B1B', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                          ANULADO
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {new Date(f.fecha_emision + 'T12:00:00').toLocaleDateString('es-ES')}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500 }}>{f.alumno_nombre}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '0.8rem' }}>{f.nombre_fiscal || '—'}</div>
                      {f.nif && <div style={{ fontSize: '0.74rem', color: 'var(--grey-mid)', fontFamily: 'DM Mono, monospace' }}>{f.nif}</div>}
                    </td>
                    {/* 🛡️ MODIFICADO: Blindamos el renderizado del total de la celda contra valores indefinidos */}
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {(Number(f.total) || 0).toFixed(2)}€
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button
                        onClick={() => descargarPDF(f.cobro_id, f.numero)}
                        disabled={descargando === f.cobro_id}
                        style={{
                          background: 'var(--orange-pale)', color: 'var(--orange-dark)',
                          border: 'none', borderRadius: 6, padding: '5px 12px',
                          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                          opacity: descargando === f.cobro_id ? 0.6 : 1,
                        }}
                      >
                        {descargando === f.cobro_id ? '⏳' : '⬇️'} PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
const thStyle = {
  padding: '8px 16px', textAlign: 'left', fontWeight: 700,
  color: 'var(--grey-mid)', fontSize: '0.72rem',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}
const tdStyle = { padding: '11px 16px', color: 'var(--grey-mid)' }
