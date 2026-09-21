# 06 — App Móvil (Flutter)

## Tecnología
**Flutter** — una sola base de código para Android e iOS.

---

## Pantallas

```
SplashScreen
    │
    ▼
LoginScreen (PIN de 6 dígitos)
    │
    ├── Rol: profesor ──► HomeProfesor
    │       │
    │       ├── MisClasesHoy       — lista de clases del día
    │       ├── RegistrarAsistencia — marcar alumnos presentes
    │       └── HistorialAsistencias — mis registros anteriores
    │
    └── Rol: admin ──► HomeAdmin
            │
            ├── DashboardAdmin     — resumen rápido + semáforo
            ├── ListaAlumnos       — búsqueda y estado de pago
            ├── FichaAlumno        — detalle + histórico
            ├── NuevoCobro         — flujo de cobro + impresión
            └── HistorialCobros    — cobros realizados
```

---

## Flujo principal — Registro de asistencia

```
Profesor abre app
    │
    ▼
Selecciona clase (tipo + alumnos asignados a su pack)
    │
    ▼
Lista de alumnos → marca presentes con tap
    │
    ▼
Confirma ────────────────────────────────────────────┐
    │                                                 │
 WiFi OK                                         Sin WiFi
    │                                                 │
POST /api/asistencias                         Guarda en SQLite local
    │                                                 │
Actualiza UI                              Banner naranja persistente:
    │                                    "⚠️ 2 asistencias por sincronizar"
    ▼                                                 │
Toast verde ✅                          Al recuperar WiFi → sync automático
"Asistencia registrada"                              │
                                              Toast verde ✅
                                        "Asistencias sincronizadas"
```

---

## Sincronización offline

### SQLite local
```sql
-- Tabla local en el móvil
CREATE TABLE asistencias_pendientes (
    uuid_local    TEXT PRIMARY KEY,
    alumno_id     INTEGER,
    pack_id       INTEGER,
    tipo_clase_id INTEGER,
    fecha         TEXT,
    hora_inicio   TEXT,
    duracion_min  INTEGER,
    es_sesion     INTEGER,
    timestamp     TEXT,
    intentos      INTEGER DEFAULT 0
);
```

### SyncService (Flutter)
- Se ejecuta en background cuando se detecta conectividad
- Envía todas las pendientes en un solo batch: `POST /api/asistencias/sync`
- El backend usa `uuid_local` como idempotency key (evita duplicados)
- Si una falla, reintenta en el siguiente ciclo
- Máximo 5 intentos; tras eso notifica al admin

### Indicadores visuales
- **Banner naranja persistente** en la parte superior mientras hay pendientes
- **Badge** en el icono de sincronización con el número de pendientes
- **Toast verde** al completar la sincronización

---

## Flujo de cobro (admin en móvil)

```
Busca alumno
    │
    ▼
Ve packs activos + estado de pago (semáforo)
    │
    ▼
Pulsa "Cobrar"
    │
    ▼
Wizard de cobro:
  Paso 1 — Selecciona qué packs incluir en este cobro
  Paso 2 — Descuentos:
           - Hermano (10%, auto-detectado si aplica)
           - Extra libre: % o importe fijo
  Paso 3 — Forma de pago (puede añadir varias):
           [ Efectivo ] [ Tarjeta ] [ Bizum ] [ Transferencia ]
           Con importe por cada una. Suma total mostrada en tiempo real.
  Paso 4 — Confirmar y ver ticket preview
    │
    ▼
POST /api/cobros
    │
    ├── ¿Imprimir ticket?
    │       └── Conecta por Bluetooth con impresora térmica
    │           Imprime ticket con datos fiscales + desglose descuentos
    │
    └── ¿Generar factura?
            └── Solicita datos fiscales del cliente
                POST /api/cobros/:id/factura
```

---

## Impresora térmica

### Conexión
- **Bluetooth** (preferida para móvil) o WiFi
- Plugin Flutter: `flutter_thermal_printer` o `esc_pos_utils`

### Formato del ticket
```
================================
       12 ESCALONES
    Academia de Clases
  C/ Ejemplo 1, Jerez de la Fra.
  Tel: 956 000 000 | CIF: B12345678
================================
Fecha: 07/06/2026  Hora: 17:32
Cobro nº: 00045
--------------------------------
Alumno: Lucas Fernández
--------------------------------
Apoyo 2h/semana (junio)   75,00€
Inglés 2h/semana (junio)  80,00€
--------------------------------
Subtotal:                155,00€
Dto. hermano (10%):      -15,50€
Dto. adicional (5%):      -6,97€
================================
TOTAL:                   132,53€
--------------------------------
Efectivo:                 80,00€
Bizum:                    52,53€
================================
  ¡Gracias por confiar en
      12 Escalones!
================================
```

---

## Autenticación

- Login por **PIN de 6 dígitos**
- El token JWT se guarda en `flutter_secure_storage`
- Expiración: 8 horas
- Al expirar, redirige al login automáticamente

---

## Colores y diseño

La app móvil usa la misma paleta que el panel web:
- Naranja `#F26419` como color principal
- Fondo blanco y negro para la barra superior
- Fuente: sistema (San Francisco en iOS, Roboto en Android)
- Tarjetas con bordes redondeados, sombras suaves

---

## Configuración de conexión

Al instalar la app por primera vez (o desde ajustes):
- El admin introduce la **IP del PC** de la academia: `192.168.1.50`
- La app guarda esta IP y la usa para todas las peticiones
- Si cambia la IP del PC, se puede actualizar desde ajustes

---

## Dependencias Flutter principales

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0                    # Peticiones HTTP
  sqflite: ^2.3.0                 # SQLite local (offline)
  flutter_secure_storage: ^9.0.0  # Guardar token JWT
  connectivity_plus: ^6.0.0       # Detectar cambios de red
  uuid: ^4.3.3                    # Generar uuid_local
  flutter_thermal_printer: ^0.2.0 # Impresora térmica
  provider: ^6.1.2                # Gestión de estado
  go_router: ^13.0.0              # Navegación
```
