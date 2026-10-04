import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { alumnosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Button, Avatar, EstadoBadge, EmptyState, Spinner } from '../components/ui'
import toast from 'react-hot-toast'

export function AlumnosPage() {
  const navigate = useNavigate()
  const [alumnos, setAlumnos] = useState([])
  const [totalBajas, setTotalBajas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos') // 'activos' | 'bajas' | 'todos'
  const [procesandoId, setProcesandoId] = useState(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const params = { nombre: busqueda || undefined }
      if (filtroEstado === 'activos') params.activo = true
      if (filtroEstado === 'bajas')   params.activo = false
      // 'todos' → no enviamos el parámetro activo

      if (filtroEstado === 'todos') {
        // Cuando mostramos "Todos" hacemos 2 peticiones en paralelo:
        //   1) La lista completa (con la búsqueda aplicada)
        //   2) Solo las bajas (para saber cuántas hay y mostrarlo en el contador)
        const [{ data: todos }, { data: bajas }] = await Promise.all([
          alumnosService.listar(params),
          alumnosService.listar({ activo: false, nombre: busqueda || undefined }),
        ])
        setAlumnos(todos)
        setTotalBajas(bajas.length)
      } else {
        const { data } = await alumnosService.listar(params)
        setAlumnos(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { cargar() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, busqueda])

  const handleDarBaja = async (alumno) => {
    if (!confirm(`¿Dar de baja a ${alumno.nombre} ${alumno.apellidos}? No se borrará su historial.`)) return
    setProcesandoId(alumno.id)
    try {
      await alumnosService.darBaja(alumno.id)
      toast.success('Alumno dado de baja')
      cargar()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al dar de baja')
    } finally {
      setProcesandoId(null)
    }
  }

  const handleReactivar = async (alumno) => {
    if (!confirm(`¿Reactivar a ${alumno.nombre} ${alumno.apellidos}?`)) return
    setProcesandoId(alumno.id)
    try {
      await alumnosService.actualizar(alumno.id, { activo: true })
      toast.success('Alumno reactivado')
      cargar()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al reactivar')
    } finally {
      setProcesandoId(null)
    }
  }

  const contadorTexto = () => {
    if (filtroEstado === 'activos') return `${alumnos.length} alumnos activos`
    if (filtroEstado === 'bajas')   return `${alumnos.length} alumnos dados de baja`
    // 'todos' → total + cuántos son de baja (si hay)
    if (totalBajas > 0) {
      return `${alumnos.length} alumnos totales · ${totalBajas} de baja`
    }
    return `${alumnos.length} alumnos totales`
  }

  return (
    <>
      <Topbar
        titulo="Alumnos"
        subtitulo={contadorTexto()}
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
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                padding: '7px 10px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer',
              }}
            >
              <option value="activos">Activos</option>
              <option value="bajas">Dados de baja</option>
              <option value="todos">Todos</option>
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
                  {['Alumno', 'Teléfono', 'Email', 'Semáforo', 'Acciones'].map(h => (
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
                    style={{
                      borderBottom: '1px solid var(--white-off)',
                      transition: 'background var(--transition)',
                      opacity: a.activo ? 1 : 0.65,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar nombre={a.nombre} apellidos={a.apellidos} size={30} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {a.apellidos}, {a.nombre}
                          </div>
                          {!a.activo && (
                            <span style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 12,
                              background: 'var(--grey-off, #F5F5F5)',
                              color: 'var(--grey-mid)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}>
                              Baja
                            </span>
                          )}
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
                      {a.estado_semaforo === 'rojo' && (
                        <EstadoBadge
                          estado="rojo"
                          importe={a.importe_debido}
                        />
                      )}
                      {a.estado_semaforo === 'naranja' && (
                        <EstadoBadge
                          estado="naranja"
                          horasExtra={a.horas_exceso_residual}
                        />
                      )}
                      {a.estado_semaforo === 'verde' && (
                        <EstadoBadge estado="verde" />
                      )}
                      {!a.estado_semaforo && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--grey-light)' }}>
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/alumnos/${a.id}`)}>
                          Ver ficha
                        </Button>
                        {a.activo ? (
                          <>
                            <Button size="sm" variant="primary" onClick={() => navigate(`/cobros/nuevo/${a.id}`)}>
                              💳 Cobrar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDarBaja(a)}
                              disabled={procesandoId === a.id}
                              style={{ color: 'var(--red, #DC2626)' }}
                            >
                              {procesandoId === a.id ? '…' : 'Dar de baja'}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleReactivar(a)}
                            disabled={procesandoId === a.id}
                          >
                            {procesandoId === a.id ? '…' : '↩ Reactivar'}
                          </Button>
                        )}
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