import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { profesoresService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Button, Avatar, EmptyState, Spinner, Input } from '../components/ui'

const COLORES_PRESET = [
  '#F26419', // naranja (marca)
  '#16A34A', // verde
  '#2563EB', // azul
  '#9333EA', // violeta
  '#DC2626', // rojo
  '#CA8A04', // mostaza
  '#0891B2', // cian
  '#DB2777', // rosa
]

/* ── MODAL ALTA / EDICIÓN ────────────────────────── */
function ModalProfesor({ profesor, onClose, onGuardado }) {
  const esEdicion = Boolean(profesor)
  const [form, setForm] = useState({
    nombre:    profesor?.nombre    || '',
    apellidos: profesor?.apellidos || '',
    email:     profesor?.email     || '',
    telefono:  profesor?.telefono  || '',
    color:     profesor?.color     || '#F26419',
    pin:       '',
    rol:       profesor?.rol       || 'profesor',   // ← NUEVO
    activo:    profesor?.activo !== undefined ? profesor.activo : true,
  })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})

  const validar = () => {
    const e = {}
    if (!form.nombre.trim())    e.nombre    = 'El nombre es obligatorio'
    if (!form.apellidos.trim()) e.apellidos = 'Los apellidos son obligatorios'
    if (!esEdicion && !form.pin) e.pin = 'El PIN es obligatorio para nuevos profesores'
    if (form.pin && (!/^\d+$/.test(form.pin) || form.pin.length < 4 || form.pin.length > 6)) {
      e.pin = 'El PIN debe tener entre 4 y 6 dígitos numéricos'
    }
    return e
  }

  const handleSubmit = async () => {
    const e = validar()
    if (Object.keys(e).length > 0) { setErrores(e); return }

    setGuardando(true)
    try {
      const payload = { ...form }
      if (!payload.pin) delete payload.pin
      if (!payload.email) delete payload.email
      if (!payload.telefono) delete payload.telefono

      if (esEdicion) {
        // No se puede cambiar rol en edición por ahora
        delete payload.rol
        await profesoresService.actualizar(profesor.id, payload)
        toast.success('Profesor actualizado')
      } else {
        // Al crear, usamos el rol elegido en el formulario
        await profesoresService.crear(payload)   // ← ya lleva rol dentro
        toast.success('Profesor creado correctamente')
      }
      onGuardado()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const set = (campo) => (e) => {
    setForm(f => ({ ...f, [campo]: e.target.value }))
    if (errores[campo]) setErrores(er => ({ ...er, [campo]: null }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--radius)',
        padding: 28, width: 480, boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 22 }}>
          {esEdicion ? '✏️ Editar profesor' : '➕ Nuevo profesor'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Input label="Nombre *" value={form.nombre} onChange={set('nombre')} placeholder="María" />
              {errores.nombre && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.nombre}</div>}
            </div>
            <div>
              <Input label="Apellidos *" value={form.apellidos} onChange={set('apellidos')} placeholder="García López" />
              {errores.apellidos && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.apellidos}</div>}
            </div>
          </div>

          <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="maria@12escalones.com" />
          <Input label="Teléfono" type="tel" value={form.telefono} onChange={set('telefono')} placeholder="600 000 000" />

          {/* ── ROL ─────────────────────────────── */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Rol {!esEdicion && '*'}
            </label>
            <select
              value={form.rol}
              onChange={set('rol')}
              disabled={esEdicion}
              style={{
                width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                padding: '10px 12px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', background: esEdicion ? 'var(--white-off)' : 'var(--white)',
                color: 'var(--black)', cursor: esEdicion ? 'not-allowed' : 'pointer',
                outline: 'none',
              }}
            >
              <option value="profesor">Profesor</option>
              <option value="admin">Administrador</option>
            </select>
            <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', marginTop: 4 }}>
              {esEdicion
                ? 'El rol no se puede cambiar una vez creado el usuario.'
                : 'Admin: acceso total al panel web. Profesor: solo app móvil.'}
            </div>
          </div>

          {/* Color para el calendario */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Color en el calendario
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {COLORES_PRESET.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: c, cursor: 'pointer',
                    border: form.color === c ? '3px solid var(--black)' : '2px solid var(--grey-border)',
                    transition: 'transform 0.1s',
                    transform: form.color === c ? 'scale(1.1)' : 'scale(1)',
                  }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={set('color')}
                style={{
                  width: 40, height: 32, border: '1px solid var(--grey-border)',
                  borderRadius: 6, cursor: 'pointer', background: 'white', padding: 2,
                }}
                title="Color personalizado"
              />
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: 'var(--grey-mid)' }}>
                {form.color}
              </span>
            </div>
          </div>

          <div>
            <Input
              label={esEdicion ? 'Nuevo PIN (dejar vacío para no cambiar)' : 'PIN *'}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={form.pin}
              onChange={set('pin')}
              placeholder={esEdicion ? '• • • •' : '4-6 dígitos'}
            />
            {errores.pin && <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 3 }}>{errores.pin}</div>}
            <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', marginTop: 4 }}>
              El PIN se usa para iniciar sesión en la app móvil
            </div>
          </div>

          {esEdicion && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: 'var(--orange)' }}
              />
              Profesor activo
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={guardando}>
            {esEdicion ? 'Guardar cambios' : 'Crear profesor'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── PROFESORES PAGE ─────────────────────────────── */
export function ProfesoresPage() {
  const [profesores, setProfesores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [profesorEditando, setProfesorEditando] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos')

  const cargar = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filtroEstado === 'activos') params.activo = true
      if (filtroEstado === 'bajas')   params.activo = false

      const { data } = await profesoresService.listar({ ...params, incluir_admins: true })
      setProfesores(data)
    } catch {
      toast.error('Error al cargar profesores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(cargar, 250)
    return () => clearTimeout(t)
  }, [filtroEstado])

  const abrirNuevo   = () => { setProfesorEditando(null); setModalAbierto(true) }
  const abrirEdicion = (p) => { setProfesorEditando(p);  setModalAbierto(true) }
  const cerrarModal  = () => { setModalAbierto(false); setProfesorEditando(null) }

  const handleDarBaja = async (p) => {
    if (!confirm(`¿Dar de baja a ${p.nombre} ${p.apellidos}? No se borrará su historial.`)) return
    try {
      await profesoresService.darBaja(p.id)
      toast.success('Profesor dado de baja')
      cargar()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al dar de baja')
    }
  }

    const profesoresFiltrados = busqueda.trim()
    ? profesores.filter(p => {
        const nombreCompleto = `${p.nombre} ${p.apellidos}`.toLowerCase()
        const terminos = busqueda.toLowerCase().trim().split(/\s+/).filter(Boolean)
        return terminos.every(t => nombreCompleto.includes(t))
      })
    : profesores

  return (
    <>
      <Topbar
        titulo="Profesores"
        subtitulo={`${profesoresFiltrados.length} ${filtroEstado === 'bajas' ? 'bajas' : filtroEstado === 'activos' ? 'activos' : 'totales'}`}
        accion={{ label: 'Nuevo profesor', icon: '➕', onClick: abrirNuevo }}
      />

      {modalAbierto && (
        <ModalProfesor profesor={profesorEditando} onClose={cerrarModal} onGuardado={cargar} />
      )}

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, maxWidth: 400, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre o apellidos..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                padding: '9px 12px 9px 36px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', outline: 'none', background: 'var(--white)',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
          </div>

          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              padding: '9px 12px', border: '1px solid var(--grey-border)',
              borderRadius: 'var(--radius-sm)', background: 'var(--white)',
              color: 'var(--black)', cursor: 'pointer',
            }}
          >
            <option value="activos">Activos</option>
            <option value="bajas">Bajas</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner size={32} />
          </div>
        ) : profesoresFiltrados.length === 0 ? (
          <Card>
            <EmptyState
              icon="👩‍🏫"
              title={busqueda ? 'Sin resultados' : 'No hay profesores'}
              description={busqueda ? `No se encontró nadie con "${busqueda}"` : 'Crea el primer profesor pulsando "Nuevo profesor"'}
            />
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <span>👩‍🏫</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Profesores</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green-text)' }}>
                {profesoresFiltrados.length}
              </span>
            </CardHeader>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--white-off)' }}>
                  {['Profesor', 'Email', 'Teléfono', 'Rol', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '9px 20px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--grey-mid)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--grey-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profesoresFiltrados.map((p) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--white-off)',
                      opacity: p.activo ? 1 : 0.55,
                      transition: 'background var(--transition)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar nombre={p.nombre} apellidos={p.apellidos} size={34} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.nombre} {p.apellidos}</div>
                          {!p.activo && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)' }}>Inactivo</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '0.82rem', color: 'var(--grey-mid)' }}>{p.email || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: '0.82rem', color: 'var(--grey-mid)' }}>{p.telefono || '—'}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          title={`Color: ${p.color || '—'}`}
                          style={{
                            display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                            background: p.color || '#ddd',
                            border: '1px solid var(--grey-border)',
                          }}
                        />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--orange-pale)', border: '1px solid var(--orange-mid)', color: 'var(--orange-dark)', textTransform: 'capitalize' }}>
                          {p.rol}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>✏️ Editar</Button>
                      {p.activo && (
                        <Button size="sm" variant="ghost" onClick={() => handleDarBaja(p)}>Dar de baja</Button>
                      )}
                      {!p.activo && (
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await profesoresService.actualizar(p.id, { activo: true })
                          toast.success('Profesor reactivado')
                          cargar()
                        }}>Reactivar</Button>
                      )}
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