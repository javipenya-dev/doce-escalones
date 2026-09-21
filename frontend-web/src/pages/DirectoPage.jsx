// src/pages/DirectoPage.jsx
import React, { useState, useEffect } from 'react';

export function DirectoPage() {
  const [logs, setLogs] = useState([]);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsUrl = API_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConectado(true);
    ws.onclose = () => setConectado(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs((prev) => [
          {
            id: Date.now(),
            hora: new Date().toLocaleTimeString(),
            ...data
          },
          ...prev
        ].slice(0, 50));
      } catch (err) {
        console.error("Error procesando mensaje WebSocket", err);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--black)', margin: 0, textTransform: 'uppercase' }}>
            Panel en Directo
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', marginTop: '4px' }}>
            Monitorización de accesos, asistencias y transacciones en tiempo real
          </p>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: conectado ? 'var(--green-bg)' : 'rgba(239, 68, 68, 0.1)',
          color: conectado ? 'var(--green-text)' : '#ef4444',
          fontSize: '0.75rem',
          fontWeight: 'bold'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: conectado ? 'var(--green-text)' : '#ef4444',
            display: 'inline-block'
          }} />
          {conectado ? 'CONECTADO AL SERVIDOR' : 'DESCONECTADO'}
        </div>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--grey-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: 'var(--black)', color: 'var(--white)', fontWeight: 'bold', fontSize: '0.9rem' }}>
          Feed de Actividad Reciente
        </div>
        <div style={{ minHeight: '300px', maxHeight: '600px', overflowY: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--grey-mid)', fontSize: '0.9rem' }}>
              Esperando eventos del sistema... Registra una asistencia o cobro para ver la actividad.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--white-off)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--grey-light)' }}>
                    {log.hora}
                  </span>
                  <div>
                    <span style={{
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      marginRight: '12px',
                      background: log.tipo === 'cobro_realizado' ? 'var(--orange-pale)' : 'var(--white-off)',
                      color: log.tipo === 'cobro_realizado' ? 'var(--orange)' : 'var(--black)'
                    }}>
                      {log.tipo?.replace('_', ' ')}
                    </span>
                    <strong style={{ color: 'var(--black)' }}>{log.alumno_nombre || 'Alumno'}</strong>
                    {log.total && (
                      <span style={{ marginLeft: '8px', color: 'var(--grey-mid)' }}>
                        por un total de {log.total}€
                      </span>
                    )}
                  </div>
                </div>
                {log.estado_nuevo && (
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: log.estado_nuevo === 'verde' ? 'var(--green-bg)' : 'rgba(239, 68, 68, 0.1)',
                    color: log.estado_nuevo === 'verde' ? 'var(--green-text)' : '#ef4444'
                  }}>
                    Semáforo: {log.estado_nuevo}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}