import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cobrosService, alumnosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Avatar, Button, EmptyState, Spinner } from '../components/ui'

const FORMA_ICON = {
  efectivo:      '💵',
  tarjeta:       '💳',
  bizum:         '📱',
  transferencia: '🏦',
}

function FormasPagoBadges({ pagos = [] }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {pagos.map((p, i) => (
        <span key={i} style={{
          fontSize: '0.7rem', padding: '2px 7px',
          borderRadius: 20, background: 'var(--white-off)',
          border: '1px solid var(--grey-border)',
          color: 'var(--grey-mid)', fontWeight: 500,
        }}>
          {FORMA_ICON[p.forma] || '💰'} {Number(p.importe).toFixed(2)}€
        </span>
      ))}
    </div>
  )
}

function AnuladoBadge() {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
      borderRadius: 20, background: 'var(--red-bg)', color: 'var(--red-text)',
    }}>
      ANULADO
    </span>
  )
}

export function CobroHistorialPage() {
  const navigate = useNavigate()
  const [cobros, setCobros] = useState([])
  const [loading, setLoading] = useState(true)
  const [busquedaAlumno, setBusquedaAlumno] = useState('')
  const [sugerencias, setSugerencias] = useState([])
  const [alumnoFiltro, setAlumnoFiltro] = useState(null) // { id, nombre }
  const [filtroAnulados, setFiltroAnulados] = useState('todos') // 'todos' | 'activos' | 'anulados'

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (alumnoFiltro) params.alumno_id = alumnoFiltro.id
      const { data } = await cobrosService.listar(params)
      setCobros(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [alumnoFiltro])

  useEffect(() => { cargar() }, [cargar])

  // Buscar alumnos para el filtro (debounce)
  useEffect(() => {
    if (!busquedaAlumno || alumnoFiltro) { setSugerencias([]); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await alumnosService.listar({ nombre: busquedaAlumno })
        setSugerencias(data.slice(0, 6))
      } catch { setSugerencias([]) }
    }, 280)
    return () => clearTimeout(t)
  }, [busquedaAlumno, alumnoFiltro])

  const seleccionarAlumno = (a) => {
    setAlumnoFiltro({ id: a.id, nombre: `${a.nombre} ${a.apellidos}` })
    setBusquedaAlumno('')
    setSugerencias([])
  }

  const limpiarAlumno = () => {
    setAlumnoFiltro(null)
    setBusquedaAlumno('')
  }

  const cobrosVisibles = cobros.filter(c => {
    if (filtroAnulados === 'activos')  return !c.anulado
    if (filtroAnulados === 'anulados') return c.anulado
    return true
  })

  const totalVisible = cobrosVisibles
    .filter(c => !c.anulado)
    .reduce((s, c) => s + Number(c.total), 0)

  const formatFecha = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <>
      <Topbar
        titulo="Cobros"
        subtitulo={
          alumnoFiltro
            ? `Filtrando por ${alumnoFiltro.nombre}`
            : `${cobrosVisibles.length} registros`
        }
      />

      <div style={{ padding: '24px 32px' }}>

        {/* Stats rápidas */}
        {!loading && cobrosVisibles.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14, marginBottom: 20,
          }}>
            {[
              {
                label: 'Total recaudado',
                valor: `${totalVisible.toFixed(2)}€`,
                icon: '💰',
                color: 'var(--green)',
              },
              {
                label: 'Cobros activos',
                valor: cobrosVisibles.filter(c => !c.anulado).length,
                icon: '✅',
                color: 'var(--orange)',
              },
              {
                label: 'Anulados',
                valor: cobrosVisibles.filter(c => c.anulado).length,
                icon: '🚫',
                color: 'var(--red)',
              },
            ].map((s) => (
              <div key={s.label} style={{
                background: 'var(--white)', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius)', padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: 'var(--shadow-sm)',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: s.color + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', flexShrink: 0,
                }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--black)' }}>
                    {s.valor}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--grey-mid)', fontWeight: 500 }}>
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabla principal */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>

          {/* Barra de filtros */}
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--grey-border)',
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          }}>

            {/* Buscador de alumno con autocompletado */}
            <div style={{ position: 'relative' }}>
              {alumnoFiltro ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', background: 'var(--orange-pale)',
                  border: '1px solid var(--orange-mid)', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem', color: 'var(--orange-dark)',
                }}>
                  <Avatar nombre={alumnoFiltro.nombre} size={20} />
                  <span style={{ fontWeight: 600 }}>{alumnoFiltro.nombre}</span>
                  <button
                    onClick={limpiarAlumno}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.9rem', color: 'var(--orange-dark)', padding: '0 2px',
                    }}
                    title="Quitar filtro"
                  >✕</button>
                </div>
              ) : (
                <input
                  placeholder="🔍 Filtrar por alumno..."
                  value={busquedaAlumno}
                  onChange={e => setBusquedaAlumno(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                    padding: '7px 12px', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius-sm)', outline: 'none', width: 220,
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => setTimeout(() => { e.target.style.borderColor = 'var(--grey-border)'; setSugerencias([]) }, 200)}
                />
              )}

              {sugerencias.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 50,
                  background: 'var(--white)', border: '1px solid var(--grey-border)',
                  borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                  minWidth: 240, marginTop: 4,
                }}>
                  {sugerencias.map(a => (
                    <div
                      key={a.id}
                      onMouseDown={() => seleccionarAlumno(a)}
                      style={{
                        padding: '8px 14px', cursor: 'pointer', fontSize: '0.83rem',
                        display: 'flex', alignItems: 'center', gap: 8,
                        borderBottom: '1px solid var(--white-off)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar nombre={a.nombre} apellidos={a.apellidos} size={24} />
                      {a.nombre} {a.apellidos}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filtro estado */}
            <select
              value={filtroAnulados}
              onChange={e => setFiltroAnulados(e.target.value)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                padding: '7px 10px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer',
              }}
            >
              <option value="todos">Todos</option>
              <option value="activos">Solo activos</option>
              <option value="anulados">Solo anulados</option>
            </select>

            <button
              onClick={cargar}
              title="Actualizar"
              style={{
                background: 'none', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', padding: '7px 10px',
                cursor: 'pointer', fontSize: '0.9rem',
                transition: 'all var(--transition)',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--orange)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--grey-border)'}
            >
              🔄
            </button>
          </div>

          {/* Contenido */}
          {loading ? (
            <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
              <Spinner size={32} />
            </div>
          ) : cobrosVisibles.length === 0 ? (
            <EmptyState
              icon="💳"
              title="No hay cobros"
              description={alumnoFiltro ? 'Este alumno no tiene cobros registrados' : 'Los cobros aparecerán aquí una vez se registren'}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--white-off)' }}>
                  {['Fecha', 'Alumno', 'Conceptos', 'Formas de pago', 'Total', 'Estado', ''].map(h => (
                    <th key={h} style={{
                      padding: '9px 16px', textAlign: 'left',
                      fontSize: '0.68rem', fontWeight: 700,
                      color: 'var(--grey-mid)', letterSpacing: '0.06em', textTransform: 'uppercase',
                      borderBottom: '1px solid var(--grey-border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cobrosVisibles.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--white-off)',
                      opacity: c.anulado ? 0.6 : 1,
                      transition: 'background var(--transition)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Fecha */}
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--grey-mid)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatFecha(c.fecha)}
                      </span>
                    </td>

                    {/* Alumno */}
                    <td style={{ padding: '10px 16px' }}>
                      {c.alumno ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar nombre={c.alumno.nombre} apellidos={c.alumno.apellidos} size={28} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.83rem' }}>
                              {c.alumno.apellidos}, {c.alumno.nombre}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--grey-mid)', fontSize: '0.82rem' }}>—</span>
                      )}
                    </td>

                    {/* Conceptos */}
                    <td style={{ padding: '10px 16px', maxWidth: 200 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(c.packs_cobro || []).slice(0, 2).map((p, i) => (
                          <span key={i} style={{
                            fontSize: '0.7rem', padding: '2px 7px',
                            borderRadius: 20, background: 'var(--orange-pale)',
                            border: '1px solid var(--orange-mid)', color: 'var(--orange-dark)',
                            fontWeight: 500, whiteSpace: 'nowrap',
                          }}>
                            {p.pack_alumno?.tarifa?.nombre || `Pack #${p.pack_alumno_id}`}
                          </span>
                        ))}
                        {(c.packs_cobro || []).length > 2 && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--grey-mid)' }}>
                            +{c.packs_cobro.length - 2}
                          </span>
                        )}
                        {(!c.packs_cobro || c.packs_cobro.length === 0) && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--grey-mid)' }}>—</span>
                        )}
                      </div>
                    </td>

                    {/* Formas de pago */}
                    <td style={{ padding: '10px 16px' }}>
                      <FormasPagoBadges pagos={c.pagos || []} />
                    </td>

                    {/* Total */}
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontWeight: 700, fontSize: '0.92rem',
                        color: c.anulado ? 'var(--grey-mid)' : 'var(--black)',
                        textDecoration: c.anulado ? 'line-through' : 'none',
                      }}>
                        {Number(c.total).toFixed(2)}€
                      </span>
                      {(c.descuento_hermano_pct > 0 || c.descuento_extra_pct > 0 || c.descuento_extra_importe > 0) && !c.anulado && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--green-text)', marginTop: 1 }}>
                          ✂ descuento aplicado
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td style={{ padding: '10px 16px' }}>
                      {c.anulado ? <AnuladoBadge /> : (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                          borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green-text)',
                        }}>
                          Cobrado
                        </span>
                      )}
                    </td>

                    {/* Acción */}
                    <td style={{ padding: '10px 16px' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/cobros/${c.id}`)}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
