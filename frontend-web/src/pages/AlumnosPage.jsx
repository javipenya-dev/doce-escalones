import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { alumnosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Button, Avatar, EstadoBadge, EmptyState, Spinner } from '../components/ui'

export function AlumnosPage() {
  const navigate = useNavigate()
  const [alumnos, setAlumnos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroActivo, setFiltroActivo] = useState(true)

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await alumnosService.listar({
        activo: filtroActivo,
        nombre: busqueda || undefined,
      })
      setAlumnos(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Un único efecto: refetch cuando cambia filtro O búsqueda (con debounce).
  // Antes había dos useEffect separados, lo que provocaba 2-3 llamadas
  // idénticas a /alumnos al montar la pantalla.
  useEffect(() => {
    const t = setTimeout(() => { cargar() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroActivo, busqueda])

  return (
    <>
      <Topbar
        titulo="Alumnos"
        subtitulo={`${alumnos.length} alumnos${filtroActivo ? ' activos' : ''}`}
        accion={{ label: 'Nuevo alumno', icon: '➕', onClick: () => navigate('/alumnos/nuevo') }}
      />

      <div style={{ padding: '24px 32px' }}>
        <div style={{
          background: 'var(--white)',
          border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}>
          {/* Filtros */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--grey-border)',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <input
              placeholder="🔍 Buscar por nombre o apellidos..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                padding: '7px 12px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', outline: 'none', width: 260,
              }}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
            <select
              value={String(filtroActivo)}
              onChange={e => setFiltroActivo(e.target.value === 'true')}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                padding: '7px 10px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer',
              }}
            >
              <option value="true">Activos</option>
              <option value="false">Dados de baja</option>
            </select>
            <div style={{ marginLeft: 'auto' }}>
              <Button variant="ghost" onClick={() => navigate('/importar')}>📥 Importar Excel</Button>
            </div>
          </div>

          {/* Tabla */}
          {loading ? (
            <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
              <Spinner size={32} />
            </div>
          ) : alumnos.length === 0 ? (
            <EmptyState
              icon="🎓"
              title="No hay alumnos"
              description={busqueda ? 'No se encontraron alumnos con esa búsqueda' : 'Añade el primer alumno pulsando "Nuevo alumno"'}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--white-off)' }}>
                  {['Alumno', 'Teléfono', 'Email', 'Estado', 'Acciones'].map(h => (
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
                {alumnos.map((a) => (
                  <tr
                    key={a.id}
                    style={{ borderBottom: '1px solid var(--white-off)', transition: 'background var(--transition)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar nombre={a.nombre} apellidos={a.apellidos} size={30} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {a.apellidos}, {a.nombre}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.82rem', color: 'var(--grey-mid)' }}>
                      {a.telefono1 || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.82rem', color: 'var(--grey-mid)' }}>
                      {a.email || '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <EstadoBadge
                        estado={a.activo ? 'verde' : 'gris'}
                        label={a.activo ? 'Activo' : 'Baja'}
                      />
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/alumnos/${a.id}`)}>
                          Ver ficha
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => navigate(`/cobros/nuevo/${a.id}`)}>
                          💳 Cobrar
                        </Button>
                      </div>
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