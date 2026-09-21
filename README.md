# 🎓 Doce Escalones — Sistema de Gestión de Academia

Sistema de gestión de asistencias, cobros y alumnos para academias.  
Stack: **FastAPI · PostgreSQL · React · Flutter** · Docker Compose

---

## 🚀 Arranque rápido (5 minutos)

### Requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y arrancado

### 1. Clonar / extraer el proyecto
```bash
cd doce-escalones-v6
```

### 2. Crear el fichero de entorno
```bash
cp .env.example .env
# Edita .env si quieres cambiar la SECRET_KEY (recomendado en producción)
```

### 3. Levantar todo con Docker
```bash
docker compose up -d
```

Esto arranca automáticamente:
- **PostgreSQL** con el schema creado y datos iniciales
- **Backend FastAPI** en http://localhost:8000
- **Frontend React** en http://localhost:5173

### 4. Crear el primer admin
```bash
docker compose exec backend python scripts/crear_admin.py
```

### 5. Abrir la aplicación
→ http://localhost:5173

---

## 📱 App Móvil Flutter

```bash
cd mobile
flutter pub get
flutter run
```

Apunta al backend en `lib/services/api_service.dart`:
```dart
static const String _baseUrl = 'http://TU_IP_LOCAL:8000';
```

---

## 🛠️ Desarrollo sin Docker

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env       # ajusta DATABASE_URL a tu Postgres local
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend-web
npm install
npm run dev
```

---

## 🧪 Tests

```bash
cd backend
pytest                           # todos los tests
pytest tests/test_semaforo.py    # solo semáforo
pytest -v                        # verbose
```

---

## 📁 Estructura del proyecto

```
doce-escalones-v6/
├── backend/
│   ├── main.py                  ← Punto de entrada FastAPI
│   ├── app/
│   │   ├── models/models.py     ← Modelos SQLAlchemy
│   │   ├── schemas/schemas.py   ← Pydantic schemas
│   │   ├── api/routes/          ← Endpoints REST
│   │   ├── services/            ← Lógica de negocio
│   │   ├── core/                ← Auth, JWT, deps
│   │   └── db/database.py       ← Conexión async
│   └── tests/                   ← pytest
│
├── frontend-web/                ← React + Vite
│   └── src/
│       ├── pages/               ← Páginas principales
│       ├── components/          ← UI reutilizable
│       └── utils/api.js         ← Llamadas al backend
│
├── mobile/                      ← Flutter (Android + iOS)
│   └── lib/
│       ├── screens/             ← Pantallas
│       └── services/            ← API, auth, impresora, sync
│
├── scripts/
│   ├── init.sql                 ← Datos iniciales
│   ├── crear_admin.py           ← Script crear primer admin
│   ├── backup.py                ← Backup automático PostgreSQL
│   └── arranque_windows.bat     ← Arranque en Windows
│
├── docs/assets/schema.sql       ← Schema completo de BD
├── docker-compose.yml
└── .env.example
```

---

## 🔑 API Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /auth/login | Login con PIN |
| GET | /alumnos | Listar alumnos |
| GET | /alumnos/{id}/historico | Histórico mensual de un alumno |
| GET | /dashboard/stats | Stats del panel |
| GET | /dashboard/mes | Semáforo del mes actual |
| POST | /cobros | Registrar cobro |
| GET | /informes/mensual | Informe mensual completo |
| GET | /docs | Swagger UI (desarrollo) |

---

## 🔄 Backup automático

```bash
python scripts/backup.py
```

Guarda un dump de PostgreSQL en `backups/` con fecha.  
Ver `scripts/backup_programado.md` para programarlo en Windows.

---

## 📦 Semáforo de alumnos

| Color | Significado |
|-------|-------------|
| 🟢 Verde | Ha pagado este mes |
| 🔴 Rojo | Tiene asistencias pero no ha pagado |
| 🟡 Amarillo | Pack agotado (horas consumidas ≥ contratadas) |
| 🟠 Naranja | Mes de 5 semanas (horas extra) |
