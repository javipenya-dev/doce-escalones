# 01 — Descripción del Proyecto

## Nombre
**12 Escalones — Sistema de Gestión de Academia**

## Nombre técnico del proyecto
`doce-escalones`

## Resumen
Sistema de gestión integral para la academia de clases **12 Escalones**, diseñado para resolver el control manual de asistencias, pagos y horas consumidas por alumno. Sustituye un proceso completamente manual (anotaciones en papel, cruce mensual con Excel) por un sistema digital en tiempo real.

---

## El problema que resuelve

Antes de este sistema, el flujo de trabajo era:
- Las asistencias se anotaban **a mano** por los profesores
- A **final de mes** se sumaban las horas manualmente alumno por alumno
- Se cotejaba si cada alumno había pagado o no
- Si un alumno venía **más horas de las contratadas**, no siempre se detectaba
- El proceso era **lento, propenso a errores y muy costoso en tiempo**

---

## Solución

Una aplicación compuesta por:

1. **App móvil para profesores** — registran asistencias en tiempo real desde su propio móvil o uno de la academia, identificándose con PIN
2. **Panel web para administradores** — visión completa del estado de alumnos, pagos, horas y clases en curso
3. **Backend local** — servidor corriendo en el PC de la academia, sin depender de servicios en la nube
4. **Base de datos local** — todos los datos se quedan en las instalaciones de la academia

---

## Funcionalidades principales

### Gestión de alumnos
- Alta, baja y modificación de alumnos
- Datos: nombre, apellidos, fecha de nacimiento, fecha de inscripción, teléfonos, dirección, email
- Vinculación de hermanos con descuento automático del 10%
- Importación masiva desde Excel
- Histórico completo por alumno: horas, sesiones y pagos

### Tipos de clase
El sistema diferencia tres categorías que nunca se mezclan:
- **Clases normales** — apoyo escolar (matemáticas, lengua, etc.)
- **Inglés** — clases de idioma
- **Sesiones** — logopedia, psicología, etc. (duración fija, contadas por sesión)

### Asistencias
- Registro por profesor desde la app móvil
- Funcionamiento **offline**: si no hay WiFi, se guarda localmente y se sincroniza al recuperar la conexión con notificación toast
- Contador automático de horas y sesiones por alumno y mes
- Detección automática de meses de 5 semanas (indicador naranja)

### Panel en tiempo real
- **Vista "Ahora mismo"**: qué profesores están dando clase en este momento, con qué alumnos y su estado de pago
- **Vista mensual**: todos los alumnos del mes con horas consumidas, sesiones y estado de pago

### Semáforo de estado
| Color | Significado |
|-------|-------------|
| 🟢 Verde | Pagado y al corriente — muestra horas/sesiones consumidas |
| 🔴 Rojo | Pago pendiente — muestra horas consumidas e importe debido |
| 🟡 Amarillo | Pack agotado, necesita renovación |
| 🟠 Naranja | Mes de 5 semanas, horas extra (+1) — no penaliza |

### Cobros
- Registro de cobros por alumno y pack
- Formas de pago: efectivo, tarjeta, Bizum, transferencia y **mixto** (cualquier combinación)
- Descuentos: hermanos (10% fijo), descuento libre por porcentaje o importe
- Todo el desglose aparece en el ticket
- Anulación de tickets
- Generación de **facturas** con numeración correlativa legal (FAC-2026-001...)
- Impresión en impresora térmica de tickets

### Gestión de profesores
- Alta y baja de profesores
- Cada profesor se identifica con PIN en la app móvil
- Un profesor puede impartir varios tipos de clase
- Conteo de horas trabajadas por profesor al final de cada mes

---

## Usuarios del sistema

| Rol | Acceso | Funciones |
|-----|--------|-----------|
| **Admin** | App móvil + Panel web | Todo |
| **Profesor** | App móvil | Registrar asistencias de sus clases |

---

## Academia

- **Nombre:** 12 Escalones
- **Colores corporativos:** Naranja (varios tonos), blanco y negro
- **Ubicación:** Jerez de la Frontera, Andalucía

---

## Estado del proyecto

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Diseño y planificación | ✅ Completado |
| 2 | Esquema de base de datos | ✅ Completado |
| 3 | Estructura del proyecto y Docker | ✅ Completado |
| 4 | Backend — endpoints principales | 🔄 En curso |
| 5 | Panel web admin | ⏳ Pendiente |
| 6 | App móvil Flutter | ⏳ Pendiente |
| 7 | Cobros, tickets y facturas | ⏳ Pendiente |
| 8 | Paneles en tiempo real (WebSocket) | ⏳ Pendiente |
| 9 | Integración impresora térmica | ⏳ Pendiente |
| 10 | Pulido y despliegue definitivo | ⏳ Pendiente |
