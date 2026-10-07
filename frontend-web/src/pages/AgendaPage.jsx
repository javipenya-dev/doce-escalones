import React, { useEffect, useState, useCallback } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment/min/moment-with-locales'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import toast from 'react-hot-toast'
import { citasService, alumnosService, profesoresService } from '../utils/api'
import { Button } from '../components/ui'

moment.locale('es')
moment.updateLocale('es', {
  week: { dow: 1, doy: 4 },
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
      const profesOrdenados = [...p].sort((a, b) => {
        const esElisabet = (x) =>
          (x.nombre?.toLowerCase().includes('elisabet') ||
           x.nombre?.toLowerCase().includes('elisabeth'))

        if (esElisabet(a) && !esElisabet(b)) return -1
        if (!esElisabet(a) && esElisabet(b)) return 1

        return `${a.apellidos || ''} ${a.nombre || ''}`.localeCompare(
               `${b.apellidos || ''} ${b.nombre || ''}`)
      })
      setProfesores(profesOrdenados)
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
    const horaTxt = `${c.hora_inicio?.slice(0, 5)}-${c.hora_fin?.slice(0, 5)}`
    return {
      id: c.id,
      title: `${c.alumno_nombre || '—'} · ${c.profesor_nombre}`,
      tooltip: `${horaTxt} · ${c.alumno_nombre || '—'} · ${c.profesor_nombre}`,
      start: inicio,
      end: fin,
      resource: c,
      color: c.profesor_color || '#E75F00',
    }
  })

  // Estilo de cada cita
  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor: event.color,
      border: '2px solid #FFFFFF',
      borderRadius: 6,
      color: 'white',
      fontSize: '0.76rem',
      fontWeight: 700,
      padding: '3px 8px',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(0,0,0,0.15)',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  })

  const handleSelectSlot = ({ start }) => {
    if (vista === 'day') {
      const inicio = moment(start).minutes() === 0
        ? moment(start).startOf('hour')
        : moment(start).startOf('hour').add(1, 'hour')
      const fin = inicio.clone().add(1, 'hour')
      setModal({ slot: { start: inicio.toDate(), end: fin.toDate() } })
    } else {
      setFecha(start)
      setVista('day')
    }
  }

  const handleSelectEvent = (event) => {
    setModal({ cita: event.resource })
  }

  const abrirNuevaCita = () => {
    const ahora = moment()
    const proximaHora = ahora.minutes() === 0
      ? ahora.clone().seconds(0).milliseconds(0)
      : ahora.clone().add(1, 'hour').startOf('hour')
    setModal({
      slot: {
        start: proximaHora.toDate(),
        end: proximaHora.clone().add(1, 'hour').toDate(),
      },
    })
  }

  const esMes = vista === 'month'

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

          <Button onClick={abrirNuevaCita}>
            + Nueva cita
          </Button>
        </div>
      </div>

      {/* Pista contextual */}
      <div style={{
        marginBottom: 10, fontSize: '0.78rem', color: 'var(--grey-mid)',
        display: 'flex', gap: 16, flexWrap: 'wrap',
      }}>
        {vista === 'month' && <span>💡 Clica un día para <strong>ver ese día en detalle</strong>.</span>}
        {vista === 'week'  && <span>💡 Clica un hueco para <strong>ver ese día en detalle</strong>.</span>}
        {vista === 'day'   && <span>💡 Clica un hueco para <strong>crear una cita</strong> a esa hora.</span>}
        <span style={{ opacity: 0.7 }}>·</span>
        <span>Para crear una cita nueva, pulsa <strong>+ Nueva cita</strong>.</span>
      </div>

      {/* Calendario con scroll */}
            <div className={`agenda-wrapper agenda-${vista}`} style={{
        background: 'white', borderRadius: 12, padding: 16,
        border: '1px solid var(--grey-border)',
        height: 'calc(100vh - 210px)', minHeight: 500,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--grey-mid)' }}>Cargando agenda…</div>
        ) : (
                    <div style={{
            height: esMes ? 'auto' : 'calc((100vh - 210px) * 1.3)',
            minHeight: esMes ? 950 : 900,
          }}>
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
              dayLayoutAlgorithm="no-overlap"
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
          </div>
        )}
      </div>

      {modal && (
        <CitaModal
          modal={modal}
          alumnos={alumnos}
          profesores={profesores}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar() }}
        />
      )}

      {/* Estilos CSS globales */}
      <style>{`
        /* ══════════════════════════════════════════════════════════ */
        /* TOOLBAR STICKY: solo en vista Semana y Día (no en Mes)     */
        /* ══════════════════════════════════════════════════════════ */
        .agenda-week .rbc-toolbar,
        .agenda-day .rbc-toolbar {
          position: sticky !important;
          top: 0 !important;
          z-index: 200 !important;
          background: white !important;
          padding: 10px 0 !important;
          margin: 0 0 8px 0 !important;
          border-bottom: 1px solid var(--grey-border) !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
        }

        /* Botones de la toolbar */
        .rbc-toolbar button {
          font-family: var(--font-body) !important;
          font-size: 0.82rem !important;
          font-weight: 600 !important;
          padding: 6px 14px !important;
          border-radius: 8px !important;
          border: 1px solid var(--grey-border) !important;
          background: white !important;
          color: var(--black) !important;
          transition: all 0.15s !important;
        }
        .rbc-toolbar button:hover {
          background: var(--orange-pale) !important;
          border-color: var(--orange) !important;
          color: var(--orange-dark) !important;
        }
        .rbc-toolbar button.rbc-active {
          background: var(--orange) !important;
          border-color: var(--orange) !important;
          color: white !important;
        }
        .rbc-toolbar .rbc-toolbar-label {
          font-weight: 800 !important;
          font-size: 1rem !important;
          text-transform: capitalize !important;
        }

        /* ══════════════════════════════════════════════════════════ */
        /* SLOTS DE HORA                                              */
        /* ══════════════════════════════════════════════════════════ */
        .rbc-time-content > * + * > * {
          min-height: 70px !important;
        }
        .rbc-time-slot {
          min-height: 35px !important;
        }

        /* ══════════════════════════════════════════════════════════ */
        /* EVENTOS CON OVERLAP: apilados con borde visible            */
        /* ══════════════════════════════════════════════════════════ */
                .rbc-day-slot .rbc-event,
        .rbc-day-slot .rbc-background-event,
        .rbc-time-view .rbc-event {
          border: 2px solid #FFFFFF !important;
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.3),
            inset 0 0 0 1px rgba(0, 0, 0, 0.2) !important;
          border-radius: 6px !important;
          padding: 3px 8px !important;
          transition: all 0.15s !important;
          margin-right: 2px !important;   /* 👈 NUEVO: separación horizontal */
          margin-left: 2px !important;    /* 👈 NUEVO: separación horizontal */
        }

        /* Hover: traer al frente y agrandar ligeramente */
        .rbc-day-slot .rbc-event:hover,
        .rbc-time-view .rbc-event:hover {
          z-index: 999 !important;
          box-shadow:
            0 6px 18px rgba(0, 0, 0, 0.45),
            inset 0 0 0 2px rgba(255, 255, 255, 0.6) !important;
          transform: scale(1.02) !important;
        }

        /* Texto de la cita */
        .rbc-day-slot .rbc-event-content,
        .rbc-time-view .rbc-event-content {
          font-size: 0.76rem !important;
          line-height: 1.15 !important;
          font-weight: 700 !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45) !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .rbc-event-label {
          font-size: 0.68rem !important;
          font-weight: 700 !important;
          opacity: 0.95 !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4) !important;
        }

        /* ══════════════════════════════════════════════════════════ */
        /* CABECERAS Y OTROS                                          */
        /* ══════════════════════════════════════════════════════════ */
        .rbc-header {
          padding: 8px 4px !important;
          font-weight: 700 !important;
          font-size: 0.82rem !important;
          background: #FAFAFA !important;
          border-bottom: 2px solid var(--grey-border) !important;
        }
        .rbc-today {
          background: rgba(242, 100, 25, 0.06) !important;
        }
        .rbc-time-gutter .rbc-timeslot-group {
          font-size: 0.78rem !important;
          font-weight: 700 !important;
          color: var(--grey-mid) !important;
        }

        /* Vista Mes */
        .rbc-month-row {
          min-height: 110px !important;
        }
        .rbc-date-cell {
          padding: 4px 6px !important;
          font-weight: 700 !important;
        }
        .rbc-month-view .rbc-event {
          border: 2px solid #FFFFFF !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22) !important;
          border-radius: 4px !important;
          font-size: 0.72rem !important;
          margin-bottom: 2px !important;
          padding: 1px 4px !important;
        }
        .rbc-show-more {
          color: var(--orange) !important;
          font-weight: 700 !important;
          font-size: 0.72rem !important;
        }
      `}</style>
    </div>
  )
}


// ── Modal de cita (crear/editar) ─────────────────────────────

function CitaModal({ modal, alumnos, profesores, onCerrar, onGuardado }) {
  const esEdicion = !!modal.cita
  const cita = modal.cita || {}

  const inicio = modal.slot?.start || new Date()
  const fin = modal.slot?.end || new Date()

  const horaInicioDefault = moment(inicio).minutes() === 0
    ? moment(inicio).startOf('hour')
    : moment(inicio).add(1, 'hour').startOf('hour')

  const [form, setForm] = useState({
    fecha: cita.fecha || moment(inicio).format('YYYY-MM-DD'),
    hora_inicio: cita.hora_inicio || horaInicioDefault.format('HH:mm'),
    hora_fin: cita.hora_fin || horaInicioDefault.clone().add(1, 'hour').format('HH:mm'),
    alumno_id: cita.alumno_id || '',
    alumno_texto: cita.alumno_texto || '',
    profesor_id: cita.profesor_id || (profesores[0]?.id || ''),
    observaciones: cita.observaciones || '',
  })

  const [repetir, setRepetir] = useState(false)
  const [repModo, setRepModo] = useState('veces')
  const [repCadaSemanas, setRepCadaSemanas] = useState(1)
  const [repVeces, setRepVeces] = useState(8)
  const [repHasta, setRepHasta] = useState(moment().add(2, 'months').format('YYYY-MM-DD'))

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
      } else if (repetir) {
        const params = { cada_semanas: Number(repCadaSemanas) }
        if (repModo === 'veces') {
          params.veces = Number(repVeces)
        } else {
          params.hasta_fecha = repHasta
        }
        const res = await citasService.repetir(payload, params)
        const n = Array.isArray(res.data) ? res.data.length : 1
        toast.success(`${n} citas creadas`)
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
              <input type="time" value={form.hora_inicio} step="1800"
                onChange={e => setForm({ ...form, hora_inicio: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Hora fin</label>
              <input type="time" value={form.hora_fin} step="1800"
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

          {!esEdicion && (
            <div style={{
              border: '1px solid var(--grey-border)',
              borderRadius: 10,
              padding: 16,
              background: repetir ? 'var(--orange-pale)' : 'var(--white-off)',
              transition: 'all 0.15s',
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={repetir}
                  onChange={e => setRepetir(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--orange)' }}
                />
                <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                  🔁 Repetir esta cita
                </span>
              </label>

              {repetir && (
                <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>

                  <div>
                    <label style={labelStyle}>Frecuencia</label>
                    <select
                      value={repCadaSemanas}
                      onChange={e => setRepCadaSemanas(Number(e.target.value))}
                      style={inputStyle}
                    >
                      <option value={1}>Cada semana</option>
                      <option value={2}>Cada 2 semanas (quincenal)</option>
                      <option value={3}>Cada 3 semanas</option>
                      <option value={4}>Cada 4 semanas (mensual)</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>¿Cuándo terminar?</label>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="repModo"
                          value="veces"
                          checked={repModo === 'veces'}
                          onChange={() => setRepModo('veces')}
                          style={{ accentColor: 'var(--orange)' }}
                        />
                        Por número de clases
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="repModo"
                          value="hasta"
                          checked={repModo === 'hasta'}
                          onChange={() => setRepModo('hasta')}
                          style={{ accentColor: 'var(--orange)' }}
                        />
                        Hasta una fecha
                      </label>
                    </div>

                    {repModo === 'veces' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="number"
                          min="2"
                          max="104"
                          value={repVeces}
                          onChange={e => setRepVeces(Number(e.target.value))}
                          style={{ ...inputStyle, width: 100 }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--grey-mid)' }}>
                          clases en total (incluida esta)
                        </span>
                      </div>
                    ) : (
                      <input
                        type="date"
                        value={repHasta}
                        onChange={e => setRepHasta(e.target.value)}
                        style={inputStyle}
                      />
                    )}
                  </div>

                  <div style={{
                    fontSize: '0.78rem',
                    color: 'var(--orange-dark)',
                    background: 'white',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--orange)',
                    fontWeight: 600,
                  }}>
                    💡 Se crearán {repModo === 'veces' ? repVeces : 'varias'} citas independientes.
                    Cada una se podrá editar o borrar por separado.
                  </div>

                </div>
              )}
            </div>
          )}

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
            {guardando ? 'Guardando…' : (
              esEdicion ? 'Guardar cambios' :
              repetir ? `Crear ${repModo === 'veces' ? repVeces : 'varias'} citas` :
              'Crear cita'
            )}
          </button>
        </div>

      </div>
    </div>
  )
}