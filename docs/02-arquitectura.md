# 02 — Arquitectura del Sistema

## Visión general

El sistema corre **completamente en local**, dentro de la red WiFi de la academia. No hay ningún servicio en la nube. Todos los datos permanecen en el PC de la academia.

```
┌─────────────────────────────────────────────────────┐
│                  Red WiFi Academia                   │
│                                                     │
│  📱 Móvil profesor 1  ──┐                           │
│  📱 Móvil profesor 2  ──┤                           │
│  📱 Móvil admin       ──┼──► 🖥️  PC Torre Academia  │
│  💻 Navegador admin   ──┘    │                      │
│                              │  Docker Compose       │
│                              ├─ FastAPI (puerto 8000)│
│                              ├─ React   (puerto 3000)│
│                              └─ PostgreSQL (5432)    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Componentes

### 1. PC Torre (servidor local)
- **Sistema operativo:** Windows
- **Software requerido:** Docker Desktop
- **Rol:** Servidor de toda la aplicación
- **Acceso:** Cualquier dispositivo en la misma red WiFi puede conectarse usando la IP del PC

### 2. Backend — FastAPI (Python)
- **Puerto:** 8000
- **URL desde la red local:** `http://192.168.1.XX:8000`
- **Responsabilidades:**
  - API REST para todas las operaciones (alumnos, asistencias, cobros...)
  - WebSocket para actualizaciones en tiempo real del panel
  - Procesamiento de importaciones Excel
  - Generación de tickets y facturas en PDF
  - Lógica de negocio (cálculo de horas, descuentos, semáforos de estado)

### 3. Base de datos — PostgreSQL
- **Puerto:** 5432 (solo accesible desde dentro de Docker)
- **Persistencia:** Volumen Docker en el disco del PC
- **Backups:** Script automático semanal a carpeta local

### 4. Panel web admin — React + Vite
- **Puerto:** 3000
- **URL desde la red local:** `http://192.168.1.XX:3000`
- **Acceso:** Solo admins, desde el PC o cualquier dispositivo en la red
- **Responsabilidades:**
  - Dashboard en tiempo real
  - Gestión de alumnos, profesores y tarifas
  - Registro y consulta de cobros y facturas
  - Informes mensuales
  - Importación de Excel

### 5. App móvil — Flutter
- **Plataformas:** Android e iOS
- **Conexión:** `http://192.168.1.XX:8000` (IP del PC en la WiFi)
- **Responsabilidades:**
  - Login por PIN
  - Registro de asistencias (con modo offline)
  - Vista admin: cobros, estado de alumnos

### 6. Impresora térmica
- **Conexión:** Bluetooth o WiFi
- **Integración:** Plugin Flutter para app móvil, librería Python para panel web
- **Modelos recomendados:** Epson TM-T20III / Star Micronics TSP143

---

## Flujo de datos — Registro de asistencia

```
Profesor en clase
      │
      ▼
App Flutter — ¿Hay WiFi?
      │
   SÍ ──► POST /api/asistencias ──► FastAPI
      │         │
      │         ▼
      │    PostgreSQL: INSERT asistencia
      │         │
      │         ▼
      │    Actualiza resumen_mensual
      │         │
      │         ▼
      │    WebSocket broadcast ──► Panel admin (tiempo real)
      │
   NO ──► SQLite local (móvil)
              │
              ▼
         Toast: "⚠️ 1 asistencia pendiente de enviar"
              │
         (Al recuperar WiFi)
              │
              ▼
         Sync automático ──► mismo flujo que SÍ
              │
              ▼
         Toast: "✅ Asistencias sincronizadas"
```

---

## Flujo de datos — Cobro

```
Admin selecciona alumno
      │
      ▼
Ve packs activos + horas consumidas + estado
      │
      ▼
Introduce descuentos (hermano 10% + extra libre)
      │
      ▼
Selecciona forma(s) de pago
      │
      ▼
POST /api/cobros ──► FastAPI
      │
      ├── INSERT cobro
      ├── INSERT cobros_pagos (una fila por forma de pago)
      ├── INSERT cobros_packs (qué packs cubre)
      └── WebSocket broadcast (actualiza semáforo del alumno)
            │
            ▼
      Imprime ticket térmico
            │
            ▼ (opcional)
      Genera factura PDF (numeración correlativa)
```

---

## Comunicación en tiempo real — WebSocket

```
Panel admin (navegador)
      │
      └── ws://IP_PC:8000/ws/dashboard
                  │
            FastAPI WebSocket
                  │
            ConnectionManager
            (lista de conexiones activas)
                  │
            Recibe broadcast cuando:
            ├── Nueva asistencia registrada
            ├── Cobro realizado
            ├── Estado de alumno cambia
            └── Profesor inicia/termina clase
```

---

## Modo offline — App móvil

```
┌─────────────────────────────────────────┐
│           SQLite local (móvil)          │
│                                         │
│  asistencias_pendientes                 │
│  ├── id (UUID generado en móvil)        │
│  ├── datos de la asistencia             │
│  ├── timestamp                          │
│  └── intentos_sync                      │
└─────────────────────────────────────────┘
         │
         │ Al detectar WiFi
         ▼
   SyncService (Flutter)
         │
         ├── POST /api/asistencias/sync (batch)
         ├── El backend usa uuid_local para evitar duplicados
         └── Si éxito: elimina de SQLite local
```

---

## Seguridad

Al ser una aplicación de red local sin exposición a internet, el modelo de seguridad es sencillo pero suficiente:

- **Autenticación:** JWT con expiración de 8 horas (jornada laboral)
- **PIN de acceso:** 6 dígitos por usuario, hasheado en base de datos
- **Roles:** `admin` y `profesor` — los endpoints comprueban el rol
- **CORS:** Abierto (toda la red local es de confianza)
- **Sin HTTPS:** No necesario en red local privada

> ⚠️ Si en el futuro se quisiera acceso remoto (desde casa, por ejemplo), habría que añadir HTTPS y restringir CORS. Documentado en `07-despliegue.md`.

---

## Escalabilidad

El sistema está diseñado para una academia pequeña-mediana. Estimaciones de capacidad con el hardware actual:

| Métrica | Valor estimado |
|---------|---------------|
| Alumnos activos | Hasta ~500 sin problema |
| Profesores simultáneos | Hasta ~20 |
| Asistencias por día | Hasta ~200 |
| Conexiones WebSocket | Hasta ~10 simultáneas |

Muy por encima de las necesidades actuales de 12 Escalones.
