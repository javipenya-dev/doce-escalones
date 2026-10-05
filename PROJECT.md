# 12 Escalones — Sistema de gestión de academia

**Objetivo**: sustituir completamente el TPV actual de la academia.
Registro de asistencias + cobros + facturación + informes + backups.

*Última actualización: 2026-10-04*

---

## 🏗️ INFRAESTRUCTURA

### Producción — Raspberry Pi 4
| Componente | Detalle |
|---|---|
| Host | `192.168.1.212` (usuario `javi`, acceso SSH) |
| SO | Debian 13, 2 GB RAM |
| PostgreSQL | 17, puerto 5432 |
| Backend | FastAPI + Uvicorn, puerto 8001, systemd (`doce-backend`) |
| Frontend | React compilado, servido por nginx puerto 80 |
| WebSocket | `/ws` proxya a `127.0.0.1:8001` |
| USB backups | `/mnt/backup-usb` (2 TB, UUID CEB7-D490) |
| Impresora | Excelvan POS-80, `192.168.1.23:9100` |

### Desarrollo — Portátil
- Repo: `C:\Users\xarxa\Desktop\doce-escalones-v9`
- Backend local: `.venv\Scripts\activate` → `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
- Frontend local: `cd frontend-web && npm run dev` → `http://localhost:3001`

### URLs útiles
- **App web**: `http://192.168.1.212`
- **Swagger**: `http://192.168.1.212:8001/docs`
- **GitHub**: https://github.com/javipenya-dev/doce-escalones

---

## 🔑 CREDENCIALES Y DATOS

### Login admin
- PIN: `0001` · email: `info@12escalones.com`

### PostgreSQL
- User: `doce_user` · Pass: `doce_pass` · DB: `doce_escalones`

### SMTP (alertas de backup)
- Gmail app password en `backend/.env`
- Destinatarios: `info@12escalones.com`, `e.ruizyesa@gmail.com`, `xarxacalcio@gmail.com`

### Config frontend
VITE_API_URL=/api
- `frontend-web/.env.production` (local, en `.gitignore`):

- **NO** poner `VITE_WS_URL` — el hook `useWebSocket.js` ya añade `/ws`.

---

## ⚠️ REGLA DE ORO — Deploy del frontend

**nginx sirve desde `/var/www/doce-escalones`**
**El build compila en `~/doce-escalones/frontend-web/dist`**

❌ Sin copiar el `dist`, los cambios NO llegan al navegador.

### ✅ Deploy correcto (1 comando)

```bash
deploy-doce

cd /home/javi/doce-escalones
git pull origin main
cd frontend-web
npm run build
cp -r dist/* /var/www/doce-escalones/
sudo systemctl restart nginx

Ubicación: /usr/local/bin/deploy-doce (sin password).

🛠️ COMANDOS DE REFERENCIA
💻 Portátil (cmd)
:: Backend local
cd C:\Users\xarxa\Desktop\doce-escalones-v9\backend
.venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

:: Frontend web local (otra terminal)
cd C:\Users\xarxa\Desktop\doce-escalones-v9\frontend-web
npm run dev

:: Compilar APK Flutter
cd C:\Users\xarxa\Desktop\doce-escalones-v9\flutter-app
flutter build apk --release
copy build\app\outputs\flutter-apk\app-release.apk C:\Users\xarxa\Desktop\12Escalones-vX.Y.apk

:: Guardar cambios en git
cd C:\Users\xarxa\Desktop\doce-escalones-v9
git add .
git commit -m "mensaje"
git push origin main

🍓 Raspberry Pi (ssh)
:: Conectar
ssh javi@192.168.1.212

:: Deploy frontend (1 comando, sin password)
deploy-doce

:: Estado servicios
sudo systemctl status doce-backend nginx postgresql --no-pager

:: Ver logs en vivo
sudo journalctl -u doce-backend -f
sudo tail -f /var/log/nginx/doce-error.log

:: Verificar backups
ls -la /mnt/backup-usb/doce-escalones/backups/auto/

:: Reiniciar servicios
sudo systemctl restart doce-backend
sudo systemctl restart nginx

📊 ESTADO ACTUAL
✅ Bloques CERRADOS al 100%
Cobros: cobro, anular, factura PDF, sello "COBRO ANULADO", auto-print 2 copias

Dashboard: 5 endpoints (/stats, /ahora, /mes, /alertas-semaforo, /deudas-acumuladas)

Asistencias: registro, edición, eliminación, packs pendientes, semáforo

Alumnos: búsqueda, filtro activo/baja, ficha completa, hermanos, histórico

Profesores: búsqueda, filtro, color, teléfono, soft delete, crear admin/profesor

Tarifas: buscador, clonar, presets duración, filtros

Informes: comparativas, top alumnos, gráfico evolución, export PDF/CSV

Importar Excel: preview, plantilla, drag-drop, detección duplicados

Configuración: backup panel, logo, SMTP

Backup: manual + automático 03:00, rotación 30 días, alertas email

App Flutter: login PIN, panel admin, panel profesor, icono personalizado, APK v1.5/v1.6

WebSocket: feed "En Directo" en tiempo real con nombres correctos

🟡 Parcialmente cerrados
Sync offline: endpoints backend listos + queue local en app. Caché de alumnos en v1.6 (pendiente de probar en academia).

Bug #6 (horas extra): CONFIRMADO OK. Regla del 15% con mínimo 1h, cobra exceso completo.

⏳ Pendientes para próximas sesiones
Probar v1.6 en academia (Tests A/B de caché offline)

Tests pytest de flujos críticos

Notificaciones push FCM

Acceso directo "modo app" en sobremesa

Backup local en Pi (regla 3-2-1)

PWA para móvil (opcional)

Limpieza: useEffect duplicados en varias páginas

Semáforo real en listado Alumnos

## 🎯 Mejoras elegidas (2026-10-04)

De la lista de propuestas, elegidas 3:

1. **Endpoint `/health`** — verificación rápida de estado
2. **Email resumen semanal** — cada lunes: pagos pendientes, recaudación, alumnos inactivos
3. **Página 404 personalizada** — diseño 12 Escalones + botón "Volver al Dashboard"

Pendiente decidir orden. `/health` es el más rápido (10 min).

## ✅ Mejoras elegidas — Estado

### #1 Endpoint /health — CERRADO (2026-10-04)
- GET http://192.168.1.212:8001/health
- Devuelve: status, db, version, timestamp
- Verifica conexión a BD con `SELECT 1`
- Archivo: `backend/main.py`
- Commit: 3fd4664


## ✅ Mejoras elegidas (2026-10-04) — Estado final

### 1. Endpoint /health — CERRADO ✅
- GET http://192.168.1.212:8001/health
- Devuelve: `{status, db, version, timestamp}`
- Verifica conexión a BD con `SELECT 1`
- Archivo: `backend/main.py`
- Commit: 3fd4664

### 3. Email resumen semanal — CERRADO ✅
- Script: `backend/scripts/enviar_resumen.py` (CLI)
- Servicio: `backend/app/services/resumen_semanal_service.py`
- Contenido: recaudado mes, clases 7 días, pagos pendientes, alumnos inactivos (14d)
- Cron: pendiente de configurar (se hace mañana lunes 05/10)
- Verificado: email recibido en los 3 destinatarios ✅
- Commit: 8886097

### 4. Página 404 personalizada — CERRADO ✅
- Componente: `frontend-web/src/pages/NotFoundPage.jsx`
- Integración: `App.jsx` → `<Route path="*" element={<NotFoundPage />} />`
- Diseño: fondo negro, 404 naranja gigante, logo, botón "Volver al Dashboard"
- Verificado: `https://192.168.1.212/fakepage` → muestra la 404 correctamente ✅