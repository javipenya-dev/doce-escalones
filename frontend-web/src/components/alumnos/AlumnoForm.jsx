import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { alumnosService } from '../../utils/api'
import { Button, Input, Spinner } from '../ui'
import { Topbar } from '../layout/Topbar'

const EMPTY_FORM = {
  nombre: '', apellidos: '',
  fecha_nacimiento: '', fecha_inscripcion: new Date().toISOString().split('T')[0],
  telefono1: '', telefono2: '',
  direccion: '', email: '',
}

export function AlumnoForm({ modo = 'crear' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errores, setErrores] = useState({})
  const [loading, setLoading] = useState(false)
  const [cargando, setCargando] = useState(modo === 'editar')

  useEffect(() => {
    if (modo === 'editar' && id) {
      alumnosService.obtener(id).then(({ data }) => {
        setForm({
          nombre:            data.nombre || '',
          apellidos:         data.apellidos || '',
          fecha_nacimiento:  data.fecha_nacimiento || '',
          fecha_inscripcion: data.fecha_inscripcion || '',
          telefono1:         data.telefono1 || '',
          telefono2:         data.telefono2 || '',
          direccion:         data.direccion || '',
          email:             data.email || '',
        })
      }).catch(() => toast.error('No se pudo cargar el alumno'))
        .finally(() => setCargando(false))
    }
  }, [modo, id])

  const set = (campo) => (e) => {
    setForm(f => ({ ...f, [campo]: e.target.value }))
    if (errores[campo]) setErrores(err => ({ ...err, [campo]: null }))
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
        ...form,
        fecha_nacimiento:  form.fecha_nacimiento  || null,
        fecha_inscripcion: form.fecha_inscripcion || null,
        telefono2:  form.telefono2  || null,
        direccion:  form.direccion  || null,
        email:      form.email      || null,
      }
      if (modo === 'crear') {
        await alumnosService.crear(payload)
        toast.success('Alumno creado correctamente ✅')
        navigate('/alumnos')
      } else {
        await alumnosService.actualizar(id, payload)
        toast.success('Datos actualizados correctamente ✅')
        navigate(`/alumnos/${id}`)
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  if (cargando) return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <Spinner size={36} />
    </div>
  )

  return (
    <>
      <Topbar
        titulo={modo === 'crear' ? 'Nuevo alumno' : 'Editar alumno'}
        subtitulo={modo === 'editar' ? `${form.nombre} ${form.apellidos}` : 'Rellena los datos del alumno'}
      />
      <div style={{ padding: '28px 32px', maxWidth: 720 }}>
        <div style={{
          background: 'var(--white)', border: '1px solid var(--grey-border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>

          {/* Sección datos personales */}
          <SectionHeader icon="👤" title="Datos personales" />
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Nombre *"    value={form.nombre}    onChange={set('nombre')}    error={errores.nombre}    placeholder="Ej: Lucas" />
            <Input label="Apellidos *" value={form.apellidos} onChange={set('apellidos')} error={errores.apellidos} placeholder="Ej: Fernández García" />
            <Input label="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
            <Input label="Fecha de inscripción" type="date" value={form.fecha_inscripcion} onChange={set('fecha_inscripcion')} />
          </div>

          {/* Sección contacto */}
          <SectionHeader icon="📞" title="Contacto" />
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Teléfono 1" type="tel" value={form.telefono1} onChange={set('telefono1')} placeholder="Ej: 956 000 000" />
            <Input label="Teléfono 2" type="tel" value={form.telefono2} onChange={set('telefono2')} placeholder="Opcional" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="Ej: familia@email.com" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Dirección" value={form.direccion} onChange={set('direccion')} placeholder="Ej: C/ Ejemplo 1, Jerez de la Frontera" />
            </div>
          </div>

          {/* Acciones */}
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--grey-border)',
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            background: 'var(--white-off)',
          }}>
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button loading={loading} onClick={handleGuardar}>
              {modo === 'crear' ? '➕ Crear alumno' : '💾 Guardar cambios'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function SectionHeader({ icon, title }) {
  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--grey-border)',
      borderTop: '1px solid var(--grey-border)',
      background: 'var(--white-off)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </span>
    </div>
  )
}
