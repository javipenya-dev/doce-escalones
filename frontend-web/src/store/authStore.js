import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  usuario: JSON.parse(localStorage.getItem('usuario') || 'null'),
  token: localStorage.getItem('token') || null,

  login: (usuario, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    set({ usuario, token })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    set({ usuario: null, token: null })
  },

  isAdmin: () => {
    const u = JSON.parse(localStorage.getItem('usuario') || 'null')
    return u?.rol === 'admin'
  },
}))
