import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { configService } from '../utils/api'
import { Topbar } from '../components/layout/Topbar'
import { Card, CardHeader, CardBody, Button, Spinner } from '../components/ui'
import { BackupPanel } from '../components/BackupPanel'

function Campo({ label, name, value, onChange, placeholder, type = 'text', help }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        name={name}
        value={value || ''}
        onChange={e => onChange(e.target.name, e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={e => e.target.style.borderColor = 'var(--orange)'}
        onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
      />
      {help && <div style={{ fontSize: '0.73rem', color: 'var(--grey-light)', marginTop: 3 }}>{help}</div>}
    </div>
  )
}

/* ── Modal de confirmación para reparar resúmenes ── */
function ModalConfirmarReparar({ onClose, onConfirmar, procesando }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              ¿Has hecho un borrado masivo?
            </h2>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--grey-mid)', lineHeight: 1.5 }}>
              Esta acción <strong>regenera todos los resúmenes mensuales</strong> a partir
              de las asistencias existentes.
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--white-off)', padding: '12px 14px', borderRadius: 8,
          fontSize: '0.8rem', color: 'var(--grey-mid)', lineHeight: 1.55,
          borderLeft: '3px solid var(--orange)',
          marginBottom: 20,
        }}>
          <strong style={{ color: 'var(--black)' }}>Solo úsala si</strong> has borrado
          cobros, facturas o asistencias por SQL. Si no, puedes cancelar sin problema —
          no pasa nada por no ejecutarla.
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={procesando}
            style={{
              padding: '10px 20px', background: 'var(--white-off)', color: 'var(--black)',
              border: '1px solid var(--grey-border)', borderRadius: 8, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
            }}
          >
            No, cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={procesando}
            style={{
              padding: '10px 20px', background: 'var(--orange)', color: 'white',
              border: 'none', borderRadius: 8, cursor: procesando ? 'wait' : 'pointer',
              fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
              opacity: procesando ? 0.6 : 1,
            }}
          >
            {procesando ? 'Reparando…' : 'Sí, reparar resúmenes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfiguracionPage() {
  const [config, setConfig] = useState(null)
  const [form, setForm]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [cambios, setCambios] = useState(false)

  // Estado para el modal de reparación
  const [modalReparar, setModalReparar] = useState(false)
  const [reparando, setReparando] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await configService.obtener()
      setConfig(data)
      setForm({
        nombre:   data.nombre   || '',
        cif:      data.cif      || '',
        direccion: data.direccion || '',
        telefono: data.telefono || '',
        email:    data.email    || '',
      })
    } catch {
      toast.error('No se pudo cargar la configuración')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setCambios(true)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data } = await configService.actualizar(form)
      setConfig(data)
      setCambios(false)
      toast.success('Configuración guardada ✓')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const subirLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Solo se admiten PNG o JPG')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('El logo no puede superar 2 MB')
      return
    }
    setSubiendoLogo(true)
    try {
      const { data } = await configService.subirLogo(file)
      setConfig(data)
      toast.success('Logo actualizado ✓')
    } catch {
      toast.error('Error al subir el logo')
    } finally {
      setSubiendoLogo(false)
      e.target.value = ''
    }
  }

  const ejecutarReparacion = async () => {
    setReparando(true)
    try {
      const { data } = await configService.repararResumenes()
      toast.success(data.mensaje || 'Reparación completada')
      setModalReparar(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al reparar')
    } finally {
      setReparando(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
      <Spinner size={36} />
    </div>
  )

  return (
    <>
      <Topbar
        titulo="Configuración"
        subtitulo="Datos fiscales de la academia"
        accion={cambios ? { label: 'Guardar cambios', icon: '💾', onClick: guardar, loading: guardando } : null}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>

        {/* Datos fiscales */}
        <Card>
          <CardHeader>
            <span>🏫</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Datos de la academia</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--grey-light)' }}>
              Aparecen en tickets y facturas
            </span>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Campo label="Nombre de la academia *" name="nombre" value={form.nombre}
                  onChange={set} placeholder="12 Escalones" />
              </div>
              <Campo label="CIF / NIF" name="cif" value={form.cif}
                onChange={set} placeholder="B12345678" help="Para la cabecera de facturas" />
              <Campo label="Teléfono" name="telefono" value={form.telefono}
                onChange={set} placeholder="956 123 456" />
              <div style={{ gridColumn: '1 / -1' }}>
                <Campo label="Dirección" name="direccion" value={form.direccion}
                  onChange={set} placeholder="Calle Mayor, 1 · Jerez de la Frontera" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Campo label="Email" name="email" value={form.email}
                  onChange={set} placeholder="academia@ejemplo.com" type="email" />
              </div>
            </div>

            {cambios && (
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={guardar} loading={guardando}>
                  💾 Guardar cambios
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Logo */}
        <Card>
          <CardHeader>
            <span>🖼️</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Logo</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--grey-light)' }}>
              PNG o JPG · máx 2 MB
            </span>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius)',
                border: '2px dashed var(--grey-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--white-off)', flexShrink: 0, overflow: 'hidden',
              }}>
                {config?.logo_path ? (
                  <img
                    src={`/api/media/${config.logo_path.split(/[\\/]/).pop()}`}
                    alt="Logo academia"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <span style={{ fontSize: '2rem' }}>🏫</span>
                )}
              </div>

              <div>
                <p style={{ fontSize: '0.84rem', color: 'var(--grey-mid)', marginBottom: 12 }}>
                  {config?.logo_path
                    ? 'Logo actual cargado. Sube uno nuevo para reemplazarlo.'
                    : 'Sin logo. Súbelo para que aparezca en tickets y facturas.'}
                </p>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--orange-pale)', color: 'var(--orange-dark)',
                  border: 'none', borderRadius: 8, padding: '8px 16px',
                  fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  opacity: subiendoLogo ? 0.6 : 1,
                }}>
                  {subiendoLogo ? '⏳ Subiendo...' : '📤 Subir logo'}
                  <input
                    type="file" accept="image/png,image/jpeg"
                    onChange={subirLogo} style={{ display: 'none' }}
                    disabled={subiendoLogo}
                  />
                </label>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Numeración facturas */}
        <Card>
          <CardHeader>
            <span>🔢</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Numeración de facturas</span>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                background: 'var(--white-off)', borderRadius: 'var(--radius)',
                padding: '14px 20px', flex: 1,
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Próxima factura
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: '1.1rem', color: 'var(--orange)' }}>
                  FAC-{new Date().getFullYear()}-{String(config?.siguiente_num_factura || 1).padStart(3, '0')}
                </div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--grey-mid)', flex: 2 }}>
                La numeración es automática y correlativa. Se reinicia cada año.
                El número se asigna en el momento de generar la factura desde un cobro.
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Backups */}
        <BackupPanel />

        {/* 🔥 Herramientas avanzadas */}
        <Card>
          <CardHeader>
            <span>🛠️</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Herramientas avanzadas</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--grey-light)' }}>
              Solo para casos puntuales
            </span>
          </CardHeader>
          <CardBody>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 18px', background: 'var(--white-off)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--grey-border)',
            }}>
              <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>🔧</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 3 }}>
                  Reparar resúmenes mensuales
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--grey-mid)', lineHeight: 1.5 }}>
                  Regenera los <code style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}>resumen_mensual</code> a
                  partir de las asistencias. Útil tras un borrado masivo por SQL.
                </div>
              </div>
              <button
                onClick={() => setModalReparar(true)}
                style={{
                  background: 'var(--white)',
                  border: '1px solid var(--grey-border)',
                  color: 'var(--grey-mid)',
                  borderRadius: 8,
                  padding: '9px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  flexShrink: 0,
                }}
              >
                Ejecutar reparación
              </button>
            </div>
          </CardBody>
        </Card>

      </div>

      {/* Modal de confirmación */}
      {modalReparar && (
        <ModalConfirmarReparar
          onClose={() => !reparando && setModalReparar(false)}
          onConfirmar={ejecutarReparacion}
          procesando={reparando}
        />
      )}
    </>
  )
}

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600,
  color: 'var(--grey-mid)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 4,
}
const inputStyle = {
  width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.88rem',
  padding: '8px 12px', border: '1px solid var(--grey-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--white)',
  color: 'var(--black)', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}