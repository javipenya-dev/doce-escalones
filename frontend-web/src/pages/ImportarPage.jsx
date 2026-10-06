import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { alumnosService, profesoresService } from '../utils/api'

const TIPOS = [
  { key: 'alumnos',    icon: '👨‍🎓', label: 'Alumnos',    service: alumnosService },
  { key: 'profesores', icon: '👩‍🏫', label: 'Profesores', service: profesoresService },
]

export default function ImportarPage() {
  const [tipo, setTipo] = useState('alumnos')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const cfg = TIPOS.find(t => t.key === tipo)

  const resetEstados = () => {
    setPreview(null)
    setResultado(null)
  }

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.match(/\.(xlsx|xlsm)$/i)) {
      toast.error('Solo se aceptan archivos .xlsx o .xlsm')
      return
    }
    setFile(f)
    resetEstados()
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    handleFile(f)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  const descargarPlantilla = async () => {
    try {
      await cfg.service.descargarPlantilla()
      toast.success('Plantilla descargada')
    } catch (err) {
      // El interceptor de axios ya gestiona el 401 (redirige a login)
      // Aquí solo manejamos otros errores
      const detail = err.response?.data?.detail
      if (detail) toast.error(detail)
      else if (err.response?.status !== 401) toast.error('No se pudo descargar la plantilla')
    }
  }

  const procesarPreview = async () => {
    if (!file) return
    setLoadingPreview(true)
    resetEstados()
    try {
      const { data } = await cfg.service.importarPreview(file)
      setPreview(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al procesar el archivo')
    } finally {
      setLoadingPreview(false)
    }
  }

  const confirmarImport = async () => {
    if (!file) return
    setLoadingImport(true)
    try {
      const { data } = await cfg.service.importarConfirmar(file)
      setResultado(data)
      setPreview(null)
      toast.success(data.mensaje || '¡Importación completada!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al importar')
    } finally {
      setLoadingImport(false)
    }
  }

  const limpiarTodo = () => {
    setFile(null)
    resetEstados()
  }

  const cambioTipo = (k) => {
    setTipo(k)
    limpiarTodo()
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
          📥 Importación masiva desde Excel
        </h1>
        <p style={{ fontSize: '0.88rem', color: 'var(--grey-mid)', marginTop: 4 }}>
          Sube listados de alumnos o profesores. Verás una vista previa antes de confirmar.
        </p>
      </div>

      {/* Selector de tipo */}
      <div style={{ display: 'flex', gap: 8 }}>
        {TIPOS.map(t => (
          <button
            key={t.key}
            onClick={() => cambioTipo(t.key)}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-sm)',
              border: `2px solid ${tipo === t.key ? 'var(--orange)' : 'var(--grey-border)'}`,
              background: tipo === t.key ? 'var(--orange-pale)' : 'var(--white)',
              color: tipo === t.key ? 'var(--orange-dark)' : 'var(--grey-mid)',
              fontWeight: 700, fontSize: '0.88rem', fontFamily: 'var(--font-body)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{t.icon}</span> {t.label}
          </button>
        ))}

        <button
          onClick={descargarPlantilla}
          style={{
            marginLeft: 'auto', padding: '10px 18px',
            background: 'var(--white)', border: '1px solid var(--grey-border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)',
            color: 'var(--grey-mid)',
          }}
        >
          📄 Descargar plantilla {cfg.label}
        </button>
      </div>

      {/* Zona de drop */}
      <div
        onClick={() => document.getElementById('file-input').click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          background: dragOver ? 'var(--orange-pale)' : 'var(--white)',
          border: `2px dashed ${dragOver ? 'var(--orange)' : (file ? 'var(--green)' : 'var(--grey-border)')}`,
          borderRadius: 'var(--radius)',
          padding: '36px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xlsm"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])}
        />
        <div style={{ fontSize: '2.6rem', marginBottom: 8 }}>
          {file ? '✅' : '📥'}
        </div>
        {file ? (
          <>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--green-text)' }}>
              {file.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: 4 }}>
              {(file.size / 1024).toFixed(1)} KB · Pulsa para cambiar de archivo
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              Arrastra el Excel aquí o <span style={{ color: 'var(--orange)' }}>selecciona un archivo</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: 4 }}>
              Formato .xlsx o .xlsm
            </div>
          </>
        )}
      </div>

      {/* Botones de acción */}
      {file && !preview && !resultado && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={limpiarTodo}
            style={{
              padding: '11px 20px', background: 'var(--white)',
              border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font-body)',
              color: 'var(--grey-mid)', fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={procesarPreview}
            disabled={loadingPreview}
            style={{
              padding: '11px 24px', background: 'var(--orange)', color: 'white',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: loadingPreview ? 'wait' : 'pointer',
              fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-body)',
              opacity: loadingPreview ? 0.6 : 1,
            }}
          >
            {loadingPreview ? 'Analizando archivo...' : '🔍 Analizar archivo'}
          </button>
        </div>
      )}

      {preview && (
        <PreviewCard preview={preview} tipo={tipo}
          onCancelar={limpiarTodo}
          onConfirmar={confirmarImport}
          loadingImport={loadingImport} />
      )}

      {resultado && (
        <ResultadoCard resultado={resultado} tipo={tipo} onCerrar={limpiarTodo} />
      )}
    </div>
  )
}

/* ── Tarjeta de preview ──────────────────────────── */
function PreviewCard({ preview, tipo, onCancelar, onConfirmar, loadingImport }) {
  const { num_validas, num_errores, num_duplicados, validas, errores, duplicados, total_filas } = preview

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: 'var(--black)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🔍 Previsualización</span>
        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{total_filas} filas detectadas</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid var(--grey-border)' }}>
        <Contador icon="✅" label="Válidas" value={num_validas} color="var(--green-text)" bg="var(--green-bg)" />
        <Contador icon="⚠️" label="Errores" value={num_errores} color="#DC2626" bg="#FEE2E2" />
        <Contador icon="🔁" label="Duplicadas" value={num_duplicados} color="#92400E" bg="#FEF3C7" />
      </div>

      {validas.length > 0 && (
        <>
          <div style={{ padding: '10px 20px', background: 'var(--white-off)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase' }}>
            Filas listas para importar ({validas.length})
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--white)' }}>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Apellidos</th>
                  <th style={th}>Email / Tel.</th>
                </tr>
              </thead>
              <tbody>
                {validas.map(v => (
                  <tr key={v.fila} style={{ borderTop: '1px solid var(--white-off)' }}>
                    <td style={td}>{v.fila}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{v.nombre}</td>
                    <td style={td}>{v.apellidos}</td>
                    <td style={{ ...td, fontSize: '0.78rem', color: 'var(--grey-mid)' }}>
                      {v.email || v.telefono || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {errores.length > 0 && (
        <>
          <div style={{ padding: '10px 20px', background: '#FEF2F2', fontSize: '0.78rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', borderTop: '1px solid var(--grey-border)' }}>
            Filas con errores ({errores.length})
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {errores.map((e, i) => (
              <div key={i} style={{ padding: '8px 20px', borderTop: '1px solid var(--white-off)', fontSize: '0.82rem', display: 'flex', gap: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--grey-mid)' }}>Fila {e.fila}</span>
                <span style={{ color: '#991B1B' }}>{e.motivo}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {duplicados.length > 0 && (
        <>
          <div style={{ padding: '10px 20px', background: '#FFFBEB', fontSize: '0.78rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', borderTop: '1px solid var(--grey-border)' }}>
            Duplicados (se ignorarán) ({duplicados.length})
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {duplicados.map((d, i) => (
              <div key={i} style={{ padding: '8px 20px', borderTop: '1px solid var(--white-off)', fontSize: '0.82rem', display: 'flex', gap: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--grey-mid)' }}>Fila {d.fila}</span>
                <span style={{ color: '#92400E' }}>{d.nombre} {d.apellidos} — {d.motivo}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ padding: '14px 20px', background: 'var(--white-off)', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--grey-border)' }}>
        <button
          onClick={onCancelar}
          style={{
            padding: '10px 20px', background: 'var(--white)',
            border: '1px solid var(--grey-border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font-body)',
            color: 'var(--grey-mid)', fontWeight: 600,
          }}
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={loadingImport || num_validas === 0}
          style={{
            padding: '10px 24px', background: 'var(--orange)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: (loadingImport || num_validas === 0) ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-body)',
            opacity: (loadingImport || num_validas === 0) ? 0.5 : 1,
          }}
        >
          {loadingImport ? 'Importando...' : `✓ Importar ${num_validas} ${num_validas === 1 ? tipo.replace(/s$/, '') : tipo}`}
        </button>
      </div>
    </div>
  )
}

function Contador({ icon, label, value, color, bg }) {
  return (
    <div style={{ padding: '14px 20px', background: bg, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: '1.3rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: '0.7rem', color, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
    </div>
  )
}

function ResultadoCard({ resultado, tipo, onCerrar }) {
  const { num_creados, num_errores, num_duplicados, mensaje, creados } = resultado

  return (
    <div style={{ background: 'var(--white)', border: '2px solid var(--green)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '20px', background: 'var(--green-bg)', textAlign: 'center' }}>
        <div style={{ fontSize: '2.6rem' }}>🎉</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--green-text)', marginTop: 8 }}>
          {mensaje}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: '1px solid var(--grey-border)' }}>
        <Contador icon="✅" label="Creados" value={num_creados} color="var(--green-text)" bg="var(--white)" />
        <Contador icon="⚠️" label="Con errores" value={num_errores} color="#DC2626" bg="var(--white)" />
        <Contador icon="🔁" label="Duplicados" value={num_duplicados} color="#92400E" bg="var(--white)" />
      </div>

      {tipo === 'profesores' && creados && creados.length > 0 && (
        <>
          <div style={{ padding: '10px 20px', background: 'var(--white-off)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--grey-mid)', textTransform: 'uppercase', borderTop: '1px solid var(--grey-border)' }}>
            PINs temporales asignados — ¡Apúntalos antes de cerrar!
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <tbody>
                {creados.map(c => (
                  <tr key={c.fila} style={{ borderTop: '1px solid var(--white-off)' }}>
                    <td style={{ padding: '8px 20px' }}>{c.nombre} {c.apellidos}</td>
                    <td style={{ padding: '8px 20px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--orange)' }}>
                      {c.pin_temporal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ padding: '14px 20px', background: 'var(--white-off)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--grey-border)' }}>
        <button
          onClick={onCerrar}
          style={{
            padding: '10px 24px', background: 'var(--orange)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-body)',
          }}
        >
          ✓ Hecho
        </button>
      </div>
    </div>
  )
}

const th = { padding: '8px 20px', textAlign: 'left', fontWeight: 700, fontSize: '0.7rem', color: 'var(--grey-mid)', textTransform: 'uppercase', borderBottom: '1px solid var(--grey-border)', background: 'var(--white)' }
const td = { padding: '8px 20px', color: 'var(--grey-mid)' }