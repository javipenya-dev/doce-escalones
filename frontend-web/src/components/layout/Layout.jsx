import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../../store/authStore'

export function Layout() {
  const { token } = useAuthStore()

  if (!token) return <Navigate to="/login" replace />

  return (
    <>
      {/* CSS crítico inline — garantiza que html/body/#root tengan altura 100%
          sin depender del archivo .css (que puede quedar cacheado). */}
      <style>{`
        html, body, #root {
          height: 100% !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `}</style>

      <div style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}>
        <Sidebar />
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background: 'var(--white-off)',
        }}>
          <Outlet />
        </main>
      </div>
    </>
  )
}