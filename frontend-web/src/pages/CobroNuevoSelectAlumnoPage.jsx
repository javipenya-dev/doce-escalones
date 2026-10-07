import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { alumnosService } from "../utils/api";
import { Topbar } from "../components/layout/Topbar";
import { Avatar, Button, EmptyState, Spinner } from "../components/ui";

export function CobroNuevoSelectAlumnoPage() {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cargadoInicial, setCargadoInicial] = useState(false);

  // Carga inicial: alumnos activos más recientes (por si el usuario no escribe nada)
  const cargarInicial = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await alumnosService.listar({ activo: true });
      // Ordenamos por id descendente para mostrar los últimos añadidos primero
      const ordenados = [...data].sort((a, b) => b.id - a.id).slice(0, 30);
      setAlumnos(ordenados);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setCargadoInicial(true);
    }
  }, []);

  useEffect(() => {
    cargarInicial();
  }, [cargarInicial]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!busqueda.trim()) {
      if (cargadoInicial) cargarInicial();
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await alumnosService.listar({ nombre: busqueda });
        setAlumnos(data.slice(0, 40));
      } catch {
        setAlumnos([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, cargadoInicial, cargarInicial]);

  const seleccionar = (alumno) => {
    // Redirige al wizard existente, que espera /cobros/nuevo/:alumnoId
    navigate(`/cobros/nuevo/${alumno.id}`);
  };

  const inicial = (str) => (str || "?").charAt(0).toUpperCase();

  return (
    <>
      <Topbar
        titulo="Nuevo cobro"
        subtitulo="Selecciona el alumno al que vas a cobrar"
      />

      <div style={{ padding: "24px 32px", maxWidth: 900, margin: "0 auto" }}>
        {/* Buscador */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid var(--grey-border)",
            borderRadius: "var(--radius)",
            padding: "20px 24px",
            marginBottom: 20,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "var(--grey-mid)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            🔍 Buscar alumno
          </label>
          <input
            autoFocus
            type="text"
            placeholder="Escribe el nombre, apellidos o teléfono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              width: "100%",
              fontFamily: "var(--font-body)",
              fontSize: "1rem",
              padding: "12px 16px",
              border: "2px solid var(--grey-border)",
              borderRadius: "var(--radius-sm)",
              outline: "none",
              transition: "border-color var(--transition)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--orange)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--grey-border)")}
          />
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--grey-light)",
              marginTop: 6,
            }}
          >
            {busqueda
              ? `${alumnos.length} resultado${alumnos.length === 1 ? "" : "s"}`
              : "Mostrando los últimos 30 alumnos activos"}
          </div>
        </div>

        {/* Lista de alumnos */}
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 48,
            }}
          >
            <Spinner size={32} />
          </div>
        ) : alumnos.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Sin resultados"
            description={
              busqueda
                ? `No se encontró ningún alumno con "${busqueda}"`
                : "No hay alumnos activos registrados"
            }
          />
        ) : (
          <div
            style={{
              background: "var(--white)",
              border: "1px solid var(--grey-border)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
            }}
          >
            {alumnos.map((a, idx) => {
              const packsActivos = (a.packs || []).filter((p) => p.activo);
              return (
                <div
                  key={a.id}
                  onClick={() => seleccionar(a)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 20px",
                    borderBottom:
                      idx < alumnos.length - 1
                        ? "1px solid var(--white-off)"
                        : "none",
                    cursor: "pointer",
                    transition: "background var(--transition)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--orange-pale)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <Avatar
                    nombre={a.nombre}
                    apellidos={a.apellidos}
                    size={38}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        color: "var(--black)",
                      }}
                    >
                      {a.apellidos}, {a.nombre}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--grey-mid)",
                        display: "flex",
                        gap: 10,
                        marginTop: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      {a.telefono && <span>📞 {a.telefono}</span>}
                      {packsActivos.length > 0 ? (
                        <span style={{ color: "var(--orange-dark)", fontWeight: 600 }}>
                          📦 {packsActivos.length} pack{packsActivos.length === 1 ? "" : "s"} activo{packsActivos.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--grey-light)" }}>
                          Sin packs activos
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="primary">
                    Cobrar →
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Botón volver */}
        <div style={{ marginTop: 24 }}>
          <Button variant="ghost" onClick={() => navigate("/cobros")}>
            ← Volver al listado de cobros
          </Button>
        </div>
      </div>
    </>
  );
}