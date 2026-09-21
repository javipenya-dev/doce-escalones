import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { profesoresService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Button, Avatar, EmptyState, Spinner, Input } from '../components/ui'

/* ── MODAL ALTA / EDICIÓN ────────────────────────── */
function ModalProfesor({ profesor, onClose, onGuardado }) {
  const esEdicion = Boolean(profesor)
  const [form, setForm] = useState({
    nombre:    profesor?.nombre    || '',
    apellidos: profesor?.apellidos || '',
    email:     profesor?.email     || '',
    pin:       '',
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

      if (esEdicion) {
        await profesoresService.actualizar(profesor.id, payload)
        toast.success('Profesor actualizado')
      } else {
        await profesoresService.crear({ ...payload, rol: 'profesor' })
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
        padding: 28, width: 440, boxShadow: 'var(--shadow-lg)',
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

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await profesoresService.listar()
      setProfesores(data)
    } catch {
      toast.error('Error al cargar profesores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const abrirNuevo    = () => { setProfesorEditando(null); setModalAbierto(true) }
  const abrirEdicion  = (p) => { setProfesorEditando(p);  setModalAbierto(true) }
  const cerrarModal   = () => { setModalAbierto(false); setProfesorEditando(null) }

  const activos   = profesores.filter(p => p.activo)
  const inactivos = profesores.filter(p => !p.activo)

  return (
    <>
      <Topbar
        titulo="Profesores"
        subtitulo={`${activos.length} activos`}
        accion={{ label: 'Nuevo profesor', icon: '➕', onClick: abrirNuevo }}
      />

      {modalAbierto && (
        <ModalProfesor profesor={profesorEditando} onClose={cerrarModal} onGuardado={cargar} />
      )}

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner size={32} />
          </div>
        ) : profesores.length === 0 ? (
          <Card>
            <EmptyState icon="👩‍🏫" title="No hay profesores" description='Crea el primer profesor pulsando "Nuevo profesor"' />
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <span>👩‍🏫</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Profesores activos</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green-text)' }}>
                  {activos.length}
                </span>
              </CardHeader>

              {activos.length === 0 ? (
                <CardBody>
                  <p style={{ color: 'var(--grey-mid)', fontSize: '0.85rem', margin: 0 }}>No hay profesores activos</p>
                </CardBody>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--white-off)' }}>
                      {['Profesor', 'Email', 'Rol', 'Acciones'].map(h => (
                        <th key={h} style={{ padding: '9px 20px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--grey-mid)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--grey-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activos.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--white-off)', transition: 'background var(--transition)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar nombre={p.nombre} apellidos={p.apellidos} size={34} />
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.nombre} {p.apellidos}</div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '0.82rem', color: 'var(--grey-mid)' }}>{p.email || '—'}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--orange-pale)', border: '1px solid var(--orange-mid)', color: 'var(--orange-dark)', textTransform: 'capitalize' }}>
                            {p.rol}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>✏️ Editar</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {inactivos.length > 0 && (
              <Card>
                <CardHeader>
                  <span>😴</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--grey-mid)' }}>Profesores inactivos</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--grey-border)', color: 'var(--grey-mid)' }}>
                    {inactivos.length}
                  </span>
                </CardHeader>
                <table style={{ width: '100%', borderCollapse: 'collapse', opacity: 0.7 }}>
                  <tbody>
                    {inactivos.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--white-off)', transition: 'background var(--transition)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar nombre={p.nombre} apellidos={p.apellidos} size={30} />
                            <span style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>{p.nombre} {p.apellidos}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 20px', fontSize: '0.82rem', color: 'var(--grey-light)' }}>{p.email || '—'}</td>
                        <td style={{ padding: '10px 20px' }}>
                          <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>Reactivar</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}
