# 05 — Frontend Web (Panel Admin)

## Tecnología
**React + Vite**, servido en el puerto 3000.

Accesible desde el navegador del PC de la academia o desde cualquier dispositivo en la misma red WiFi.

---

## Paleta de colores

| Variable | Color | Uso |
|----------|-------|-----|
| `--orange` | #F26419 | Acción principal, botones, highlights |
| `--orange-light` | #F7894A | Hover, gradientes suaves |
| `--orange-dark` | #C4440A | Hover oscuro, énfasis |
| `--orange-pale` | #FFF0E8 | Fondos de badges, filas hover |
| `--black` | #111111 | Sidebar, textos principales |
| `--black-card` | #242424 | Tarjetas en sidebar |
| `--white` | #FFFFFF | Fondo de paneles |
| `--white-off` | #F9F9F9 | Fondo general |
| `--green` | #22C55E | Estado 🟢 al corriente |
| `--red` | #EF4444 | Estado 🔴 pago pendiente |
| `--yellow` | #EAB308 | Estado 🟡 pack agotado |
| `--amber` | #F97316 | Estado 🟠 mes de 5 semanas |

---

## Tipografía

- **Outfit** — textos, títulos, navegación (Google Fonts)
- **DM Mono** — números, horas, importes, código

---

## Estructura de páginas

```
/                    → Redirige a /dashboard
/login               → Login con PIN
/dashboard           → Panel principal (stats + en directo + resumen mes)
/directo             → Vista expandida "clases ahora mismo"
/alumnos             → Listado de alumnos con filtros
/alumnos/nuevo       → Formulario alta de alumno
/alumnos/:id         → Ficha completa del alumno
/alumnos/:id/editar  → Editar datos del alumno
/profesores          → Listado de profesores
/profesores/nuevo    → Alta de profesor
/profesores/:id      → Ficha de profesor + horas mensuales
/tarifas             → Gestión de tarifas y packs
/asistencias         → Historial de asistencias con filtros
/cobros              → Listado de cobros
/cobros/nuevo/:id    → Nuevo cobro para un alumno
/cobros/:id          → Detalle de cobro + ticket
/facturas            → Listado de facturas
/informes            → Informes mensuales + exportación
/importar            → Importación desde Excel
/configuracion       → Datos fiscales de la academia
```

---

## Componentes principales

### Layout
- `Sidebar` — navegación lateral fija, negro con naranja activo
- `Topbar` — título de página, fecha, indicador WebSocket, botón acción
- `Layout` — envuelve todas las páginas autenticadas

### Dashboard
- `StatsRow` — 4 tarjetas de métricas (alumnos, pendientes, asistencias, recaudación)
- `PanelDirecto` — clases en curso con WebSocket
- `PanelMensual` — resumen del mes con semáforo
- `TablaAlumnos` — tabla completa con filtros

### Alumnos
- `AlumnoForm` — formulario de alta/edición
- `AlumnoFicha` — ficha completa con packs, histórico, hermanos
- `ImportarExcel` — drag & drop de .xlsx con previsualización
- `HermanoSelector` — buscador para vincular hermanos

### Cobros
- `CobroWizard` — flujo paso a paso:
  1. Seleccionar packs a cobrar
  2. Aplicar descuentos (hermano auto-detectado + extra libre)
  3. Seleccionar forma(s) de pago (mixto)
  4. Confirmar e imprimir ticket
- `TicketPreview` — previsualización del ticket antes de imprimir
- `FacturaForm` — datos fiscales para generar factura

### Semáforo
- `EstadoBadge` — componente reutilizable para el estado de pago:
  ```jsx
  <EstadoBadge estado="verde" horas={8} />
  <EstadoBadge estado="rojo" importe={45} horas={6} />
  <EstadoBadge estado="amarillo" />
  <EstadoBadge estado="naranja" horasExtra={1} />
  ```

---

## WebSocket — conexión en tiempo real

El dashboard mantiene una conexión WebSocket permanente con el backend. Al recibir eventos, actualiza el estado de React sin necesidad de recargar la página.

```javascript
// hooks/useWebSocket.js
const useWebSocket = () => {
  const [clases, setClases] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${PC_IP}:8000/ws/dashboard`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.tipo === 'asistencia_nueva') actualizarAlumno(msg);
      if (msg.tipo === 'cobro_realizado')  actualizarEstado(msg);
      if (msg.tipo === 'clase_iniciada')   añadirClase(msg);
    };

    return () => ws.close();
  }, []);
};
```

---

## Importación desde Excel

Flujo completo:

1. Admin sube el `.xlsx` (drag & drop o selector)
2. Frontend envía el fichero al backend: `POST /api/alumnos/importar-excel`
3. Backend responde con previsualización:
   ```json
   {
     "total": 47,
     "correctos": 44,
     "advertencias": [
       { "fila": 12, "campo": "email", "mensaje": "Formato de email inválido" },
       { "fila": 23, "campo": "telefono1", "mensaje": "Campo vacío" }
     ]
   }
   ```
4. Admin revisa y confirma
5. Se importan los alumnos correctos; los problemáticos se pueden corregir manualmente

**Columnas esperadas en el Excel:**

| Columna | Requerida | Notas |
|---------|-----------|-------|
| Nombre | ✅ | |
| Apellidos | ✅ | |
| Fecha nacimiento | ❌ | Formato DD/MM/AAAA |
| Fecha inscripción | ❌ | |
| Teléfono 1 | ❌ | |
| Teléfono 2 | ❌ | |
| Dirección | ❌ | |
| Email | ❌ | |

---

## Variables de entorno (frontend)

```env
VITE_API_URL=http://192.168.1.50:8000
VITE_WS_URL=ws://192.168.1.50:8000
```
