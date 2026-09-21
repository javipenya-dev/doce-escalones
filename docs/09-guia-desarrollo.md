# 09 — Guía de Desarrollo y Registro de Progreso

## Entorno de desarrollo recomendado

- **Editor:** Visual Studio Code
- **Extensiones recomendadas:**
  - Python (Microsoft)
  - Pylance
  - Docker
  - Flutter
  - Dart
  - Thunder Client (para probar la API, alternativa a Postman)
  - GitLens
  - ESLint + Prettier

---

## Cómo arrancar en modo desarrollo

### Backend
```bash
cd doce-escalones
docker-compose up -d db          # Solo la base de datos
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload    # Hot reload activado
```

O todo con Docker:
```bash
docker-compose up -d
```

### Frontend web
```bash
cd frontend-web
npm install
npm run dev
# Accesible en http://localhost:3000
```

### App móvil
```bash
cd mobile
flutter pub get
flutter run                       # Necesita emulador o dispositivo conectado
```

---

## Acceder a la API interactiva

Con el backend corriendo:
```
http://localhost:8000/docs        ← Swagger UI (probar endpoints)
http://localhost:8000/redoc       ← Documentación alternativa
```

---

## Acceder a la base de datos

```bash
# Desde terminal
docker exec -it academia_db psql -U academia_user -d academia

# Comandos útiles dentro de psql:
\dt                               # Listar tablas
\d asistencias                    # Describir tabla
SELECT * FROM usuarios;           # Consulta de ejemplo
\q                                # Salir
```

---

## Registro de progreso

### Fase 1 — Diseño y planificación ✅
**Completado:** Junio 2026

Decisiones tomadas:
- Definición completa de requisitos con el cliente (academia 12 Escalones)
- Elección del stack tecnológico
- Diseño del esquema de base de datos completo
- Arquitectura del sistema (local, sin nube)
- Diseño visual (paleta naranja/negro/blanco)

Entregables:
- `docs/` — documentación completa del proyecto
- `schema.sql` — esquema PostgreSQL completo
- `dashboard_preview.html` — prototipo visual del panel admin

---

### Fase 2 — Infraestructura y estructura del proyecto ✅
**Completado:** Junio 2026

Entregables:
- `docker-compose.yml` con PostgreSQL + FastAPI + React
- `.env.example` con todas las variables necesarias
- `backend/Dockerfile` y `frontend-web/Dockerfile`
- Estructura de carpetas del proyecto
- Modelos SQLAlchemy completos
- WebSocket manager base
- `README.md` con instrucciones de arranque

---

### Fase 3 — Backend: endpoints principales 🔄
**En curso**

Pendiente:
- [ ] Endpoint de login (POST /auth/login)
- [ ] Endpoint alta de alumno (POST /api/alumnos)
- [ ] Endpoint registro de asistencia (POST /api/asistencias)
- [ ] Lógica de actualización de resumen_mensual
- [ ] Broadcast WebSocket al registrar asistencia
- [ ] Schemas Pydantic para todos los modelos
- [ ] Endpoint sync offline (POST /api/asistencias/sync)

---

### Fase 4 — Backend: resto de endpoints ⏳

Pendiente:
- [ ] CRUD completo de alumnos
- [ ] CRUD de profesores
- [ ] CRUD de tarifas y packs
- [ ] Endpoint dashboard (ahora + mensual + stats)
- [ ] Endpoints de cobros
- [ ] Generación de ticket PDF
- [ ] Generación de factura PDF
- [ ] Importación Excel
- [ ] Vista horas_profesor_mensual
- [ ] Endpoint configuración academia

---

### Fase 5 — Panel web admin ⏳

Pendiente:
- [ ] Proyecto React + Vite creado
- [ ] Routing con React Router
- [ ] Autenticación (login + token JWT)
- [ ] Layout (sidebar + topbar)
- [ ] Dashboard con stats
- [ ] Panel en directo (WebSocket)
- [ ] Resumen mensual
- [ ] Gestión de alumnos (CRUD + ficha)
- [ ] Gestión de profesores
- [ ] Gestión de tarifas
- [ ] Flujo de cobro (wizard)
- [ ] Importación Excel
- [ ] Informes

---

### Fase 6 — App móvil Flutter ⏳

Pendiente:
- [ ] Proyecto Flutter creado
- [ ] Configuración de IP del servidor
- [ ] Login por PIN
- [ ] Pantalla registro de asistencias
- [ ] SQLite local para offline
- [ ] Sync service
- [ ] Indicadores offline (banner + toast)
- [ ] Pantallas admin (cobros)
- [ ] Integración impresora térmica

---

### Fase 7 — Pulido y despliegue ⏳

Pendiente:
- [ ] Script de backup automático
- [ ] Tarea de arranque automático en Windows
- [ ] Tests básicos del backend
- [ ] Variables de entorno revisadas para producción
- [ ] README final
- [ ] Demo grabada para portfolio

---

## Notas de desarrollo

*(Añadir aquí notas, problemas encontrados y soluciones durante el desarrollo)*

### YYYY-MM-DD
- ...
