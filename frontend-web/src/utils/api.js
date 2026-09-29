import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      window.location.href = '/login'
      return Promise.reject(error)
    }
    if (error.response?.status === 403) {
      toast.error('No tienes permisos para realizar esta acción')
      return Promise.reject(error)
    }
    if (error.response?.status >= 500) {
      toast.error('Error del servidor. Inténtalo de nuevo.')
    }
    return Promise.reject(error)
  }
)

// ── Servicios de la API ──────────────────────────────

export const authService = {
  login: (pin, email) => api.post('/auth/login', { pin, email }),
  me: () => api.get('/auth/me'),
}

export const alumnosService = {
  listar:             (params) => api.get('/alumnos', { params }),
  obtener:            (id) => api.get(`/alumnos/${id}`),
  crear:              (data) => api.post('/alumnos', data),
  actualizar:         (id, data) => api.put(`/alumnos/${id}`, data),
  darBaja:            (id) => api.delete(`/alumnos/${id}`),
  obtenerHermanos:    (id) => api.get(`/alumnos/${id}/hermanos`),
  vincularHermano:    (id, hId) => api.post(`/alumnos/${id}/hermanos/${hId}`),
  desvincularHermano:(id, hId) => api.delete(`/alumnos/${id}/hermanos/${hId}`),
  historico:          (id, meses = 6) => api.get(`/alumnos/${id}/historico`, { params: { meses } }),
  // Import
  importarPreview:   (file) => {
    const form = new FormData(); form.append('file', file)
    return api.post('/alumnos/importar?dry_run=true', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  importarConfirmar: (file) => {
    const form = new FormData(); form.append('file', file)
    return api.post('/alumnos/importar?dry_run=false', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  plantillaUrl:      () => `${API_URL}/alumnos/plantilla`,
}

export const profesoresService = {
  listar:     (params) => api.get('/profesores', { params }),
  crear:      (data) => api.post('/profesores', data),
  actualizar: (id, data) => api.put(`/profesores/${id}`, data),
  darBaja:    (id) => api.delete(`/profesores/${id}`),
  // Import
  importarPreview:   (file) => {
    const form = new FormData(); form.append('file', file)
    return api.post('/profesores/importar?dry_run=true', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  importarConfirmar: (file) => {
    const form = new FormData(); form.append('file', file)
    return api.post('/profesores/importar?dry_run=false', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  plantillaUrl:      () => `${API_URL}/profesores/plantilla`,
}

export const tarifasService = {
  listar:     (params) => api.get('/tarifas', { params }),
  crear:      (data)   => api.post('/tarifas', data),
  actualizar: (id, data) => api.put(`/tarifas/${id}`, data),
  toggle:     (id)     => api.post(`/tarifas/${id}/toggle`),
  tiposClase: ()       => api.get('/tarifas/tipos-clase'),
}

export const asistenciasService = {
  listar:    (params) => api.get('/asistencias', { params }),
  registrar: (data) => api.post('/asistencias', data),
  actualizar:(id, data) => api.put(`/asistencias/${id}`, data),
  sync:      (batch) => api.post('/asistencias/sync', { asistencias: batch }),
  eliminar:  (id) => api.delete(`/asistencias/${id}`),
}

export const cobrosService = {
  listar:          (params) => api.get('/cobros', { params }),
  listarFacturas:  (params) => api.get('/cobros/facturas', { params }),
  obtener:         (id) => api.get(`/cobros/${id}`),
  crear:           (data) => api.post('/cobros', data),
  anular:          (id) => api.post(`/cobros/${id}/anular`),
  generarFactura:  (id, data) => api.post(`/cobros/${id}/factura`, data),
  ticketTextoUrl:  (id) => `${API_URL}/cobros/${id}/ticket-texto`,
  facturaPdfUrl:   (id) => `${API_URL}/cobros/${id}/factura-pdf`,
  imprimir: (id, copias = 2) => api.post(`/cobros/${id}/imprimir`, null, { params: { copias } }),
}

export const dashboardService = {
  stats:           () => api.get('/dashboard/stats'),
  ahora:           () => api.get('/dashboard/ahora'),
  mes:             (anio, mes) => api.get('/dashboard/mes', { params: { anio, mes } }),
  alertasSemaforo: () => api.get('/dashboard/alertas-semaforo'),
  deudasAcumuladas: () => api.get('/dashboard/deudas-acumuladas'),
}

export const informesService = {
  mensual:    (anio, mes) => api.get('/informes/mensual', { params: { anio, mes } }),
  evolucion:  (anio) => api.get('/informes/evolucion', { params: { anio } }),
  descargarPDF: async (anio, mes) => {
    const res = await api.get('/informes/mensual/pdf', {
      params: { anio, mes },
      responseType: 'blob',
    })
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `informe-${anio}-${String(mes).padStart(2,'0')}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}

export const packsService = {
  listar:     (alumnoId, soloActivos = false) =>
    api.get('/packs', { params: { alumno_id: alumnoId, solo_activos: soloActivos } }),
  crear:      (data) => api.post('/packs', data),
  actualizar: (id, params) => api.put(`/packs/${id}`, null, { params }),
  desactivar: (id) => api.delete(`/packs/${id}`),
}

export const configService = {
  obtener:    () => api.get('/config'),
  actualizar: (data) => api.put('/config', data),
  subirLogo:  (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/config/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  descargarBackupUrl: () => `${API_URL}/config/backup/descargar`,
  restaurarBackup: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/config/backup/restaurar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}