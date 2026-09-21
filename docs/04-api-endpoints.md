# 04 — API Endpoints

## Base URL
```
http://IP_PC:8000/api
```

## Autenticación
Todos los endpoints (excepto `/auth/login`) requieren header:
```
Authorization: Bearer <token_jwt>
```
El token expira a las 8 horas.

---

## Auth

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| POST | `/auth/login` | Todos | Login con email+PIN o solo PIN |
| POST | `/auth/logout` | Todos | Invalidar sesión |
| GET | `/auth/me` | Todos | Datos del usuario actual |

### POST `/auth/login`
```json
// Request
{ "pin": "1234", "email": "maria@academia.com" }

// Response
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "usuario": { "id": 1, "nombre": "María", "rol": "admin" }
}
```

---

## Alumnos

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/alumnos` | Admin | Listar alumnos (con filtros) |
| GET | `/alumnos/{id}` | Admin | Ficha completa de alumno |
| POST | `/alumnos` | Admin | Crear alumno |
| PUT | `/alumnos/{id}` | Admin | Modificar alumno |
| DELETE | `/alumnos/{id}` | Admin | Baja lógica |
| GET | `/alumnos/{id}/resumen` | Admin | Horas y sesiones del mes actual |
| GET | `/alumnos/{id}/historico` | Admin | Histórico de horas, sesiones y pagos |
| GET | `/alumnos/{id}/hermanos` | Admin | Hermanos vinculados |
| POST | `/alumnos/{id}/hermanos` | Admin | Vincular hermano |
| DELETE | `/alumnos/{id}/hermanos/{id2}` | Admin | Desvincular hermano |
| POST | `/alumnos/importar-excel` | Admin | Importación masiva desde .xlsx |

### GET `/alumnos` — Parámetros de filtro
```
?activo=true
?nombre=lucas
?estado_pago=pendiente     (verde/rojo/amarillo/naranja)
?tipo_clase=normal
?profesor_id=3
?mes=6&anio=2026
```

### GET `/alumnos/{id}/ficha` — Respuesta completa
```json
{
  "alumno": { "id": 1, "nombre": "Lucas", ... },
  "packs_activos": [
    {
      "id": 5,
      "tipo": "normal",
      "tarifa": "Apoyo 2h/semana",
      "profesor": "María García",
      "mes_actual": {
        "horas_consumidas": 8.0,
        "horas_contratadas": 8.0,
        "semanas": 4,
        "estado": "verde"
      }
    }
  ],
  "hermanos": [...],
  "ultimo_cobro": { "fecha": "2026-06-02", "total": 75.00 },
  "historico_meses": [...]
}
```

---

## Profesores

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/profesores` | Admin | Listar profesores |
| GET | `/profesores/{id}` | Admin | Ficha de profesor |
| POST | `/profesores` | Admin | Crear profesor |
| PUT | `/profesores/{id}` | Admin | Modificar profesor |
| DELETE | `/profesores/{id}` | Admin | Baja lógica |
| GET | `/profesores/{id}/horas` | Admin | Horas trabajadas (por mes) |

---

## Tarifas

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/tarifas` | Admin | Listar tarifas activas |
| POST | `/tarifas` | Admin | Crear tarifa |
| PUT | `/tarifas/{id}` | Admin | Modificar tarifa |
| DELETE | `/tarifas/{id}` | Admin | Desactivar tarifa |

---

## Packs de alumno

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/alumnos/{id}/packs` | Admin | Packs de un alumno |
| POST | `/alumnos/{id}/packs` | Admin | Asignar pack a alumno |
| PUT | `/packs/{id}` | Admin | Modificar pack |
| DELETE | `/packs/{id}` | Admin | Desactivar pack |

---

## Asistencias

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/asistencias` | Admin | Listar (con filtros) |
| POST | `/asistencias` | Profesor/Admin | Registrar asistencia |
| POST | `/asistencias/sync` | Profesor/Admin | Sync batch offline |
| DELETE | `/asistencias/{id}` | Admin | Eliminar asistencia (corrección) |

### POST `/asistencias` — Registrar asistencia
```json
// Request
{
  "alumno_id": 1,
  "pack_alumno_id": 5,
  "tipo_clase_id": 1,
  "fecha": "2026-06-07",
  "hora_inicio": "16:00",
  "duracion_min": 60,
  "uuid_local": "550e8400-e29b-41d4-a716-446655440000"
}

// Response
{
  "id": 123,
  "sincronizado": true,
  "resumen_actualizado": {
    "horas_consumidas": 8.0,
    "horas_contratadas": 8.0,
    "estado": "verde"
  }
}
```

### POST `/asistencias/sync` — Sync batch offline
```json
// Request — array de asistencias pendientes
{
  "asistencias": [
    { "uuid_local": "abc-123", "alumno_id": 1, ... },
    { "uuid_local": "def-456", "alumno_id": 2, ... }
  ]
}

// Response
{
  "procesadas": 2,
  "duplicadas": 0,  // uuid_local ya existía → ignoradas silenciosamente
  "errores": []
}
```

---

## Dashboard

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/dashboard/ahora` | Admin | Clases en curso en este momento |
| GET | `/dashboard/mes` | Admin | Resumen del mes actual |
| GET | `/dashboard/stats` | Admin | Estadísticas generales (cards superiores) |

### GET `/dashboard/ahora` — Respuesta
```json
{
  "clases_en_curso": [
    {
      "profesor": { "id": 2, "nombre": "María García" },
      "tipo_clase": "Apoyo escolar",
      "hora_inicio": "16:00",
      "alumnos": [
        {
          "id": 1,
          "nombre": "Lucas Fernández",
          "estado": "verde",
          "horas_mes": 8.0,
          "horas_contratadas": 8.0
        },
        {
          "id": 2,
          "nombre": "Ana Gómez",
          "estado": "rojo",
          "horas_mes": 6.0,
          "importe_debido": 45.00
        }
      ]
    }
  ]
}
```

---

## Cobros

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/cobros` | Admin | Listar cobros (con filtros) |
| GET | `/cobros/{id}` | Admin | Detalle de cobro |
| POST | `/cobros` | Admin | Registrar cobro |
| POST | `/cobros/{id}/anular` | Admin | Anular ticket |
| POST | `/cobros/{id}/factura` | Admin | Generar factura PDF |
| GET | `/cobros/{id}/ticket-pdf` | Admin | Descargar ticket en PDF |

### POST `/cobros` — Registrar cobro
```json
// Request
{
  "alumno_id": 1,
  "packs_ids": [5, 6],
  "descuento_hermano": true,
  "descuento_extra_pct": 5.0,
  "descuento_extra_importe": 0.0,
  "formas_pago": [
    { "forma": "efectivo", "importe": 60.00 },
    { "forma": "bizum",    "importe": 42.60 }
  ],
  "notas": "Pago mes de junio"
}

// Response
{
  "id": 45,
  "subtotal": 115.00,
  "descuento_hermano_pct": 10.0,
  "descuento_extra_pct": 5.0,
  "total": 102.60,
  "ticket_url": "/api/cobros/45/ticket-pdf"
}
```

---

## WebSocket

```
ws://IP_PC:8000/ws/dashboard
```

### Eventos que emite el servidor

```json
// Nueva asistencia registrada
{
  "tipo": "asistencia_nueva",
  "alumno_id": 1,
  "alumno_nombre": "Lucas Fernández",
  "profesor_nombre": "María García",
  "tipo_clase": "Apoyo escolar",
  "estado_nuevo": "verde",
  "horas_mes": 8.0
}

// Cobro realizado
{
  "tipo": "cobro_realizado",
  "alumno_id": 2,
  "alumno_nombre": "Ana Gómez",
  "total": 45.00,
  "estado_nuevo": "verde"
}

// Clase iniciada (primera asistencia del día de ese profesor)
{
  "tipo": "clase_iniciada",
  "profesor_id": 2,
  "profesor_nombre": "María García",
  "tipo_clase": "Apoyo escolar",
  "hora": "16:00"
}
```

---

## Configuración

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/config` | Admin | Ver configuración de la academia |
| PUT | `/config` | Admin | Actualizar datos fiscales, logo, etc. |

---

## Tipos de clase

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/tipos-clase` | Todos | Listar tipos activos |
| POST | `/tipos-clase` | Admin | Crear tipo |
| PUT | `/tipos-clase/{id}` | Admin | Modificar |
| DELETE | `/tipos-clase/{id}` | Admin | Desactivar |

---

## Códigos de respuesta

| Código | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Creado correctamente |
| 400 | Error de validación |
| 401 | No autenticado |
| 403 | Sin permisos (rol insuficiente) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ej: uuid_local duplicado) |
| 422 | Datos inválidos (Pydantic) |
| 500 | Error interno del servidor |
