import React, { useEffect, useState, useCallback } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment/min/moment-with-locales'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import toast from 'react-hot-toast'
import { citasService, alumnosService, profesoresService } from '../utils/api'
import { Button } from '../components/ui'

// Locale español con la semana empezando en LUNES
moment.locale('es')
moment.updateLocale('es', {
  week: { dow: 1, doy: 4 },  // dow=1 → lunes, doy=4 → estándar ISO
})
const localizer = momentLocalizer(moment)

const MESSAGES_ES = {
  today: 'Hoy', previous: 'Anterior', next: 'Siguiente',
  month: 'Mes', week: 'Semana', day: 'Día', agenda: 'Agenda',
  date: 'Fecha', time: 'Hora', event: 'Cita',
  noEventsInRange: 'No hay citas en este rango',
  showMore: total => `+${total} más`,
}

export function AgendaPage() {
  const [citas, setCitas] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [profesores, setProfesores] = useState([])
  const [filtroProfesor, setFiltroProfesor] = useState('')
  const [vista, setVista] = useState('month')
  const [fecha, setFecha] = useState(new Date())
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setCargando(true)
      const params = {}
      if (filtroProfesor) params.profesor_id = filtroProfesor
      const [{ data: c }, { data: a }, { data: p }] = await Promise.all([
        citasService.listar(params),
        alumnosService.listar({ activo: true }),
        profesoresService.listar({ activo: true, incluir_admins: true }),
      ])
      setCitas(c)
      setAlumnos(a)
      setProfesores(p)
    } catch (e) {
      toast.error('Error cargando agenda')
    } finally {
      setCargando(false)
    }
  }, [filtroProfesor])

  useEffect(() => { cargar() }, [cargar])

  const eventos = citas.map(c => {
    const inicio = moment(`${c.fecha}T${c.hora_inicio}`).toDate()
    const fin = moment(`${c.fecha}T${c.hora_fin}`).toDate()
    return {
      id: c.id,
      title: `${c.alumno_nombre || '—'} · ${c.profesor_nombre}`,
      start: inicio,
      end: fin,
      resource: c,
      color: c.profesor_color || '#E75F00',
    }
  })

  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor: event.color,
      border: 'none',
      borderRadius: 4,
      color: 'white',
      fontSize: '0.78rem',
      fontWeight: 600,
      padding: '2px 6px',
      opacity: 0.95,
    },
  })

  const handleSelectSlot = ({ start, end }) => {
    setModal({ slot: { start, end } })
  }

  const handleSelectEvent = (event) => {
    setModal({ cita: event.resource })
  }

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', background: 'var(--white-off)' }}>

      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>
            📅 Agenda de Sesiones
          </h1>
          {(() => {
            const hoy = moment().startOf('day')
            const manana = moment().add(1, 'day').startOf('day')
            const citasHoy = citas.filter(c => moment(c.fecha).isSame(hoy, 'day')).length
            const citasManana = citas.filter(c => moment(c.fecha).isSame(manana, 'day')).length

            const plural = n => n === 1 ? '' : 's'

            return (
              <p style={{ fontSize: '0.88rem', color: 'var(--grey-mid)', marginTop: 4 }}>
                <strong style={{ color: citasHoy > 0 ? 'var(--orange)' : 'inherit' }}>
                  {citasHoy} cita{plural(citasHoy)} hoy
                </strong>
                <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
                <span style={{ color: citasManana > 0 ? 'var(--black)' : 'inherit' }}>
                  {citasManana} cita{plural(citasManana)} mañana
                </span>
                <span style={{ marginLeft: 14, fontSize: '0.8rem', opacity: 0.65 }}>
                  ({citas.length} {filtroProfesor ? 'de este profesor' : 'en total'})
                </span>
              </p>
            )
          })()}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={filtroProfesor}
            onChange={e => setFiltroProfesor(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--grey-border)',
              borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              background: 'white', minWidth: 180,
            }}
          >
            <option value="">👥 Todos los profesores</option>
            {profesores.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellidos}
              </option>
            ))}
          </select>

          <Button onClick={() => setModal({ slot: { start: new Date(), end: moment().add(1, 'hour').toDate() } })}>
            + Nueva cita
          </Button>
        </div>
      </div>

      {/* Calendario */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 16,
        border: '1px solid var(--grey-border)',
        height: 'calc(100vh - 175px)', minHeight: 500,
      }}>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--grey-mid)' }}>Cargando agenda…</div>
        ) : (
          <Calendar
            localizer={localizer}
            events={eventos}
            startAccessor="start"
            endAccessor="end"
            messages={MESSAGES_ES}
            culture="es"
            view={vista}
            onView={setVista}
            date={fecha}
            onNavigate={setFecha}
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            views={['month', 'week', 'day']}
            step={30}
            timeslots={2}
            min={moment('08:00', 'HH:mm').toDate()}
            max={moment('22:00', 'HH:mm').toDate()}
            formats={{
              timeGutterFormat: (date, culture, localizer) =>
                localizer.format(date, 'HH:mm', culture),
              eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
                `${localizer.format(start, 'HH:mm', culture)} - ${localizer.format(end, 'HH:mm', culture)}`,
              agendaTimeFormat: (date, culture, localizer) =>
                localizer.format(date, 'HH:mm', culture),
              agendaTimeRangeFormat: ({ start, end }, culture, localizer) =>
                `${localizer.format(start, 'HH:mm', culture)} - ${localizer.format(end, 'HH:mm', culture)}`,
              dayFormat: (date, culture, localizer) =>
                localizer.format(date, 'ddd DD/MM', culture),
              dayHeaderFormat: (date, culture, localizer) =>
                localizer.format(date, 'dddd DD/MM', culture),
              monthHeaderFormat: (date, culture, localizer) =>
                localizer.format(date, 'MMMM YYYY', culture),
              weekdayFormat: (date, culture, localizer) =>
                localizer.format(date, 'ddd', culture),
            }}
            style={{ height: '100%' }}
          />
        )}
      </div>

      {/* Modal */}
      {modal && (
        <CitaModal
          modal={modal}
          alumnos={alumnos}
          profesores={profesores}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar() }}
        />
      )}
    </div>
  )
}


// ── Modal de cita ────────────────────────────────────────────

function CitaModal({ modal, alumnos, profesores, onCerrar, onGuardado }) {
  const esEdicion = !!modal.cita
  const cita = modal.cita || {}

  const inicio = modal.slot?.start || new Date()
  const fin = modal.slot?.end || new Date()

  const [form, setForm] = useState({
    fecha: cita.fecha || moment(inicio).format('YYYY-MM-DD'),
    hora_inicio: cita.hora_inicio || moment(inicio).format('HH:mm'),
    hora_fin: cita.hora_fin || moment(fin).format('HH:mm'),
    alumno_id: cita.alumno_id || '',
    alumno_texto: cita.alumno_texto || '',
    profesor_id: cita.profesor_id || (profesores[0]?.id || ''),
    observaciones: cita.observaciones || '',
  })
  const [busquedaAlumno, setBusquedaAlumno] = useState(cita.alumno_nombre || '')
  const [mostrarLista, setMostrarLista] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const alumnosFiltrados = alumnos.filter(a => {
    if (!busquedaAlumno) return true
    const txt = `${a.nombre} ${a.apellidos}`.toLowerCase()
    return txt.includes(busquedaAlumno.toLowerCase())
  }).slice(0, 20)

  const guardar = async () => {
    if (!form.alumno_id && !form.alumno_texto) {
      toast.error('Selecciona un alumno o escribe un nombre')
      return
    }
    if (form.hora_fin <= form.hora_inicio) {
      toast.error('La hora de fin debe ser posterior')
      return
    }
    setGuardando(true)
    try {
      const payload = {
        fecha: form.fecha,
        hora_inicio: form.hora_inicio.length === 5 ? `${form.hora_inicio}:00` : form.hora_inicio,
        hora_fin: form.hora_fin.length === 5 ? `${form.hora_fin}:00` : form.hora_fin,
        alumno_id: form.alumno_id || null,
        alumno_texto: form.alumno_id ? null : form.alumno_texto,
        profesor_id: Number(form.profesor_id),
        observaciones: form.observaciones || null,
      }
      if (esEdicion) {
        await citasService.actualizar(cita.id, payload)
        toast.success('Cita actualizada')
      } else {
        await citasService.crear(payload)
        toast.success('Cita creada')
      }
      onGuardado()
    } catch (e) {
      toast.error('Error: ' + (e.response?.data?.detail || e.message))
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!confirm('¿Eliminar esta cita?')) return
    try {
      await citasService.eliminar(cita.id)
      toast.success('Cita eliminada')
      onGuardado()
    } catch (e) {
      toast.error('Error al eliminar')
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--grey-border)',
    borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: '0.9rem',
    background: 'white',
  }
  const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onCerrar}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 28, maxWidth: 520, width: '90%',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase' }}>
          {esEdicion ? '✏️ Editar cita' : '➕ Nueva cita'}
        </h2>

        <div style={{ display: 'grid', gap: 16 }}>

          <div>
            <label style={labelStyle}>Fecha</label>
            <input type="date" value={form.fecha}
              onChange={e => setForm({ ...form, fecha: e.target.value })}
              style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Hora inicio</label>
              <input type="time" value={form.hora_inicio}
                onChange={e => setForm({ ...form, hora_inicio: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Hora fin</label>
              <input type="time" value={form.hora_fin}
                onChange={e => setForm({ ...form, hora_fin: e.target.value })}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Profesor</label>
            <select value={form.profesor_id}
              onChange={e => setForm({ ...form, profesor_id: e.target.value })}
              style={inputStyle}>
              {profesores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Alumno</label>
            <input
              type="text"
              placeholder="Buscar por nombre…"
              value={busquedaAlumno}
              onChange={e => { setBusquedaAlumno(e.target.value); setMostrarLista(true) }}
              onFocus={() => setMostrarLista(true)}
              style={inputStyle}
            />
            {mostrarLista && alumnosFiltrados.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                maxHeight: 200, overflowY: 'auto', background: 'white',
                border: '1px solid var(--grey-border)', borderRadius: 8,
                marginTop: 4, zIndex: 10, boxShadow: 'var(--shadow-md)',
              }}>
                {alumnosFiltrados.map(a => (
                  <div key={a.id}
                    onClick={() => {
                      setForm({ ...form, alumno_id: a.id, alumno_texto: '' })
                      setBusquedaAlumno(`${a.nombre} ${a.apellidos}`)
                      setMostrarLista(false)
                    }}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.88rem' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-pale)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {a.nombre} {a.apellidos}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!form.alumno_id && (
            <div>
              <label style={labelStyle}>Nombre libre (si no está en la lista)</label>
              <input type="text" placeholder="Ej: Alumno externo" value={form.alumno_texto}
                onChange={e => setForm({ ...form, alumno_texto: e.target.value })}
                style={inputStyle} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Observaciones</label>
            <textarea value={form.observaciones} rows={3}
              placeholder="Notas opcionales…"
              onChange={e => setForm({ ...form, observaciones: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          {esEdicion && (
            <button onClick={eliminar} style={{
              padding: '10px 16px', background: 'transparent', color: 'var(--red)',
              border: '1px solid var(--red)', borderRadius: 8, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
            }}>
              🗑️ Eliminar
            </button>
          )}
          <button onClick={onCerrar} style={{
            padding: '10px 16px', background: 'var(--white-off)', color: 'var(--black)',
            border: '1px solid var(--grey-border)', borderRadius: 8, cursor: 'pointer',
            fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
          }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando} style={{
            padding: '10px 20px', background: 'var(--orange)', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
          }}>
            {guardando ? 'Guardando…' : (esEdicion ? 'Guardar cambios' : 'Crear cita')}
          </button>
        </div>

      </div>
    </div>
  )
}