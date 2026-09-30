import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL ||
  ((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host)

export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const [conectado, setConectado] = useState(false)
  const reconnectTimer = useRef(null)
  const montadoRef = useRef(true)
  const reintentosRef = useRef(0)
  const onMessageRef = useRef(onMessage)

  // Mantener la última versión del callback sin reconectar
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const conectar = useCallback(() => {
    // No reconectar si el componente ya se desmontó
    if (!montadoRef.current) return

    // Ya hay una conexión abierta o abriéndose
    if (ws.current &&
        (ws.current.readyState === WebSocket.OPEN ||
         ws.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const token = localStorage.getItem('token')
    const url = token ? `${WS_URL}/ws?token=${token}` : `${WS_URL}/ws`

    try {
      ws.current = new WebSocket(url)
    } catch (e) {
      console.error('[ws] Error creando WebSocket:', e)
      return
    }

    ws.current.onopen = () => {
      if (!montadoRef.current) return
      setConectado(true)
      reintentosRef.current = 0
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        onMessageRef.current?.(msg)
      } catch (e) {
        console.error('[ws] parse error:', e)
      }
    }

    ws.current.onclose = () => {
      if (!montadoRef.current) return
      setConectado(false)
      ws.current = null

      // Backoff exponencial: 1s, 2s, 4s, 8s... máx 30s
      const delay = Math.min(1000 * Math.pow(2, reintentosRef.current), 30000)
      reintentosRef.current += 1

      reconnectTimer.current = setTimeout(conectar, delay)
    }

    ws.current.onerror = () => {
      // Silencioso: onclose se encargará de la reconexión
    }
  }, [])

    useEffect(() => {
    montadoRef.current = true

    // Pequeño delay: permite que StrictMode en dev monte/desmonte antes de crear el WS.
    // En producción no afecta (solo monta una vez).
    const timerInicial = setTimeout(() => {
      if (montadoRef.current) conectar()
    }, 10)

    return () => {
      clearTimeout(timerInicial)
      montadoRef.current = false
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (ws.current) {
        ws.current.onclose = null
        ws.current.onerror = null
        ws.current.onmessage = null
        ws.current.onopen = null
        try { ws.current.close() } catch (e) {}
        ws.current = null
      }
    }
  }, [conectar])

  return { conectado }
}