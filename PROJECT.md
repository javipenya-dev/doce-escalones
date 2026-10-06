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


---

## Sesión 2026-10-05 (lunes) — Tests en academia CERRADOS ✅

### 🧪 Tests verificados end-to-end

**Test 1 — Web básica** ✅
- Dashboard carga con todo (1862 alumnos, 11 pagos, alertas, badge "En directo" verde)
- Sidebar footer visible
- Navegación OK

**Test 2A — Caché offline v1.6** ✅
- Modo avión con app abierta → registrar → toast naranja "Sin conexión"
- Quitar modo avión + cerrar app + abrir → toast verde "1 sincronizada"
- Claudia Almeda García registrada correctamente

**Test 2B — Sin sesión + modo avión** ✅ (comportamiento esperado)
- El login por PIN requiere backend. Los profes NO deben cerrar sesión
- La caché solo cubre el caso "ya logueado"

**Test 3 — Cobro completo** ✅
- Ticket térmico: logo bitmap + datos fiscales + todos los totales + observaciones + corte limpio
- Factura PDF: diseño con logo, B.Imponible, IVA 0%, pie legal
- Anulación: alumno vuelve a ROJO correctamente

**Test 4 — Editar/eliminar desde móvil** ✅
- Menú ⋮ → Corregir hora / Eliminar
- Confirmación + recálculo del resumen
- Feed "En directo" refleja los cambios en tiempo real

**Test 5 — Backup manual** ✅
- Botón "Crear backup ahora" funciona
- Panel con discos + listado de backups + log
- Verificado en la Pi: `auto/` y `manual/` con archivos correctos

### 🎯 Mejoras cerradas hoy

- **#1 Endpoint /health** ✅ — `http://192.168.1.212:8001/health`
- **#3 Email resumen semanal** ✅ — cron lunes 9:00, verificado con email real
- **#4 Página 404 personalizada** ✅ — diseño corporativo
- **Caché offline v1.6** ✅ — verificada en academia

### 📌 Pendientes menores (fase de pulido)

- Edición completa desde app móvil (hora inicio + fecha) — actualmente solo hora fin
- Etiqueta "ANULACIÓN" en feed En directo (color rojo en vez de naranja)

### 🔜 Próximo bloque — Agenda integrada

Empezamos con la integración de la agenda en la app (sustituye el `.ics` actual).
Plan: modelo Evento + CRUD backend + calendario React + item en sidebar.


## Sesión 2026-10-05 (lunes) — Backend de Agenda integrada ✅

### ✅ Backend de Citas CERRADO

**Modelo:** `backend/app/models/models.py` → clase `Cita`
- Tabla `citas` en PostgreSQL
- FK a `Alumnos` (opcional) y `Usuarios` (obligatorio)
- Índices en `fecha` y `profesor_id`

**Schemas:** `CitaCreate`, `CitaUpdate`, `CitaOut` en `schemas.py`

**Router:** `backend/app/api/routes/citas.py` (nuevo)
- GET /citas con filtros (desde, hasta, profesor_id, alumno_id)
- GET /citas/{id}
- POST /citas
- PUT /citas/{id}
- DELETE /citas/{id}
- Todos requieren rol admin

**Verificado en Swagger:**
- POST /citas → 201 con `alumno_nombre` y `profesor_nombre` calculados ✅
- GET /citas → 200 con lista de citas ✅
- DELETE /citas/1 → 204 ✅

**Migración SQL:** tabla `citas` + GRANT ALL a `doce_user` + ALTER DEFAULT PRIVILEGES (futuras tablas ya tienen permisos automáticos)

**Commit:** 2d8df6b

### 🔜 Próxima sesión — Frontend de la Agenda

- Página `/agenda` con calendario (react-big-calendar o similar)
- Vista mes / semana / día
- Modal crear/editar cita
- Filtro por profesor (con su color)
- Item "Agenda" en el sidebar

### 🎯 Pendientes generales (tras sesión 05/10)
- Tests v1.6 verificados en academia ✅
- Mejoras #1, #3, #4 cerradas ✅
- Cron del email semanal configurado y verificado ✅
- Backend de agenda cerrado ✅
- Quedan: frontend de agenda, integración del .ics actual, notificaciones push FCM

## Sesión 2026-10-05 (lunes) — FRONTEND de Agenda CERRADO ✅

### ✅ Agenda integrada en 12 Escalones

**Página nueva:** `frontend-web/src/pages/AgendaPage.jsx`
- Calendario con `react-big-calendar` + `moment-with-locales`
- Vistas: Mes / Semana / Día
- Modal crear/editar cita con autocompletado de alumno
- Filtro por profesor

**Integración:**
- Item "📅 Agenda" en Sidebar (grupo Gestión)
- Ruta `/agenda` en App.jsx
- `citasService` en `utils/api.js`

**Configuración:**
- Idioma: español
- Semana empieza en **lunes** (`dow: 1, doy: 4`)
- Horas en formato **24h**
- Colores por profesor (se heredan del panel Profesores)

**Verificado:**
- Crear cita ✅
- Editar cita ✅
- Eliminar cita ✅
- Filtro por profesor ✅
- Vista Día/Semana/Mes ✅

**Commit:** 6675695

### 📌 Sustituye a la agenda externa (PyQt6 + SQLite)
La app `aplicacion_agenda/app_agenda.py` de Windows (con `agenda_datos.db`) queda obsoleta.
El `.ics` compartido (`/agenda_compartida/agenda_12escalones.ics`) sigue sirviéndose pero
**ya no se actualiza** desde la nueva agenda. Pendiente decidir:
- Opción A: añadir endpoint `/citas/export.ics` que genere el .ics desde PostgreSQL
- Opción B: eliminar el .ics (los móviles que estén suscritos dejarán de actualizar)
- Opción C: dejar el .ics actual congelado (solo histórico)

## Sesión 2026-10-05 (lunes) — Agenda integrada + migración ✅

### ✅ Agenda integrada 100% funcional

**Backend:**
- Modelo `Cita` + tabla PostgreSQL
- CRUD completo (`/citas`)
- Endpoint público `/citas/export.ics` (iCal dinámico)

**Frontend:**
- Página `/agenda` con react-big-calendar
- Mes/Semana/Día, español, semana lunes, formato 24h
- Colores por profesor
- Modal crear/editar + filtros
- Subtítulo "X citas hoy · Y cita mañana (total)"

**Migración SQLite → PostgreSQL:**
- 92 citas migradas (61 vinculadas + 31 texto libre)
- Script `backend/scripts/migrar_citas_sqlite.py` con --dry-run
- Mapeo manual de profesores (Elisabet, María)
- Repositorio: 42 ago + 40 sep + 10 oct

### ✅ Favicon
- Copiado a `/var/www/doce-escalones/favicon.ico`
- Añadido a `frontend-web/public/favicon.ico` + link en `index.html`
- Accesos directos de Chrome actualizados a mano con el logo

### 🎯 Pendientes próximas sesiones
1. Actualizar suscripción `.ics` en el móvil de Marta:
   - Quitar: `http://192.168.1.212:8000/agenda_12escalones.ics`
   - Añadir: `http://100.88.238.34:8001/citas/export.ics`
2. Parar el servidor Python del puerto 8000
3. Archivar `~/aplicacion_agenda/` como legacy
4. Auto-vinculación de citas huérfanas al crear alumno
5. Merge de variantes de nombres (Alejandra González/Gonzalez)


## 📋 PENDIENTES — Sesión 2026-10-06 (martes)

### 🔴 PRIORIDAD ALTA

**1. Actualizar suscripción .ics en el móvil de Elisabet**
- [ ] Quitar la URL antigua (`http://192.168.1.172:8...`) de la lista de suscripciones
- [ ] Dejar solo la nueva: `http://100.88.238.34:8001/citas/export.ics`
- [ ] Verificar que se ve el calendario "agenda_12escalones" en Google Calendar del móvil
- Esfuerzo: 5 min

**2. Parar el servidor Python viejo (puerto 8000)**
- [ ] `sudo ss -tlnp | grep :8000` para ver el PID
- [ ] `kill [PID]` (una vez confirmado que todo va)
- [ ] Verificar que el `.ics` viejo ya no carga
- Esfuerzo: 2 min

**3. Archivar la carpeta `~/aplicacion_agenda/` como legacy**
- [ ] `mv ~/aplicacion_agenda ~/aplicacion_agenda.OBSOLETO_2026_10_05`
- Esfuerzo: 2 min

**4. Arreglar botón "Descargar plantilla" (Importar Excel)**
- [ ] Actualmente usa `fetch` puro → 401 sin avisar al usuario
- [ ] Cambiar a axios (mismo sistema que el resto de la app)
- [ ] Que redirija a login si el token ha caducado
- Archivos: `utils/api.js`, `ImportarPage.jsx`
- Esfuerzo: 10 min

**5. Verificar error 500 en `/auth/login`**
- [ ] `sudo journalctl -u doce-backend -n 50 --no-pager | grep -i "500\|error\|traceback"`
- [ ] Si es transitorio → cerrar. Si hay traceback → investigar
- Esfuerzo: 5 min

---

### 🟠 PRIORIDAD MEDIA

**6. Auto-vinculación de citas huérfanas**
- [ ] Cuando se crea un alumno nuevo, buscar citas con `alumno_texto` similar
- [ ] Vincularlas automáticamente (rellenar `alumno_id`)
- [ ] Aplicar también en importar Excel
- Esfuerzo: 30 min

**7. Unificar variantes de nombres en citas migradas**
- Casos detectados:
  - Alejandra González/Gonzalez Parra (tilde)
  - Manuel Pérez Guerrero / Manuel ¨Pérez Guerrero / manuel pérez guerrero (3 variantes)
  - Paula Reyes / Paula Reyes Valle
  - Sofía Andrade Fernández / Sofia Daniela Andrade / Sofía Daniela Andrade Fernández
- [ ] Script que detecte y unifique
- Esfuerzo: 1 h

**8. Semáforo real en listado Alumnos**
- [ ] Ahora muestra "Activo/Baja" pero no el estado de pago
- [ ] Cruzarlo con resumen mensual
- Esfuerzo: 2 h

**9. Limpiar useEffect duplicados**
- Páginas afectadas: Dashboard, Profesores, AlumnoFicha, modal Añadir pack
- [ ] Hacen la misma llamada 2-3 veces
- [ ] Unificar con debounce
- Esfuerzo: 1-2 h

**10. Edición completa desde app móvil**
- [ ] Ahora el profesor solo puede cambiar hora de fin
- [ ] Añadir hora de inicio + fecha
- Archivo: `flutter-app/lib/screens/profesor/profesor_home_screen.dart`
- Esfuerzo: 1 h

**11. Etiqueta "ANULACIÓN" en el feed En Directo**
- [ ] Ahora sale naranja → debería ser rojo (coherente con "ELIMINADA")
- Archivo: `frontend-web/src/pages/DirectoPage.jsx`
- Esfuerzo: 10 min

**12. CobroListItem minimalista**
- [ ] El listado de cobros trae TODOS los pagos/packs de cada cobro
- [ ] Schema reducido solo para listado
- Esfuerzo: 1 h

---

### 🟡 PRIORIDAD BAJA

**13. Notificaciones push FCM**
- Recordatorios al admin: "Susana debe 50€", "3 pendientes", etc.
- Esfuerzo: 1-2 semanas

**14. Backup 3-2-1 completo**
- Local en Pi + USB (ya hecho) + nube (pendiente)
- Esfuerzo: 1-2 h

**15. PWA real para móvil**
- Service worker para modo offline completo
- Esfuerzo: 3-4 h

**16. Tests pytest de flujos críticos**
- Asistencias, packs, semáforo, cobros, facturar
- Esfuerzo: 2-3 semanas

**17. Panel de admin en app móvil**
- Llevar el panel admin al móvil
- Esfuerzo: 1 día

**18. Verificar alerta email de backup con fallo real**
- Nunca se ha probado el email cuando el backup falla
- Esfuerzo: 15 min

**19. Rate limiting en login**
- Limitar intentos de PIN por IP/usuario
- Esfuerzo: 1 h

**20. Cerrar /docs en producción**
- Swagger está expuesto públicamente
- Esfuerzo: 15 min

**21. Cambiar contraseña PostgreSQL**
- Ahora `doce_pass` es débil
- Esfuerzo: 5 min

**22. Cambiar contraseña GitHub + 2FA**
- Comprometida en el chat (21/09)
- [ ] Ir a `github.com/settings/security` → cambiar password + activar 2FA
- Esfuerzo: 10 min

---

### ⚠️ NOTAS ADICIONALES

**Botón Descargar Plantilla — 401 al token caducado**
- El token JWT dura 8h
- Cuando caduca: botón da error, re-login lo arregla
- Mejora: usar axios en vez de fetch (pendiente #4)

**Favicon ya resuelto**
- Copiado a `/var/www/doce-escalones/favicon.ico`
- Añadido a `frontend-web/public/favicon.ico` + link en `index.html`
- Accesos directos de Chrome actualizados a mano en cada PC

**Frecuencia de sincronización del calendario en ICSx⁵**
- Por defecto sincroniza cada pocas horas
- En ajustes se puede poner 1h si se quiere refresco más rápido

---

### 🎯 SUGERENCIA PARA MAÑANA

Orden recomendado:
1. Puntos 1, 2, 3 (5 min total) → dejar el calendario limpio
2. Punto 4 (arreglar botón) → mejora de UX rápida
3. Punto 5 (verificar 500) → seguridad
4. Si sobra tiempo: puntos 11 (10 min) y 6 (30 min)