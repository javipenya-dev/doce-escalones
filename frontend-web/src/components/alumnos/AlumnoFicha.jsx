import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService, dashboardService } from '../../utils/api'
import { Topbar } from '../layout/Topbar'
import {
  Button, Avatar, EstadoBadge, TipoBadge,
  ProgressBar, Card, CardHeader, CardBody,
  Spinner, EmptyState,
} from '../ui'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export function AlumnoFicha() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [alumno, setAlumno] = useState(null)
  const [hermanos, setHermanos] = useState([])
  const [resumenMes, setResumenMes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalHermano, setModalHermano] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const [{ data: a }, { data: h }] = await Promise.all([
        alumnosService.obtener(id),
        alumnosService.obtenerHermanos(id),
      ])
      setAlumno(a)
      setHermanos(h)

      // Resumen del mes actual para este alumno
      const { data: mes } = await dashboardService.mes()
      setResumenMes(mes.filter(r => r.id === parseInt(id)))
    } catch {
      toast.error('No se pudo cargar la ficha del alumno')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [id])

  const handleDarBaja = async () => {
    if (!confirm(`¿Dar de baja a ${alumno.nombre} ${alumno.apellidos}?`)) return
    try {
      await alumnosService.darBaja(id)
      toast.success('Alumno dado de baja')
      navigate('/alumnos')
    } catch {
      toast.error('No se pudo dar de baja')
    }
  }

  const handleDesvincularHermano = async (hId, hNombre) => {
    if (!confirm(`¿Desvincular a ${hNombre} como hermano?`)) return
    try {
      await alumnosService.desvincularHermano(id, hId)
      toast.success('Hermano desvinculado')
      setHermanos(h => h.filter(x => x.id !== hId))
    } catch {
      toast.error('Error al desvincular')
    }
  }

  if (loading) return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <Spinner size={36} />
    </div>
  )

  if (!alumno) return (
    <EmptyState icon="❓" title="Alumno no encontrado" />
  )

  const nombreCompleto = `${alumno.nombre} ${alumno.apellidos}`
  const edad = alumno.fecha_nacimiento
    ? Math.floor((new Date() - new Date(alumno.fecha_nacimiento)) / (365.25 * 24 * 3600 * 1000))
    : null

  return (
    <>
      <Topbar
        titulo={nombreCompleto}
        subtitulo={edad ? `${edad} años` : 'Ficha de alumno'}
        accion={{ label: 'Cobrar', icon: '💳', onClick: () => navigate(`/cobros/nuevo/${id}`) }}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Cabecera alumno */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', padding: '24px',
          display: 'flex', alignItems: 'center', gap: 20,
          animation: 'fadeUp 0.3s ease both',
        }}>
          <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={56} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 4 }}>{nombreCompleto}</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {alumno.telefono1 && <InfoChip icon="📞" text={alumno.telefono1} />}
              {alumno.telefono2 && <InfoChip icon="📱" text={alumno.telefono2} />}
              {alumno.email     && <InfoChip icon="✉️" text={alumno.email} />}
              {alumno.direccion && <InfoChip icon="📍" text={alumno.direccion} />}
              {alumno.fecha_nacimiento && (
                <InfoChip icon="🎂" text={new Date(alumno.fecha_nacimiento).toLocaleDateString('es-ES')} />
              )}
              {alumno.fecha_inscripcion && (
                <InfoChip icon="📅" text={`Inscrito el ${new Date(alumno.fecha_inscripcion).toLocaleDateString('es-ES')}`} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/alumnos/${id}/editar`)}>✏️ Editar</Button>
            <Button variant="danger" size="sm" onClick={handleDarBaja}>Dar de baja</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

          {/* Columna izquierda */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Packs activos */}
            <Card style={{ animation: 'fadeUp 0.3s ease 0.05s both' }}>
              <CardHeader>
                <span>📦</span>
                <span style={{ fontWeight: 700 }}>Packs contratados</span>
                <button
                  onClick={() => navigate(`/alumnos/${id}/packs/nuevo`)}
                  style={{
                    marginLeft: 'auto', background: 'var(--orange-pale)',
                    color: 'var(--orange-dark)', border: 'none', cursor: 'pointer',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                  }}
                >
                  ➕ Añadir pack
                </button>
              </CardHeader>
              <CardBody style={{ padding: 0 }}>
                {alumno.packs?.length === 0 ? (
                  <EmptyState icon="📦" title="Sin packs" description="Este alumno no tiene packs contratados" />
                ) : (
                  alumno.packs?.map((pack) => (
                    <PackRow key={pack.id} pack={pack} />
                  ))
                )}
              </CardBody>
            </Card>

            {/* Resumen este mes */}
            <Card style={{ animation: 'fadeUp 0.3s ease 0.10s both' }}>
              <CardHeader>
                <span>📊</span>
                <span style={{ fontWeight: 700 }}>
                  Este mes — {MESES[new Date().getMonth()]} {new Date().getFullYear()}
                </span>
              </CardHeader>
              <CardBody>
                {resumenMes.length === 0 ? (
                  <p style={{ color: 'var(--grey-light)', fontSize: '0.85rem' }}>Sin actividad este mes todavía</p>
                ) : resumenMes.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 0',
                    borderBottom: i < resumenMes.length - 1 ? '1px solid var(--grey-border)' : 'none',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                        {r.horas_contratadas ? 'Clases' : 'Sesiones'}
                      </div>
                      {r.horas_contratadas ? (
                        <ProgressBar value={r.horas_mes} max={r.horas_contratadas} estado={r.estado} />
                      ) : (
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--grey-mid)' }}>
                          {r.sesiones_mes} / {r.sesiones_contratadas ?? '∞'} sesiones
                        </span>
                      )}
                    </div>
                    <EstadoBadge
                      estado={r.estado}
                      horas={r.horas_mes}
                      sesiones={r.sesiones_mes}
                      importe={r.importe_debido}
                    />
                  </div>
                ))}
              </CardBody>
            </Card>

          </div>

          {/* Columna derecha */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Hermanos */}
            <Card style={{ animation: 'fadeUp 0.3s ease 0.15s both' }}>
              <CardHeader>
                <span>👨‍👧‍👦</span>
                <span style={{ fontWeight: 700 }}>Hermanos</span>
                <button
                  onClick={() => setModalHermano(true)}
                  style={{
                    marginLeft: 'auto', background: 'var(--orange-pale)',
                    color: 'var(--orange-dark)', border: 'none', cursor: 'pointer',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                  }}
                >
                  ➕ Vincular
                </button>
              </CardHeader>
              <CardBody style={{ padding: 0 }}>
                {hermanos.length === 0 ? (
                  <div style={{ padding: '16px 20px', fontSize: '0.82rem', color: 'var(--grey-light)' }}>
                    Sin hermanos vinculados
                  </div>
                ) : (
                  hermanos.map((h) => (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 20px',
                      borderBottom: '1px solid var(--white-off)',
                    }}>
                      <Avatar nombre={h.nombre} apellidos={h.apellidos} size={28} />
                      <span
                        style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', color: 'var(--orange)' }}
                        onClick={() => navigate(`/alumnos/${h.id}`)}
                      >
                        {h.nombre} {h.apellidos}
                      </span>
                      <button
                        onClick={() => handleDesvincularHermano(h.id, `${h.nombre} ${h.apellidos}`)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--grey-light)', fontSize: '0.8rem', padding: 2,
                        }}
                        title="Desvincular"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
                {hermanos.length > 0 && (
                  <div style={{ padding: '8px 20px', background: 'var(--orange-pale)', fontSize: '0.72rem', color: 'var(--orange-dark)', fontWeight: 600 }}>
                    🏷️ Descuento hermanos 10% aplicado automáticamente
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Acciones rápidas */}
            <Card style={{ animation: 'fadeUp 0.3s ease 0.20s both' }}>
              <CardHeader>
                <span>⚡</span>
                <span style={{ fontWeight: 700 }}>Acciones</span>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/cobros/nuevo/${id}`)}>
                  💳 Registrar cobro
                </Button>
                <Button variant="ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/alumnos/${id}/editar`)}>
                  ✏️ Editar datos
                </Button>
                <Button variant="ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/cobros?alumno=${id}`)}>
                  🧾 Ver historial de cobros
                </Button>
              </CardBody>
            </Card>

          </div>
        </div>
      </div>

      {/* Modal vincular hermano */}
      {modalHermano && (
        <VincularHermanoModal
          alumnoId={parseInt(id)}
          alumnoNombre={nombreCompleto}
          hermanoActuales={hermanos.map(h => h.id)}
          onClose={() => setModalHermano(false)}
          onVinculado={(h) => {
            setHermanos(prev => [...prev, h])
            setModalHermano(false)
            toast.success(`${h.nombre} ${h.apellidos} vinculado como hermano ✅`)
          }}
        />
      )}
    </>
  )
}

/* ── SUB-COMPONENTES ─────────────────────────────── */

function InfoChip({ icon, text }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '0.78rem', color: 'var(--grey-mid)',
    }}>
      {icon} {text}
    </span>
  )
}

function PackRow({ pack }) {
  return (
    <div style={{
      padding: '12px 20px',
      borderBottom: '1px solid var(--white-off)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>
          {pack.tarifa?.nombre || 'Pack'}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)' }}>
          Prof. {pack.profesor_nombre || '—'} · Desde {pack.fecha_inicio ? new Date(pack.fecha_inicio).toLocaleDateString('es-ES') : '—'}
        </div>
      </div>
      {pack.tarifa && (
        <TipoBadge
          categoria={pack.tarifa.categoria}
          nombre={pack.tarifa.categoria === 'sesion' ? 'Sesión' : pack.tarifa.categoria === 'ingles' ? 'Inglés' : 'Normal'}
        />
      )}
      <span style={{
        fontFamily: 'DM Mono, monospace', fontSize: '0.8rem', fontWeight: 600,
        color: 'var(--orange)',
      }}>
        {pack.tarifa?.precio_base?.toFixed(2)}€/mes
      </span>
    </div>
  )
}

function VincularHermanoModal({ alumnoId, alumnoNombre, hermanoActuales, onClose, onVinculado }) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [loading, setLoading] = useState(false)
  const [vinculando, setVinculando] = useState(null)

  const buscar = async () => {
    if (!busqueda.trim()) return
    setLoading(true)
    try {
      const { data } = await alumnosService.listar({ nombre: busqueda, activo: true })
      setResultados(data.filter(a => a.id !== alumnoId && !hermanoActuales.includes(a.id)))
    } catch {
      toast.error('Error en la búsqueda')
    } finally {
      setLoading(false)
    }
  }

  const handleVincular = async (hermano) => {
    setVinculando(hermano.id)
    try {
      await alumnosService.vincularHermano(alumnoId, hermano.id)
      onVinculado(hermano)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al vincular')
    } finally {
      setVinculando(null)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, animation: 'fadeIn 0.15s ease',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--radius)',
        padding: 28, width: '100%', maxWidth: 440,
        boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease',
      }}>
        <h3 style={{ fontWeight: 700, marginBottom: 6 }}>Vincular hermano</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--grey-mid)', marginBottom: 16 }}>
          Busca el alumno hermano de <strong>{alumnoNombre}</strong>
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            style={{
              flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              padding: '8px 12px', border: '1px solid var(--grey-border)',
              borderRadius: 'var(--radius-sm)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--orange)'}
            onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            autoFocus
          />
          <Button onClick={buscar} loading={loading}>Buscar</Button>
        </div>

        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resultados.length === 0 && busqueda && !loading && (
            <p style={{ fontSize: '0.82rem', color: 'var(--grey-light)', textAlign: 'center', padding: 16 }}>
              Sin resultados
            </p>
          )}
          {resultados.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--grey-border)',
            }}>
              <Avatar nombre={a.nombre} apellidos={a.apellidos} size={28} />
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>
                {a.nombre} {a.apellidos}
              </span>
              <Button
                size="sm"
                loading={vinculando === a.id}
                onClick={() => handleVincular(a)}
              >
                Vincular
              </Button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}
