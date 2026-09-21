import React, { useState } from 'react';
// Cambiamos la importación para usar el servicio correcto que unificamos
import { alumnosService } from '../utils/api';

export default function ImportarPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview([{ nombre: "Archivo seleccionado listo", apellidos: selectedFile.name, email: "Haga clic en 'Procesar Plantilla'" }]);
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Por favor, selecciona un archivo Excel (.xlsx) primero");
    
    setLoading(true);
    setSuccess(false);
    try {
      // Conectamos con el servicio exacto: alumnosService.importarExcel
      const res = await alumnosService.importarExcel(file);
      
      // El backend devuelve los alumnos en 'alumnos_detectados'
      setPreview(res.data.alumnos_detectados || []);
      setSuccess(true);
      alert(res.data.mensaje);
    } catch (err) {
      alert("Error al importar: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--black)', trackingTight: '-0.03em', margin: 0, textTransform: 'uppercase' }}>
          MIGRACIÓN MASIVA DE ALUMNOS
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--grey-mid)', marginTop: '4px', marginBotton: 0 }}>
          Sube tus listados cómodamente mediante plantillas de Excel
        </p>
      </div>

      {/* Zona de Arrastre / Selección de Archivo */}
      <div style={{
        background: 'var(--white)',
        border: '2px dashed var(--grey-border)',
        borderRadius: 'var(--radius)',
        padding: '40px 20px',
        textAlign: 'center',
        transition: 'border-color var(--transition)',
        cursor: 'pointer'
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--orange)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--grey-border)'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '2.5rem', color: 'var(--grey-mid)' }}>📥</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--grey-mid)' }}>
            <label style={{ position: 'relative', cursor: 'pointer', background: 'transparent', fontWeight: 700, color: 'var(--orange)' }}>
              <span>Seleccionar un archivo Excel (.xlsx)</span>
              <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
            </label>
          </div>
          {file && (
            <p style={{ 
              fontSize: '0.75rem', 
              fontWeight: 700, 
              color: 'var(--orange)', 
              background: 'var(--orange-pale)', 
              display: 'inline-block', 
              padding: '6px 16px', 
              borderRadius: '20px',
              margin: '8px 0 0 0'
            }}>
              {file.name}
            </p>
          )}
        </div>
      </div>

      {/* Botón de envío */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            padding: '12px 24px',
            background: 'var(--black)',
            color: 'var(--white)',
            fontSize: '0.8rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: (!file || loading) ? 'not-allowed' : 'pointer',
            opacity: (!file || loading) ? 0.4 : 1,
            transition: 'background var(--transition)'
          }}
          onMouseEnter={e => { if(file && !loading) e.currentTarget.style.background = 'var(--orange)' }}
          onMouseLeave={e => { if(file && !loading) e.currentTarget.style.background = 'var(--black)' }}
        >
          {loading ? "Cargando en base de datos local..." : "Procesar Plantilla e Importar"}
        </button>
      </div>

      {/* Tabla de Resultados */}
      {preview.length > 0 && (
        <div style={{ 
          background: 'var(--white)', 
          borderRadius: 'var(--radius)', 
          border: '1px solid var(--grey-border)', 
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ 
            padding: '14px 20px', 
            background: 'var(--black)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: 'var(--white)' }}>
              Resultados del Análisis
            </h3>
            {success && (
              <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'var(--green-bg)', color: 'var(--green-text)', padding: '4px 10px', borderRadius: '4px', textTransform: 'uppercase' }}>
                ¡Completado!
              </span>
            )}
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={{ background: 'var(--white-off)' }}>
              <tr>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--grey-mid)', borderBottom: '1px solid var(--grey-border)', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Nombre</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--grey-mid)', borderBottom: '1px solid var(--grey-border)', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Apellidos</th>
                <th style={{ padding: '12px 20px', fontWeight: 700, color: 'var(--grey-mid)', borderBottom: '1px solid var(--grey-border)', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Contacto</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--white-off)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--white-off)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--black)' }}>{p.nombre}</td>
                  <td style={{ padding: '14px 20px', color: 'var(--grey-mid)' }}>{p.apellidos}</td>
                  <td style={{ padding: '14px 20px', fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: 'var(--grey-light)' }}>{p.email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}