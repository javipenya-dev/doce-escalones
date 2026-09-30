import React, { useEffect, useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { backupService } from '../utils/api'

const cardStyle = {
  background: 'var(--white)',
  border: '1px solid var(--grey-border)',
  borderRadius: 'var(--radius)',
  padding: '20px',
  marginBottom: 16,
}

function StatMini({ icon, label, value, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: '1.4rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{value}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--grey-mid)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--grey-light)' }}>{sub}</div>}
      </div>
    </div>
  )
}

export function BackupPanel() {
  const [estado, setEstado] = useState(null)
  const [backups, setBackups] = useState([])
  const [log, setLog] = useState([])
  const [discos, setDiscos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [verLog, setVerLog] = useState(false)
  const fileRef = useRef(null)

  const cargar = async () => {
    setCargando(true)
    try {
      const [{ data: e }, { data: l }, { data: d }] = await Promise.all([
        backupService.estado(),
        backupService.listar(),
        backupService.diskEstado(),
      ])
      setEstado(e)
      setBackups(l)
      setDiscos(d.discos || [])
    } catch {
      toast.error('No se pudo cargar el estado de los backups')
    } finally {
      setCargando(false)
    }
  }

  const cargarLog = async () => {
    try {
      const { data } = await backupService.log(100)
      setLog(data.lineas || [])
    } catch { /* silencioso */ }
  }

  useEffect(() => { cargar() }, [])
  useEffect(() => { if (verLog) cargarLog() }, [verLog])

  const crearAhora = async () => {
    setCreando(true)
    try {
      await backupService.crearAhora()
      toast.success('Backup creado y descargado')
      cargar()
    } catch {
      toast.error('Error al crear el backup')
    } finally {
      setCreando(false)
    }
  }

  const borrarBackup = async (nombre) => {
    if (!confirm(`¿Borrar el backup "${nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      await backupService.borrar(nombre)
      toast.success('Backup borrado')
      cargar()
    } catch {
      toast.error('Error al borrar')
    }
  }

  const restaurar = async (file) => {
    if (!file) return
    const confirm1 = confirm(
      '⚠️ ¿RESTAURAR la base de datos?\n\n' +
      'Esto SOBREESCRIBIRÁ los datos actuales con los del archivo.\n\n' +
      '¿Quieres continuar?'
    )
    if (!confirm1) return

    const texto = prompt('Escribe exactamente "RESTAURAR" para confirmar:')
    if (texto !== 'RESTAURAR') {
      toast.error('Cancelado')
      return
    }

    setRestaurando(true)
    try {
      await backupService.restaurar(file)
      toast.success('Base de datos restaurada. Reinicia el backend.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al restaurar')
    } finally {
      setRestaurando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
          💾 Copias de seguridad
        </h2>
        <button
          onClick={cargar}
          disabled={cargando}
          style={{
            background: 'none', border: '1px solid var(--grey-border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            padding: '5px 12px', fontSize: '0.78rem', fontFamily: 'var(--font-body)',
            color: 'var(--grey-mid)',
          }}
        >
          {cargando ? '...' : '🔄 Actualizar'}
        </button>
      </div>

      {estado && (
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            <StatMini
              icon="📦"
              label="Backups totales"
              value={estado.total_backups}
              sub={`${estado.auto_count} auto · ${estado.manual_count} manual`}
            />
            <StatMini
              icon="💾"
              label="Espacio"
              value={`${estado.espacio_mb} MB`}
            />
            <StatMini
              icon="⏱️"
              label="Próximo auto"
              value={estado.proxima_ejecucion_str}
              sub="Diario a las 03:00"
            />
            <StatMini
              icon="🗓️"
              label="Retención"
              value={`${estado.retencion_dias} días`}
              sub="Backups automáticos"
            />
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={crearAhora}
          disabled={creando}
          style={{
            padding: '11px 20px', background: 'var(--orange)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: creando ? 'wait' : 'pointer',
            fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-body)',
            opacity: creando ? 0.6 : 1,
          }}
        >
          {creando ? '⏳ Generando...' : '💾 Crear backup ahora'}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".sql,.sql.gz"
          style={{ display: 'none' }}
          onChange={e => restaurar(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={restaurando}
          style={{
            padding: '11px 20px', background: 'white', color: '#DC2626',
            border: '1px solid #DC2626', borderRadius: 'var(--radius-sm)',
            cursor: restaurando ? 'wait' : 'pointer',
            fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-body)',
            opacity: restaurando ? 0.6 : 1,
          }}
        >
          {restaurando ? '⏳ Restaurando...' : '⚠️ Restaurar desde archivo'}
        </button>

        <button
          onClick={() => setVerLog(v => !v)}
          style={{
            marginLeft: 'auto', padding: '8px 14px',
            background: 'none', border: '1px solid var(--grey-border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontSize: '0.78rem', fontFamily: 'var(--font-body)',
            color: 'var(--grey-mid)',
          }}
        >
          {verLog ? '▼ Ocultar log' : '▶ Ver log'}
        </button>
      </div>

      {verLog && (
        <div style={{ ...cardStyle, maxHeight: 260, overflowY: 'auto', fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}>
          {log.length === 0 ? (
            <div style={{ color: 'var(--grey-mid)', textAlign: 'center', padding: 16 }}>
              Sin actividad registrada
            </div>
          ) : (
            log.map((l, i) => (
              <div key={i} style={{
                padding: '4px 8px',
                borderBottom: '1px solid var(--white-off)',
                color: l.includes('❌') ? '#DC2626' : (l.includes('✅') ? 'var(--green-text)' : 'var(--grey-mid)'),
              }}>
                {l}
              </div>
            ))
          )}
        </div>
      )}

      {/* Discos */}
      {discos.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--grey-mid)' }}>
              💽 Estado de discos
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {discos.map(d => {
              const cfg = d.estado === 'urgente'
                ? { color: '#DC2626', bg: '#FEE2E2', label: '⚠️ URGENTE' }
                : d.estado === 'aviso'
                  ? { color: '#F59E0B', bg: '#FEF3C7', label: '⚠️ Aviso' }
                  : { color: 'var(--green-text)', bg: 'var(--green-bg)', label: '✅ OK' }
              return (
                <div key={d.nombre} style={{
                  padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--grey-border)', background: 'var(--white)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{d.nombre}</span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: cfg.bg, color: cfg.color,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: 8, background: 'var(--white-off)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${d.porcentaje}%`, background: cfg.color, borderRadius: 4,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--grey-mid)' }}>
                    <span><strong style={{ color: 'var(--black)' }}>{d.porcentaje}%</strong> usado</span>
                    <span>{d.libre_gb} GB libres de {d.total_gb} GB</span>
                  </div>
                </div>
              )
            })}
          </div>
          {discos.some(d => d.estado === 'urgente') && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: '#FEE2E2', border: '1px solid #FCA5A5',
              borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: '#991B1B',
            }}>
              ⚠️ Hay discos con muy poco espacio. Los backups podrían fallar pronto.
            </div>
          )}
        </div>
      )}

      {backups.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12, textTransform: 'uppercase', color: 'var(--grey-mid)' }}>
            Backups disponibles ({backups.length})
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--white)' }}>
                <tr style={{ borderBottom: '1px solid var(--grey-border)' }}>
                  <th style={th}>Tipo</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tamaño</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.nombre} style={{ borderBottom: '1px solid var(--white-off)' }}>
                    <td style={td}>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: b.tipo === 'auto' ? 'var(--orange-pale)' : 'var(--green-bg)',
                        color: b.tipo === 'auto' ? 'var(--orange-dark)' : 'var(--green-text)',
                        textTransform: 'uppercase',
                      }}>
                        {b.tipo}
                      </span>
                    </td>
                    <td style={{ ...td, fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}>{b.nombre}</td>
                    <td style={td}>{b.fecha_str}</td>
                    <td style={td}>{b.tamano_mb} MB</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        onClick={() => backupService.descargar(b.nombre).catch(() => toast.error('Error al descargar'))}
                        title="Descargar"
                        style={btnIcon}
                      >
                        ⬇️
                      </button>
                      <button
                        onClick={() => borrarBackup(b.nombre)}
                        title="Borrar"
                        style={{ ...btnIcon, color: '#DC2626' }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const th = { padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.68rem', color: 'var(--grey-mid)', textTransform: 'uppercase', borderBottom: '1px solid var(--grey-border)' }
const td = { padding: '10px 12px', color: 'var(--grey-mid)' }
const btnIcon = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: '0.9rem' }