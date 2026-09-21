import React from 'react'

/* ── BUTTON ─────────────────────────────────────── */
export function Button({
  children, variant = 'primary', size = 'md',
  loading = false, disabled = false,
  onClick, style, className = '',
}) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontFamily: 'var(--font-body)', fontWeight: 600,
    border: 'none', borderRadius: '8px', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s', opacity: disabled || loading ? 0.6 : 1,
  }

  const sizes = {
    sm: { padding: '5px 12px', fontSize: '0.78rem' },
    md: { padding: '8px 16px', fontSize: '0.85rem' },
    lg: { padding: '11px 22px', fontSize: '0.95rem' },
  }

  const variants = {
    primary: { background: 'var(--orange)', color: 'white' },
    ghost:   { background: 'transparent', color: 'var(--grey-mid)', border: '1px solid var(--grey-border)' },
    danger:  { background: 'var(--red)', color: 'white' },
    success: { background: 'var(--green)', color: 'white' },
  }

  return (
    <button
      onClick={!disabled && !loading ? onClick : undefined}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      className={className}
    >
      {loading && <Spinner size={14} color="currentColor" />}
      {children}
    </button>
  )
}

/* ── SPINNER ─────────────────────────────────────── */
export function Spinner({ size = 20, color = 'var(--orange)' }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid transparent`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

/* ── CARD ────────────────────────────────────────── */
export function Card({ children, style, accentColor }) {
  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--grey-border)',
      borderRadius: 'var(--radius)',
      borderTop: accentColor ? `3px solid ${accentColor}` : undefined,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ children, style }) {
  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: '1px solid var(--grey-border)',
      display: 'flex', alignItems: 'center', gap: '10px',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardBody({ children, style }) {
  return (
    <div style={{ padding: '16px 20px', ...style }}>
      {children}
    </div>
  )
}

/* ── ESTADO BADGE (semáforo) ─────────────────────── */
const ESTADO_CONFIG = {
  verde:   { bg: 'var(--green-bg)',  color: 'var(--green-text)',  dot: 'var(--green)',  label: 'Al corriente' },
  rojo:    { bg: 'var(--red-bg)',    color: 'var(--red-text)',    dot: 'var(--red)',    label: 'Pago pendiente' },
  amarillo:{ bg: 'var(--yellow-bg)', color: 'var(--yellow-text)', dot: 'var(--yellow)', label: 'Pack agotado' },
  naranja: { bg: 'var(--amber-bg)',  color: 'var(--amber-text)',  dot: 'var(--amber)',  label: 'Horas extra' },
}

export function EstadoBadge({ estado, horas, sesiones, importe, horasExtra }) {
  const cfg = ESTADO_CONFIG[estado] || ESTADO_CONFIG.verde

  let info = ''
  if (estado === 'rojo' && importe)        info = ` · Debe ${importe.toFixed(2)}€`
  else if (estado === 'naranja' && horasExtra) info = ` · +${horasExtra}h`
  else if (horas !== undefined)            info = ` · ${horas}h`
  else if (sesiones !== undefined)         info = ` · ${sesiones} ses.`

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '0.72rem', fontWeight: 600,
      padding: '3px 8px', borderRadius: '20px',
      background: cfg.bg, color: cfg.color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: cfg.dot, flexShrink: 0,
      }} />
      {cfg.label}{info}
    </span>
  )
}

/* ── TIPO CLASE BADGE ────────────────────────────── */
const TIPO_CONFIG = {
  normal: { bg: 'var(--orange-pale)', color: 'var(--orange-dark)' },
  ingles: { bg: '#EFF6FF',            color: '#1D4ED8' },
  sesion: { bg: '#F0FDF4',            color: '#15803D' },
}

export function TipoBadge({ categoria, nombre }) {
  const cfg = TIPO_CONFIG[categoria] || TIPO_CONFIG.normal
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 600,
      padding: '2px 8px', borderRadius: '20px',
      background: cfg.bg, color: cfg.color,
    }}>
      {nombre}
    </span>
  )
}

/* ── AVATAR ──────────────────────────────────────── */
const AVATAR_COLORS = [
  'var(--orange)', 'var(--orange-dark)', 'var(--orange-light)',
  '#7C3AED', '#0284C7', '#059669',
]

export function Avatar({ nombre, apellidos, size = 32 }) {
  const initials = `${nombre?.[0] || ''}${apellidos?.[0] || ''}`.toUpperCase()
  const colorIdx = (nombre?.charCodeAt(0) || 0) % AVATAR_COLORS.length
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[colorIdx],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: 'white',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

/* ── PROGRESS BAR ────────────────────────────────── */
export function ProgressBar({ value, max, estado }) {
  const pct = max ? Math.min((value / max) * 100, 100) : 0
  const colors = {
    verde:    'var(--green)',
    rojo:     'var(--red)',
    amarillo: 'var(--yellow)',
    naranja:  'var(--amber)',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 80, height: 6,
        background: 'var(--grey-border)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: colors[estado] || 'var(--green)',
          borderRadius: 3, transition: 'width 0.3s',
        }} />
      </div>
      <span style={{
        fontFamily: 'DM Mono, monospace',
        fontSize: '0.72rem', color: 'var(--grey-mid)',
        whiteSpace: 'nowrap',
      }}>
        {value}/{max}
      </span>
    </div>
  )
}

/* ── EMPTY STATE ─────────────────────────────────── */
export function EmptyState({ icon = '📭', title, description }) {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: '2.5rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--black)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', maxWidth: 300 }}>
          {description}
        </div>
      )}
    </div>
  )
}

/* ── INPUT ───────────────────────────────────────── */
export function Input({ label, error, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--grey-mid)' }}>
          {label}
        </label>
      )}
      <input
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.88rem',
          padding: '8px 12px',
          border: `1px solid ${error ? 'var(--red)' : 'var(--grey-border)'}`,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--white)',
          color: 'var(--black)',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--orange)'}
        onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--grey-border)'}
        {...props}
      />
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</span>
      )}
    </div>
  )
}

/* ── SELECT ──────────────────────────────────────── */
export function Select({ label, error, children, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--grey-mid)' }}>
          {label}
        </label>
      )}
      <select
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.88rem',
          padding: '8px 12px',
          border: `1px solid ${error ? 'var(--red)' : 'var(--grey-border)'}`,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--white)',
          color: 'var(--black)',
          outline: 'none',
          cursor: 'pointer',
        }}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</span>
      )}
    </div>
  )
}
