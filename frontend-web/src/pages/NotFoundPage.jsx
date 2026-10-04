import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LogoCompleto } from '../components/Logo12Escalones'

export function NotFoundPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuthStore()

  const irAlDashboard = () => navigate(token ? '/dashboard' : '/login')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--black)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        maxWidth: 520,
        width: '100%',
        textAlign: 'center',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <LogoCompleto size={42} dark={true} />
        </div>

        {/* 404 grande */}
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '8rem',
          fontWeight: 900,
          color: 'var(--orange)',
          lineHeight: 1,
          letterSpacing: '-0.05em',
          marginBottom: 12,
        }}>
          404
        </div>

        {/* Título */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.6rem',
          fontWeight: 800,
          color: '#fff',
          margin: '0 0 12px 0',
          letterSpacing: '0.02em',
        }}>
          ¡Ups! Esta página no existe
        </h1>

        {/* Subtítulo */}
        <p style={{
          fontSize: '0.95rem',
          color: '#aaa',
          lineHeight: 1.6,
          margin: '0 0 32px 0',
        }}>
          Puede que el enlace esté mal escrito o que la página se haya movido.
        </p>

        {/* Ruta que falló (útil para debug) */}
        <div style={{
          background: 'var(--black-soft)',
          border: '1px solid var(--grey-dark)',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 32,
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          color: 'var(--grey-light)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {location.pathname}
        </div>

        {/* Botón principal */}
        <button
          onClick={irAlDashboard}
          style={{
            background: 'var(--orange)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 28px',
            fontSize: '0.95rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            transition: 'background 0.15s',
            width: '100%',
            maxWidth: 280,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--orange-dark)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--orange)'}
        >
          {token ? '← Volver al Dashboard' : '← Ir al inicio de sesión'}
        </button>

      </div>
    </div>
  )
}