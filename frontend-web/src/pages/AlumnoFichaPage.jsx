import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService, packsService, tarifasService, profesoresService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import {
  Card, CardHeader, CardBody,
  Button, Avatar, EstadoBadge, TipoBadge,
  ProgressBar, Spinner, EmptyState,
} from '../components/ui'

/* ── SECCIÓN ─────────────────────────────────────── */
function Seccion({ titulo, icono, children, accion }) {
  return (
    <Card>
      <CardHeader>
        <span>{icono}</span>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{titulo}</span>
        {accion && <div style={{ marginLeft: 'auto' }}>{accion}</div>}
      </CardHeader>
      {children}
    </Card>
  )
}

/* ── CAMPO INFO ──────────────────────────────────── */
function Campo({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.88rem', color: value ? 'var(--black)' : 'var(--grey-light)' }}>
        {value || '—'}
      </div>
    </div>
  )
}

/* ── ALUMNO FICHA PAGE ───────────────────────────── */
export function AlumnoFichaPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [alumno, setAlumno] = useState(null)
  const [hermanos, setHermanos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busquedaHermano, setBusquedaHermano] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [buscandoHermano, setBuscandoHermano] = useState(false)
  const [mostrarBuscador, setMostrarBuscador] = useState(false)
  const [historico, setHistorico] = useState([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [mesesHistorico, setMesesHistorico] = useState(6)
  const [modalPack, setModalPack] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const [{ data: a }, { data: h }] = await Promise.all([
        alumnosService.obtener(id),
        alumnosService.obtenerHermanos(id),
      ])
      setAlumno(a)
      setHermanos(h)
    } catch {
      toast.error('No se pudo cargar la ficha del alumno')
      navigate('/alumnos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [id])

  useEffect(() => {
    if (!id) return
    setLoadingHistorico(true)
    alumnosService.historico(id, mesesHistorico)
      .then(({ data }) => setHistorico(data))
      .catch(() => {})
      .finally(() => setLoadingHistorico(false))
  }, [id, mesesHistorico])

  // Búsqueda de hermano para vincular
  useEffect(() => {
    if (!busquedaHermano || busquedaHermano.length < 2) {
      setResultadosBusqueda([])
      return
    }
    const t = setTimeout(async () => {
      setBuscandoHermano(true)
      try {
        const { data } = await alumnosService.listar({ nombre: busquedaHermano, activo: true })
        // Excluir el propio alumno y los ya vinculados
        const yaVinculados = new Set([parseInt(id), ...hermanos.map(h => h.id)])
        setResultadosBusqueda(data.filter(a => !yaVinculados.has(a.id)).slice(0, 5))
      } catch { /* silencioso */ }
      finally { setBuscandoHermano(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [busquedaHermano])

  const handleVincularHermano = async (hermanoId, hermanoNombre) => {
    try {
      await alumnosService.vincularHermano(id, hermanoId)
      toast.success(`${hermanoNombre} vinculado como hermano ✓`)
      setMostrarBuscador(false)
      setBusquedaHermano('')
      cargar()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al vincular')
    }
  }

  const handleDesvincularHermano = async (hermanoId, nombre) => {
    if (!confirm(`¿Desvincular a ${nombre} como hermano?`)) return
    try {
      await alumnosService.desvincularHermano(id, hermanoId)
      toast.success('Hermano desvinculado')
      cargar()
    } catch {
      toast.error('Error al desvincular')
    }
  }

  const handleDarBaja = async () => {
    if (!confirm(`¿Dar de baja a ${alumno.nombre} ${alumno.apellidos}? No se borrará ningún dato histórico.`)) return
    try {
      await alumnosService.darBaja(id)
      toast.success('Alumno dado de baja')
      navigate('/alumnos')
    } catch {
      toast.error('Error al dar de baja')
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Spinner size={40} />
    </div>
  )

  if (!alumno) return null

  const edad = alumno.fecha_nacimiento
    ? Math.floor((new Date() - new Date(alumno.fecha_nacimiento)) / (365.25 * 24 * 3600 * 1000))
    : null

  const packsActivos = alumno.packs?.filter(p => p.activo) || []

  return (
    <>
      <Topbar
        titulo={`${alumno.apellidos}, ${alumno.nombre}`}
        subtitulo={edad ? `${edad} años` : 'Alumno'}
        accion={{ label: 'Cobrar', icon: '💳', onClick: () => navigate(`/cobros/nuevo/${id}`) }}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

        {/* Cabecera alumno */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
          animation: 'fadeUp 0.3s ease both',
        }}>
          <Avatar nombre={alumno.nombre} apellidos={alumno.apellidos} size={56} />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.01em' }}>
              {alumno.nombre} {alumno.apellidos}
            </h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {alumno.telefono1 && <span style={{ fontSize: '0.8rem', color: 'var(--grey-mid)' }}>📞 {alumno.telefono1}</span>}
              {alumno.email     && <span style={{ fontSize: '0.8rem', color: 'var(--grey-mid)' }}>✉️ {alumno.email}</span>}
              {hermanos.length > 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--orange)', fontWeight: 600 }}>
                  👨‍👧‍👦 Hermanos: {hermanos.map(h => h.nombre).join(', ')}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/alumnos/${id}/editar`)}>✏️ Editar</Button>
            {alumno.activo && <Button variant="danger" size="sm" onClick={handleDarBaja}>Dar de baja</Button>}
          </div>
        </div>

        {/* Grid 2 columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Datos personales */}
          <Seccion titulo="Datos personales" icono="👤" style={{ animation: 'fadeUp 0.3s ease 0.05s both' }}>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Campo label="Nombre"       value={alumno.nombre} />
                <Campo label="Apellidos"    value={alumno.apellidos} />
                <Campo label="Nacimiento"   value={alumno.fecha_nacimiento ? new Date(alumno.fecha_nacimiento).toLocaleDateString('es-ES') : null} />
                <Campo label="Inscripción"  value={alumno.fecha_inscripcion ? new Date(alumno.fecha_inscripcion).toLocaleDateString('es-ES') : null} />
                <Campo label="Teléfono 1"  value={alumno.telefono1} />
                <Campo label="Teléfono 2"  value={alumno.telefono2} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <Campo label="Email"     value={alumno.email} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Campo label="Dirección" value={alumno.direccion} />
                </div>
              </div>
            </CardBody>
          </Seccion>

          {/* Hermanos */}
          <Seccion
            titulo="Hermanos (descuento 10%)"
            icono="👨‍👧‍👦"
            accion={
              <Button size="sm" variant="ghost" onClick={() => setMostrarBuscador(v => !v)}>
                {mostrarBuscador ? '✕' : '+ Vincular'}
              </Button>
            }
          >
            <CardBody>
              {/* Buscador de hermano */}
              {mostrarBuscador && (
                <div style={{ marginBottom: 12, animation: 'fadeUp 0.2s ease both' }}>
                  <input
                    autoFocus
                    placeholder="Buscar alumno por nombre..."
                    value={busquedaHermano}
                    onChange={e => setBusquedaHermano(e.target.value)}
                    style={{
                      width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                      padding: '7px 12px', border: '1px solid var(--orange)',
                      borderRadius: 'var(--radius-sm)', outline: 'none',
                    }}
                  />
                  {buscandoHermano && <div style={{ padding: '8px 0' }}><Spinner size={16} /></div>}
                  {resultadosBusqueda.map(r => (
                    <div
                      key={r.id}
                      onClick={() => handleVincularHermano(r.id, `${r.nombre} ${r.apellidos}`)}
                      style={{
                        padding: '7px 10px', cursor: 'pointer', borderRadius: 6,
                        fontSize: '0.85rem', marginTop: 2,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Avatar nombre={r.nombre} apellidos={r.apellidos} size={24} />
                      {r.nombre} {r.apellidos}
                    </div>
                  ))}
                </div>
              )}

              {hermanos.length === 0 ? (
                <EmptyState icon="👤" title="Sin hermanos vinculados" description="Vincula hermanos para aplicar el descuento del 10%" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hermanos.map(h => (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', background: 'var(--white-off)',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <Avatar nombre={h.nombre} apellidos={h.apellidos} size={28} />
                      <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>
                        {h.nombre} {h.apellidos}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 600 }}>
                        -10%
                      </span>
                      <button
                        onClick={() => handleDesvincularHermano(h.id, `${h.nombre} ${h.apellidos}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grey-light)', fontSize: '0.8rem', padding: 2 }}
                        title="Desvincular"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Seccion>
        </div>

        {/* Packs activos */}
        <Seccion
          titulo="Packs activos este mes"
          icono="📦"
          accion={<Button size="sm" variant="primary" onClick={() => setModalPack(true)}>+ Añadir pack</Button>}
        >
          {packsActivos.length === 0 ? (
            <EmptyState icon="📦" title="Sin packs activos" description="Asigna un pack para comenzar a registrar asistencias" />
          ) : (
            <div style={{ padding: '8px 0' }}>
              {packsActivos.map(pack => (
                <div key={pack.id} style={{
                  padding: '12px 20px', borderBottom: '1px solid var(--white-off)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <TipoBadge categoria={pack.tarifa?.categoria || 'normal'} nombre={pack.tarifa?.nombre || 'Pack'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{pack.tarifa?.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: 2 }}>
                      Desde {pack.fecha_inicio ? new Date(pack.fecha_inicio).toLocaleDateString('es-ES') : '—'}
                      {pack.tarifa?.precio_base && (
                        <span style={{ marginLeft: 8, color: 'var(--orange)', fontWeight: 600 }}>
                          {pack.tarifa.precio_base.toFixed(2)}€/mes
                        </span>
                      )}
                    </div>
                  </div>
                  <EstadoBadge estado="verde" />
                  <button
                    title="Dar de baja este pack"
                    onClick={async () => {
                      if (!confirm(`¿Dar de baja el pack "${pack.tarifa?.nombre}"?`)) return
                      try {
                        await packsService.desactivar(pack.id)
                        toast.success('Pack dado de baja')
                        cargar()
                      } catch { toast.error('Error al dar de baja el pack') }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--grey-light)', fontSize: '0.85rem', padding: 4 }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </Seccion>

        {/* Histórico de pagos y asistencias */}
        <Seccion
          titulo="Histórico de pagos y asistencias"
          icono="📅"
          accion={
            <select
              value={mesesHistorico}
              onChange={e => setMesesHistorico(Number(e.target.value))}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                padding: '4px 8px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--white)',
                color: 'var(--black)', cursor: 'pointer',
              }}
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
              <option value={24}>24 meses</option>
            </select>
          }
        >
          {loadingHistorico ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Spinner size={28} />
            </div>
          ) : historico.length === 0 ? (
            <EmptyState icon="📅" title="Sin historial" description="No hay datos de asistencia o cobros registrados aún" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--grey-border)' }}>
                    {['Mes', 'Horas', 'Sesiones', 'Estado', 'Cobros', 'Recaudado'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                        color: 'var(--grey-mid)', fontSize: '0.72rem',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historico.map((mes) => {
                    const semaforo = { verde: '🟢', rojo: '🔴', amarillo: '🟡', naranja: '🟠' }
                    const cobrosValidos = mes.cobros.filter(c => !c.anulado)
                    const cobrosAnulados = mes.cobros.filter(c => c.anulado)
                    return (
                      <tr key={`${mes.anio}-${mes.mes}`} style={{
                        borderBottom: '1px solid var(--white-off)',
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Mes */}
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {mes.mes_label}
                          {mes.semanas_en_mes === 5 && (
                            <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--orange)', fontWeight: 600 }}>
                              5 sem.
                            </span>
                          )}
                        </td>
                        {/* Horas */}
                        <td style={{ padding: '10px 12px', color: 'var(--grey-mid)' }}>
                          {mes.horas_consumidas > 0 ? (
                            <span>
                              {mes.horas_consumidas.toFixed(1)}
                              {mes.horas_contratadas && (
                                <span style={{ color: 'var(--grey-light)', fontSize: '0.75rem' }}>
                                  /{mes.horas_contratadas.toFixed(0)}h
                                </span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        {/* Sesiones */}
                        <td style={{ padding: '10px 12px', color: 'var(--grey-mid)' }}>
                          {mes.sesiones_consumidas > 0 ? mes.sesiones_consumidas : '—'}
                        </td>
                        {/* Semáforo */}
                        <td style={{ padding: '10px 12px' }}>
                          <span title={mes.estado} style={{ fontSize: '1.1rem' }}>
                            {semaforo[mes.estado] || '⬜'}
                          </span>
                        </td>
                        {/* Cobros */}
                        <td style={{ padding: '10px 12px' }}>
                          {mes.cobros.length === 0 ? (
                            <span style={{ color: 'var(--grey-light)', fontSize: '0.78rem' }}>Sin cobros</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {cobrosValidos.map(c => (
                                <span
                                  key={c.id}
                                  onClick={() => navigate(`/cobros/${c.id}`)}
                                  style={{
                                    fontSize: '0.75rem', color: 'var(--orange)',
                                    cursor: 'pointer', fontWeight: 600,
                                    textDecoration: 'underline',
                                  }}
                                  title={`Ver cobro #${c.id}`}
                                >
                                  #{c.id} · {c.total.toFixed(2)}€
                                </span>
                              ))}
                              {cobrosAnulados.map(c => (
                                <span key={c.id} style={{
                                  fontSize: '0.72rem', color: 'var(--grey-light)',
                                  textDecoration: 'line-through',
                                }}>
                                  #{c.id} anulado
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {/* Recaudado */}
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: mes.recaudado > 0 ? 'var(--black)' : 'var(--grey-light)' }}>
                          {mes.recaudado > 0 ? `${mes.recaudado.toFixed(2)}€` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

      </div>

      {/* Modal asignar pack */}
      {modalPack && (
        <AsignarPackModal
          alumnoId={parseInt(id)}
          onClose={() => setModalPack(false)}
          onCreado={() => { setModalPack(false); cargar() }}
        />
      )}
    </>
  )
}


/* ── MODAL ASIGNAR PACK ──────────────────────────────────── */
function AsignarPackModal({ alumnoId, onClose, onCreado }) {
  const [tarifas, setTarifas] = useState([])
  const [profesores, setProfesores] = useState([])
  const [form, setForm] = useState({ tarifa_id: '', profesor_id: '', notas: '' })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([
      tarifasService.listar({ activo: true }),
      profesoresService.listar(),
    ]).then(([{ data: t }, { data: p }]) => {
      setTarifas(t)
      setProfesores(p)
      if (p.length === 1) setForm(f => ({ ...f, profesor_id: p[0].id }))
    }).catch(() => toast.error('Error cargando datos'))
  }, [])

  const tarifaSeleccionada = tarifas.find(t => t.id === parseInt(form.tarifa_id))

  const handleGuardar = async () => {
    if (!form.tarifa_id) return toast.error('Selecciona una tarifa')
    if (!form.profesor_id) return toast.error('Selecciona un profesor')
    setGuardando(true)
    try {
      await packsService.crear({
        alumno_id:   alumnoId,
        tarifa_id:   parseInt(form.tarifa_id),
        profesor_id: parseInt(form.profesor_id),
        notas:       form.notas || null,
      })
      toast.success('Pack asignado ✓')
      onCreado()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al asignar pack')
    } finally {
      setGuardando(false)
    }
  }

  const CAT_LABEL = { normal: '📚 Normal', ingles: '🇬🇧 Inglés', sesion: '🏥 Sesión' }
  const tarifasAgrupadas = tarifas.reduce((acc, t) => {
    const g = t.categoria
    if (!acc[g]) acc[g] = []
    acc[g].push(t)
    return acc
  }, {})

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, animation: 'fadeIn 0.15s ease',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--radius)',
        padding: 28, width: '100%', maxWidth: 480,
        boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>📦 Asignar pack al alumno</h3>

        {/* Selector de tarifa */}
        <div>
          <label style={labelStyle}>Tarifa *</label>
          <select
            value={form.tarifa_id}
            onChange={e => setForm(f => ({ ...f, tarifa_id: e.target.value }))}
            style={selectStyle}
          >
            <option value="">— Selecciona una tarifa —</option>
            {Object.entries(tarifasAgrupadas).map(([cat, items]) => (
              <optgroup key={cat} label={CAT_LABEL[cat] || cat}>
                {items.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} — {t.precio_base.toFixed(2)}€/mes
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Preview de la tarifa seleccionada */}
          {tarifaSeleccionada && (
            <div style={{
              marginTop: 8, padding: '10px 14px',
              background: 'var(--orange-pale)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem', color: 'var(--orange-dark)',
            }}>
              {tarifaSeleccionada.horas_semanales && (
                <span>⏱️ {tarifaSeleccionada.horas_semanales}h/semana
                  · {(tarifaSeleccionada.horas_semanales * 4).toFixed(1)}h/mes estimadas</span>
              )}
              {tarifaSeleccionada.num_sesiones && (
                <span>📋 Bono {tarifaSeleccionada.num_sesiones} sesiones
                  {tarifaSeleccionada.duracion_sesion_min && ` de ${tarifaSeleccionada.duracion_sesion_min} min`}</span>
              )}
              <span style={{ marginLeft: 10, fontWeight: 700 }}>
                💰 {tarifaSeleccionada.precio_base.toFixed(2)}€/mes
              </span>
            </div>
          )}
        </div>

        {/* Selector de profesor */}
        <div>
          <label style={labelStyle}>Profesor *</label>
          <select
            value={form.profesor_id}
            onChange={e => setForm(f => ({ ...f, profesor_id: e.target.value }))}
            style={selectStyle}
          >
            <option value="">— Selecciona un profesor —</option>
            {profesores.map(p => (
              <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
            ))}
          </select>
        </div>

        {/* Notas opcionales */}
        <div>
          <label style={labelStyle}>Notas (opcional)</label>
          <textarea
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Ej: Viniste del colegio X, horario especial..."
            rows={2}
            style={{
              ...selectStyle, resize: 'vertical', fontFamily: 'var(--font-body)',
            }}
          />
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? '…' : '✓ Asignar pack'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.75rem', fontWeight: 700,
  color: 'var(--grey-mid)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 6,
}

const selectStyle = {
  width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.88rem',
  padding: '8px 12px', border: '1px solid var(--grey-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--white)',
  color: 'var(--black)', outline: 'none',
}
