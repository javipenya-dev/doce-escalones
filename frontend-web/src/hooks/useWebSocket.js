import { useEffect, useRef, useState, useCallback } from 'react'
 
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
 
export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const [conectado, setConectado] = useState(false)
  const reconnectTimer = useRef(null)
 
  const conectar = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return
 
    // Enviar el token JWT como query param (única forma en WebSocket nativo)
    const token = localStorage.getItem('token')
    const url = token
      ? `${WS_URL}/ws?token=${token}`
      : `${WS_URL}/ws`
 
    ws.current = new WebSocket(url)
 
    ws.current.onopen = () => {
      setConectado(true)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
 
    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        onMessage?.(msg)
      } catch (e) {
        console.error('WS parse error:', e)
      }
    }
 
    ws.current.onclose = () => {
      setConectado(false)
      // Reconectar automáticamente cada 3 segundos
      reconnectTimer.current = setTimeout(conectar, 3000)
    }
 
    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [onMessage])
 
  useEffect(() => {
    conectar()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [conectar])
 
  return { conectado }
}
