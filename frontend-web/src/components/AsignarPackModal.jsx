import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { packsService, tarifasService, profesoresService } from '../utils/api'
import { Button } from './ui'

/* ── MODAL ASIGNAR PACK (reutilizable) ───────────────────────
   Se usa desde:
     - AlumnoFichaPage (botón "+ Añadir pack")
     - CobroNuevoPage  (botón "+ Añadir pack" cuando el alumno no tiene packs)
   Props:
     - alumnoId: id del alumno al que asignar el pack
     - onClose:  cerrar el modal sin hacer nada
     - onCreado: callback tras crear el pack (recargar datos del padre)
*/
export function AsignarPackModal({ alumnoId, onClose, onCreado }) {
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