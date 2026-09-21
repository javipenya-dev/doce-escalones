import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { AlumnosPage } from './pages/AlumnosPage'
import { AlumnoForm } from './components/alumnos/AlumnoForm'
import { AlumnoFichaPage } from './pages/AlumnoFichaPage'
import { CobroWizard } from './components/cobros/CobroWizard'
import { CobroHistorialPage } from './pages/CobroHistorialPage'
import { CobroDetallePage } from './pages/CobroDetallePage'
import { ProfesoresPage } from './pages/ProfesoresPage'
import { TarifasPage } from './pages/TarifasPage'
import { InformesPage } from './pages/InformesPage'
import { AsistenciasPage } from './pages/AsistenciasPage'
import { FacturasPage } from './pages/FacturasPage'
import { ConfiguracionPage } from './pages/ConfiguracionPage'
import ImportarPage from './pages/ImportarPage'
import { DirectoPage } from './pages/DirectoPage' // 👈 Importación del panel en directo integrada
import './styles/globals.css'

function Proximamente({ nombre }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>🚧</div>
      <h2 style={{ fontWeight: 700, marginBottom: 8 }}>{nombre}</h2>
      <p style={{ color: 'var(--grey-mid)' }}>Esta sección está en desarrollo</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            borderRadius: '8px',
          },
          success: { iconTheme: { primary: 'var(--orange)', secondary: 'white' } },
        }}
      />
      <Routes>
        {/* Pública */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protegidas */}
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<DashboardPage />} />
          <Route path="/directo"    element={<DirectoPage />} /> {/* 👈 Panel dinámico WebSocket conectado */}

          {/* Alumnos */}
          <Route path="/alumnos"              element={<AlumnosPage />} />
          <Route path="/alumnos/nuevo"        element={<AlumnoForm modo="crear" />} />
          <Route path="/alumnos/:id"          element={<AlumnoFichaPage />} />
          <Route path="/alumnos/:id/editar"   element={<AlumnoForm modo="editar" />} />

          {/* Cobros */}
          <Route path="/cobros"                    element={<CobroHistorialPage />} />
          {/* 👈 APARTADO B CORREGIDO: Redirección limpia al buscador para preseleccionar alumno */}
          <Route path="/cobros/nuevo"              element={<Navigate to="/alumnos?action=seleccionar_para_cobro" replace />} />
          <Route path="/cobros/nuevo/:alumnoId"    element={<CobroWizard />} />
          <Route path="/cobros/:id"                element={<CobroDetallePage />} />

          {/* Resto */}
          <Route path="/profesores"    element={<ProfesoresPage />} />
          <Route path="/tarifas"       element={<TarifasPage />} />
          <Route path="/asistencias"   element={<AsistenciasPage />} />
          <Route path="/facturas"      element={<FacturasPage />} />
          <Route path="/informes"      element={<InformesPage />} />
          <Route path="/importar"      element={<ImportarPage />} />
          <Route path="/configuracion" element={<ConfiguracionPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
