export function Isotipo({ size = 36 }) {
  return (
    <img
      src="/logo.png"
      alt="12 Escalones"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

export function LogoCompleto({ size = 36, dark = true }) {
  const textColor = dark ? 'var(--white)' : 'var(--black)'
  const subColor  = dark ? 'var(--grey-mid)' : '#999'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Isotipo size={size} />
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: size * 0.44,
          color: textColor,
          letterSpacing: '0.01em',
          lineHeight: 1.1,
          textTransform: 'uppercase',
        }}>
          12 escalones
        </div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: size * 0.22,
          color: subColor,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginTop: 1,
        }}>
          centro educativo
        </div>
      </div>
    </div>
  )
}