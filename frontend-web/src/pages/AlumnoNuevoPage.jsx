import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Button, Input, Card, CardHeader, CardBody } from '../components/ui'

const CAMPO_VACIO = {
  nombre: '', apellidos: '', fecha_nacimiento: '', fecha_inscripcion: '',
  telefono1: '', telefono2: '', direccion: '', email: '',
}

export function AlumnoNuevoPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    ...CAMPO_VACIO,
    fecha_inscripcion: new Date().toISOString().slice(0, 10),
  })
  const [errores, setErrores] = useState({})
  const [loading, setLoading] = useState(false)

  const set = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }))
    if (errores[campo]) setErrores(e => ({ ...e, [campo]: null }))
  }

  const validar = () => {
    const e = {}
    if (!form.nombre.trim())    e.nombre    = 'El nombre es obligatorio'
    if (!form.apellidos.trim()) e.apellidos = 'Los apellidos son obligatorios'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setLoading(true)
    try {
      const payload = {
        nombre:            form.nombre.trim(),
        apellidos:         form.apellidos.trim(),
        fecha_nacimiento:  form.fecha_nacimiento  || null,
        fecha_inscripcion: form.fecha_inscripcion || null,
        telefono1:         form.telefono1.trim()  || null,
        telefono2:         form.telefono2.trim()  || null,
        direccion:         form.direccion.trim()  || null,
        email:             form.email.trim()      || null,
      }
      const { data } = await alumnosService.crear(payload)
      toast.success(`Alumno ${data.nombre} ${data.apellidos} creado ✓`)
      navigate(`/alumnos/${data.id}`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear el alumno')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Topbar titulo="Nuevo alumno" subtitulo="Rellena los datos del alumno" />

      <div style={{ padding: '24px 32px', maxWidth: 720 }}>
        <Card>
          <CardHeader>
            <span>🎓</span>
            <span style={{ fontWeight: 700 }}>Datos personales</span>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <Input label="Nombre *"    value={form.nombre}    onChange={e => set('nombre', e.target.value)}    error={errores.nombre}    placeholder="Ej: Lucas" />
              <Input label="Apellidos *" value={form.apellidos} onChange={e => set('apellidos', e.target.value)} error={errores.apellidos} placeholder="Ej: Fernández García" />

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
                  Fecha de nacimiento
                </label>
                <input type="date" value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)}
                  style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.88rem', padding: '8px 12px', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
                  Fecha de inscripción
                </label>
                <input type="date" value={form.fecha_inscripcion} onChange={e => set('fecha_inscripcion', e.target.value)}
                  style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.88rem', padding: '8px 12px', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                />
              </div>

              <Input label="Teléfono principal" value={form.telefono1} onChange={e => set('telefono1', e.target.value)} placeholder="Ej: 600 123 456" />
              <Input label="Teléfono secundario" value={form.telefono2} onChange={e => set('telefono2', e.target.value)} placeholder="Ej: 956 000 000" />

              <div style={{ gridColumn: '1 / -1' }}>
                <Input label="Email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Ej: padre@email.com" type="email" />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--grey-mid)', display: 'block', marginBottom: 4 }}>
                  Dirección
                </label>
                <textarea
                  value={form.direccion}
                  onChange={e => set('direccion', e.target.value)}
                  placeholder="Calle, número, ciudad..."
                  rows={2}
                  style={{
                    width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.88rem',
                    padding: '8px 12px', border: '1px solid var(--grey-border)',
                    borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                  onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
                />
              </div>

            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => navigate('/alumnos')}>Cancelar</Button>
              <Button variant="primary" loading={loading} onClick={handleGuardar}>
                ✓ Guardar alumno
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
