import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authService } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import { Spinner } from '../components/ui'
import { LogoCompleto } from '../components/Logo12Escalones'

export function LoginPage() {
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [mostrarEmail, setMostrarEmail] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!pin || pin.length < 4) {
      toast.error('Introduce tu PIN')
      return
    }
    setLoading(true)
    try {
      const { data } = await authService.login(pin, email || undefined)
      login(data.usuario, data.access_token)
      toast.success(`Bienvenido, ${data.usuario.nombre} 👋`)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.detail || 'PIN incorrecto'
      toast.error(msg)
      if (!mostrarEmail) setMostrarEmail(true)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--black)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Fondo decorativo — degradado naranja corporativo */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(231,95,0,0.18) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: 'var(--black-soft)',
        border: '1px solid var(--grey-dark)',
        borderRadius: 'var(--radius)',
        padding: '52px 48px',
        width: '100%', maxWidth: 460,
        position: 'relative', zIndex: 1,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        animation: 'fadeUp 0.4s ease both',
      }}>

        {/* Logo corporativo real */}
        <div style={{ marginBottom: 36 }}>
          <LogoCompleto size={52} dark={true} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '1.8rem',
            color: 'var(--white)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.02em',
          }}>
            Iniciar sesión
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--grey-mid)' }}>
            Introduce tu PIN para acceder
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* PIN */}
          <div>
            <label style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem', fontWeight: 600,
              color: 'var(--grey-light)', display: 'block', marginBottom: 6,
            }}>
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: '1.6rem',
                letterSpacing: '0.4em',
                textAlign: 'center',
                padding: '16px 16px',
                background: 'var(--black-card)',
                border: '1px solid var(--grey-dark)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--white)',
                outline: 'none',
                caretColor: 'var(--orange)',
                transition: 'border-color var(--transition)',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--orange)'}
              onBlur={e => e.target.style.borderColor = 'var(--grey-dark)'}
              autoFocus
            />
          </div>

          {/* Email opcional */}
          {mostrarEmail && (
            <div style={{ animation: 'fadeUp 0.2s ease both' }}>
              <label style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem', fontWeight: 600,
                color: 'var(--grey-light)', display: 'block', marginBottom: 6,
              }}>
                Email (si varios usuarios comparten PIN)
              </label>
              <input
                type="email"
                placeholder="info@12escalones.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.88rem',
                  padding: '11px 12px',
                  background: 'var(--black-card)',
                  border: '1px solid var(--grey-dark)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--white)',
                  outline: 'none',
                  transition: 'border-color var(--transition)',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--orange)'}
                onBlur={e => e.target.style.borderColor = 'var(--grey-dark)'}
              />
            </div>
          )}

          {/* Botón entrar */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '15px',
              background: loading ? 'var(--orange-dark)' : 'var(--orange)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-display)',
              fontSize: '1.15rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background var(--transition)',
              boxShadow: loading ? 'none' : 'var(--shadow-orange)',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--orange-light)' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--orange)' }}
          >
            {loading ? <><Spinner size={16} color="white" /> Accediendo...</> : 'Entrar →'}
          </button>
        </div>
      </div>
    </div>
  )
}
