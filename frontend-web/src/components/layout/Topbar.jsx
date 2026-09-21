import React from 'react'
import { Button } from '../ui'

export function Topbar({ titulo, subtitulo, accion, wsConectado }) {
  const hoy = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div style={{
      background: 'var(--white)',
      borderBottom: '1px solid var(--grey-border)',
      padding: '0 32px',
      height: 'var(--topbar-h)',
      display: 'flex', alignItems: 'center', gap: 16,
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--black)' }}>
          {titulo}
        </div>
        {subtitulo && (
          <div style={{ fontSize: '0.75rem', color: 'var(--grey-mid)', marginTop: 1 }}>
            {subtitulo || hoy}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Indicador WebSocket */}
      {wsConectado !== undefined && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.75rem', fontWeight: 500,
          color: wsConectado ? 'var(--green)' : 'var(--grey-light)',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: wsConectado ? 'var(--green)' : 'var(--grey-light)',
            animation: wsConectado ? 'pulse 2s infinite' : 'none',
          }} />
          {wsConectado ? 'En directo' : 'Sin conexión'}
        </div>
      )}

      {/* Acción principal opcional */}
      {accion && (
        <Button onClick={accion.onClick} size="md">
          {accion.icon} {accion.label}
        </Button>
      )}
    </div>
  )
}
