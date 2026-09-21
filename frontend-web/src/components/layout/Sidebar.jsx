import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LogoCompleto } from '../Logo12Escalones'

const NAV_ITEMS = [
  { label: 'Principal', items: [
    { to: '/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/directo',   icon: '⚡', label: 'En directo' },
  ]},
  { label: 'Gestión', items: [
    { to: '/alumnos',     icon: '🎓', label: 'Alumnos' },
    { to: '/profesores',  icon: '👩‍🏫', label: 'Profesores' },
    { to: '/tarifas',     icon: '📦', label: 'Tarifas y packs' },
    { to: '/asistencias', icon: '✅', label: 'Asistencias' },
  ]},
  { label: 'Finanzas', items: [
    { to: '/cobros',   icon: '💳', label: 'Cobros' },
    { to: '/facturas', icon: '🧾', label: 'Facturas' },
    { to: '/informes', icon: '📈', label: 'Informes' },
  ]},
  { label: 'Sistema', items: [
    { to: '/importar',      icon: '📥', label: 'Importar Excel' },
    { to: '/configuracion', icon: '⚙️', label: 'Configuración' },
  ]},
]

export function Sidebar() {
  const { usuario, logout } = useAuthStore()
  const navigate = useNavigate()

  const initials = usuario
    ? `${usuario.nombre?.[0] || ''}${usuario.apellidos?.[0] || ''}`.toUpperCase()
    : 'A'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      background: 'var(--black)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0, top: 0,
      zIndex: 100,
    }}>

      {/* Logo corporativo */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--grey-dark)' }}>
        <LogoCompleto size={36} dark={true} />
      </div>

      {/* Navegación */}
      <nav style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map((section) => (
          <div key={section.label}>
            <div style={{
              fontSize: '0.58rem', fontWeight: 700,
              color: 'var(--grey-mid)', letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '12px 10px 5px',
            }}>
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 2,
                  fontSize: '0.84rem', fontWeight: 500,
                  color: isActive ? 'white' : 'var(--grey-light)',
                  background: isActive ? 'var(--orange)' : 'transparent',
                  transition: 'all var(--transition)',
                  textDecoration: 'none',
                })}
                onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'var(--grey-dark)' }}
                onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 20, textAlign: 'center', fontSize: '0.95rem' }}>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer usuario */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--grey-dark)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 10px',
          background: 'var(--black-card)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--orange)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.72rem', fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {usuario?.nombre} {usuario?.apellidos}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--grey-mid)', textTransform: 'capitalize' }}>
              {usuario?.rol}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--grey-mid)', fontSize: '0.9rem', padding: 4,
              borderRadius: 4, transition: 'color var(--transition)',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--grey-mid)'}
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  )
}

