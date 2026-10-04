import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../../store/authStore'

export function Layout() {
  const { token } = useAuthStore()

  if (!token) return <Navigate to="/login" replace />

  return (
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
  )
}