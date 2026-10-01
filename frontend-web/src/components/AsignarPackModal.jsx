import React, { useEffect, useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { packsService, tarifasService, profesoresService } from '../utils/api'
import { Button } from './ui'

/* ── DROPDOWN CON BUSCADOR ──────────────────────────────── */
function SearchableSelect({ value, onChange, options, placeholder, grouped = false, renderOption, renderValue }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const contenedorRef = useRef(null)
  const inputRef = useRef(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return
    const handler = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false)
        setBusqueda('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])

  // Enfocar el buscador al abrir
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 50)
  }, [abierto])

  // Filtrar opciones (aplanamos si es agrupado)
  const opcionesPlanas = grouped
    ? options.flatMap(g => g.items.map(i => ({ ...i, _grupo: g.label })))
    : options

  const q = busqueda.toLowerCase().trim()
  const filtradas = q
    ? opcionesPlanas.filter(o => {
        const texto = (o.nombre || o.label || '').toLowerCase()
        return texto.includes(q)
      })
    : opcionesPlanas

  // Agrupar de nuevo si hace falta
  const agrupadas = grouped
    ? filtradas.reduce((acc, o) => {
        const g = o._grupo || 'Otros'
        if (!acc[g]) acc[g] = []
        acc[g].push(o)
        return acc
      }, {})
    : { '': filtradas }

  const seleccionada = opcionesPlanas.find(o => String(o.value) === String(value))

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        style={{
          width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.88rem',
          padding: '8px 12px', border: `1px solid ${abierto ? 'var(--orange)' : 'var(--grey-border)'}`,
          borderRadius: 'var(--radius-sm)', background: 'var(--white)',
          color: seleccionada ? 'var(--black)' : 'var(--grey-mid)',
          cursor: 'pointer', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {seleccionada ? (renderValue ? renderValue(seleccionada) : seleccionada.label || seleccionada.nombre) : placeholder}
        </span>
        <span style={{ color: 'var(--grey-mid)', flexShrink: 0 }}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          marginTop: 4, background: 'var(--white)',
          border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          {/* Buscador */}
          <div style={{ padding: 8, borderBottom: '1px solid var(--grey-border)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="🔍 Buscar..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                padding: '6px 10px', border: '1px solid var(--grey-border)',
                borderRadius: 'var(--radius-sm)', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-border)'}
            />
          </div>

          {/* Lista */}
          <div style={{ overflowY: 'auto', maxHeight: 260 }}>
            {Object.keys(agrupadas).length === 0 || filtradas.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.82rem' }}>
                Sin resultados
              </div>
            ) : (
              Object.entries(agrupadas).map(([grupo, items]) => (
                <div key={grupo}>
                  {grouped && grupo && (
                    <div style={{
                      padding: '6px 12px', background: 'var(--white-off)',
                      fontSize: '0.68rem', fontWeight: 700, color: 'var(--grey-mid)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      position: 'sticky', top: 0, zIndex: 1,
                    }}>
                      {grupo}
                    </div>
                  )}
                  {items.map(o => (
                    <div
                      key={o.value}
                      onClick={() => {
                        onChange(o.value)
                        setAbierto(false)
                        setBusqueda('')
                      }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem',
                        background: String(o.value) === String(value) ? 'var(--orange-pale)' : 'transparent',
                        color: String(o.value) === String(value) ? 'var(--orange-dark)' : 'var(--black)',
                        fontWeight: String(o.value) === String(value) ? 600 : 400,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                      onMouseLeave={e => e.currentTarget.style.background = String(o.value) === String(value) ? 'var(--orange-pale)' : 'transparent'}
                    >
                      {renderOption ? renderOption(o) : (o.label || o.nombre)}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── MODAL ASIGNAR PACK ─────────────────────────────────── */
export function AsignarPackModal({ alumnoId, onClose, onCreado }) {
  const [tarifas, setTarifas] = useState([])
  const [profesores, setProfesores] = useState([])
  const [form, setForm] = useState({ tarifa_id: '', profesor_id: '', notas: '' })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([
      tarifasService.listar({ activo: true }),
      // 👇 Solo profesores Y admins ACTIVOS (incluir_admins para que puedas asignarte a ti mismo)
      profesoresService.listar({ activo: true, incluir_admins: true }),
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

  const tarifasAgrupadas = Object.entries(
    tarifas.reduce((acc, t) => {
      const g = t.categoria
      if (!acc[g]) acc[g] = []
      acc[g].push({
        value: t.id,
        nombre: t.nombre,
        precio: t.precio_base,
        horas_semanales: t.horas_semanales,
        num_sesiones: t.num_sesiones,
        categoria: t.categoria,
      })
      return acc
    }, {})
  ).map(([cat, items]) => ({ label: CAT_LABEL[cat] || cat, items }))

  const opcionesProfes = profesores.map(p => ({
    value: p.id,
    nombre: `${p.nombre} ${p.apellidos}`,
  }))

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

        {/* Selector de tarifa con buscador */}
        <div>
          <label style={labelStyle}>Tarifa *</label>
          <SearchableSelect
            value={form.tarifa_id}
            onChange={v => setForm(f => ({ ...f, tarifa_id: v }))}
            options={tarifasAgrupadas}
            grouped
            placeholder="— Selecciona una tarifa —"
            renderOption={o => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nombre}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--grey-mid)', flexShrink: 0 }}>
                  {o.precio.toFixed(2)}€
                </span>
              </div>
            )}
            renderValue={o => `${o.nombre} — ${o.precio.toFixed(2)}€/mes`}
          />

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

        {/* Selector de profesor con buscador */}
        <div>
          <label style={labelStyle}>Profesor *</label>
          <SearchableSelect
            value={form.profesor_id}
            onChange={v => setForm(f => ({ ...f, profesor_id: v }))}
            options={opcionesProfes}
            placeholder="— Selecciona un profesor —"
          />
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