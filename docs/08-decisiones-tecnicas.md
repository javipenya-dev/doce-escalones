# 08 — Decisiones Técnicas

Este documento explica **por qué** se eligió cada tecnología y qué alternativas se descartaron. Es el documento más valioso para entrevistas y portfolio: demuestra criterio técnico, no solo conocimiento de herramientas.

---

## Por qué FastAPI y no Django o Flask

**Elegido: FastAPI**

| Criterio | FastAPI | Django REST | Flask |
|----------|---------|-------------|-------|
| Rendimiento | ⭐⭐⭐ Async nativo | ⭐⭐ Sync por defecto | ⭐⭐ Sync |
| WebSockets | ✅ Nativo | ⚠️ Requiere channels | ⚠️ Requiere extensión |
| Validación | ✅ Pydantic integrado | ⚠️ Serializers manuales | ❌ Manual |
| Documentación API | ✅ Auto (Swagger/OpenAPI) | ⚠️ drf-yasg externo | ❌ Manual |
| Curva de aprendizaje | Baja-media | Alta | Baja |

**Razón principal:** El panel en tiempo real requiere WebSockets. FastAPI los soporta de forma nativa y su modelo asíncrono es perfecto para gestionar múltiples conexiones simultáneas sin bloquear el servidor. Además, la generación automática de documentación Swagger es muy útil durante el desarrollo.

---

## Por qué PostgreSQL y no MySQL o SQLite

**Elegido: PostgreSQL**

- **vs MySQL:** PostgreSQL tiene mejor soporte para tipos de datos complejos, constraints más expresivos (como el CHECK que usamos en `hermanos`) y mejor rendimiento en consultas analíticas (informes mensuales).
- **vs SQLite:** SQLite no soporta múltiples escrituras concurrentes bien. Con varios profesores registrando asistencias al mismo tiempo desde sus móviles, SQLite generaría conflictos. PostgreSQL gestiona la concurrencia de forma robusta.

**Por qué no en la nube (RDS, Supabase, etc.):** El cliente quiere que los datos permanezcan en las instalaciones de la academia. Sin dependencia de internet, sin coste mensual de servicio, sin preocupaciones de privacidad de datos de menores.

---

## Por qué Flutter y no React Native o app web PWA

**Elegido: Flutter**

| Criterio | Flutter | React Native | PWA |
|----------|---------|--------------|-----|
| Rendimiento | ⭐⭐⭐ Motor propio | ⭐⭐ Bridge nativo | ⭐⭐ Depende del navegador |
| Una sola base de código | ✅ Android + iOS | ✅ | ✅ |
| Impresora Bluetooth | ✅ Plugins maduros | ⚠️ Plugins inestables | ❌ Sin acceso BT |
| Offline + SQLite | ✅ sqflite nativo | ✅ | ⚠️ IndexedDB limitado |
| UI consistente | ✅ Mismo look en todos | ⚠️ Varía por plataforma | ⚠️ |

**Razón principal:** La integración con la impresora térmica por Bluetooth fue el factor decisivo. Las PWA no tienen acceso a Bluetooth en iOS (política de Apple). React Native tiene plugins de impresión pero menos maduros y con más problemas de mantenimiento que los de Flutter.

---

## Por qué Docker Compose y no instalación directa

**Elegido: Docker Compose**

Instalar PostgreSQL, Python con sus dependencias y Node.js directamente en Windows puede generar conflictos de versiones, problemas con el PATH y ser difícil de mantener. Con Docker:

- **Reproducibilidad:** El entorno es idéntico en cualquier PC
- **Aislamiento:** No interfiere con otros programas del PC
- **Portabilidad:** Si el PC de la academia muere, se restaura en otro PC en minutos
- **Valor formativo:** Docker Compose es una skill clave en DevOps; este proyecto es práctica real

---

## Por qué red local y no la nube

**Requisito del cliente**, pero también tiene ventajas técnicas objetivas:

- **Sin latencia de red externa:** Las actualizaciones del WebSocket son instantáneas
- **Sin coste mensual:** No hay factura de AWS, GCP o similar
- **Privacidad de datos:** Datos de menores que no salen de las instalaciones (relevante bajo RGPD)
- **Sin dependencia de internet:** Si cae el internet de la academia, el sistema sigue funcionando

**Contra:** Si el PC de la academia falla, el sistema cae. Mitigado con backups regulares y la simplicidad de restauración con Docker.

---

## Por qué tabla `resumen_mensual` y no una vista SQL

Se podría calcular las horas consumidas con una vista SQL:
```sql
SELECT SUM(duracion_min)/60.0 FROM asistencias
WHERE alumno_id = X AND EXTRACT(MONTH FROM fecha) = 6;
```

Pero esto recalcula desde cero en cada consulta. Con el panel en tiempo real y el WebSocket actualizándose continuamente, esto sería costoso. La tabla `resumen_mensual` actúa como **caché materializada**: se actualiza en el mismo endpoint que registra la asistencia, y las lecturas son instantáneas.

---

## Por qué JWT y no sesiones de servidor

En una aplicación de red local con app móvil, las sesiones de servidor requieren que el móvil y el servidor compartan estado (cookies o almacén de sesiones). JWT es **stateless**: el token contiene toda la información necesaria y el servidor no necesita almacenar nada. Más simple y compatible con Flutter de forma nativa.

Expiración de 8 horas: cubre una jornada laboral completa sin necesidad de relogin.

---

## Por qué `uuid_local` para la sincronización offline

El problema clásico del sync offline es la **doble inserción**: si el móvil envía una asistencia, no recibe confirmación (por timeout) y la reenvía, el servidor podría insertarla dos veces.

La solución es la **idempotency key**: el móvil genera un UUID único antes de enviar. Si el servidor ya tiene ese UUID, ignora la petición silenciosamente. Así el móvil puede reintentar sin miedo a duplicados.

---

## Por qué `alumno_id_1 < alumno_id_2` en la tabla hermanos

Sin esta restricción, la relación entre los alumnos 3 y 7 podría existir como dos filas: (3,7) y (7,3). Para consultar "¿tiene hermanos el alumno 7?" habría que buscar en ambas columnas. Con el CHECK, la relación siempre se guarda con el menor ID primero, y la consulta es predecible y más eficiente.

---

## Decisiones de diseño visual

**Por qué naranja sobre negro/blanco:**
- Es la identidad de 12 Escalones
- El naranja sobre negro tiene alto contraste (accesibilidad)
- El naranja comunica energía y dinamismo — apropiado para una academia
- Facilita la distinción rápida de los elementos interactivos

**Por qué Outfit + DM Mono:**
- Outfit: moderna, muy legible en pantalla, excelente soporte de pesos
- DM Mono: para números y datos (horas, importes, horas) — la tipografía monoespaciada facilita la lectura de columnas numéricas

**Por qué el panel en tiempo real usa WebSocket y no polling:**
El polling (preguntar al servidor cada X segundos "¿hay cambios?") genera tráfico innecesario y tiene un retraso inherente. WebSocket mantiene una conexión abierta: el servidor envía actualizaciones en el momento exacto en que ocurren. Para una academia pequeña con pocas conexiones simultáneas, el coste de mantener la conexión abierta es insignificante.
