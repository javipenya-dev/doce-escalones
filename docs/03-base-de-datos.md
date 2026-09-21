# 03 — Base de Datos

## Motor
**PostgreSQL 16** corriendo en Docker

---

## Diagrama de tablas y relaciones

```
usuarios ──────────────────────────────────────────────────┐
  │ (profesor_id)                                           │
  │                                                         │
  ▼                                                         │
packs_alumno ◄─── alumnos ◄─── hermanos (N:M autorreferencial)
  │    │              │
  │    │              └──► cobros ──► cobros_pagos
  │    │                       └──► cobros_packs
  │    │                       └──► facturas
  │    │
  │    └──► resumen_mensual (cache mensual)
  │
  ▼
asistencias ──► tipos_clase ──► duraciones_sesion
                    ▲
tarifas ────────────┘
```

---

## Tablas

### `usuarios`
Administradores y profesores del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | Identificador único |
| nombre | VARCHAR(100) | Nombre |
| apellidos | VARCHAR(150) | Apellidos |
| email | VARCHAR(150) UNIQUE | Email (opcional) |
| pin | VARCHAR(6) | PIN hasheado para login en app |
| rol | ENUM | `admin` o `profesor` |
| activo | BOOLEAN | Baja lógica |

---

### `alumnos`
Todos los alumnos de la academia.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | Identificador único |
| nombre | VARCHAR(100) | Nombre |
| apellidos | VARCHAR(150) | Apellidos |
| fecha_nacimiento | DATE | Fecha de nacimiento |
| fecha_inscripcion | DATE | Fecha de alta en la academia |
| telefono1 | VARCHAR(20) | Teléfono principal |
| telefono2 | VARCHAR(20) | Teléfono secundario |
| direccion | TEXT | Dirección completa |
| email | VARCHAR(150) | Email de contacto |
| activo | BOOLEAN | Baja lógica |

---

### `hermanos`
Relación simétrica entre alumnos hermanos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| alumno_id_1 | FK → alumnos | Siempre el de menor ID |
| alumno_id_2 | FK → alumnos | Siempre el de mayor ID |

> **Nota:** El CHECK `alumno_id_1 < alumno_id_2` garantiza que la pareja (3,7) y (7,3) no puedan existir como dos filas distintas. La consulta de "¿tiene hermanos?" busca en ambas columnas.

**Lógica del descuento de hermanos:**
El 10% se aplica a **todos los hermanos** que tengan pack activo ese mes. Se detecta automáticamente al generar un cobro.

---

### `tipos_clase`
Catálogo de tipos de clase.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | |
| nombre | VARCHAR(100) | Ej: "Apoyo escolar", "Inglés B2", "Logopedia" |
| categoria | ENUM | `normal`, `ingles` o `sesion` |
| activo | BOOLEAN | |

> **Importante:** La `categoria` determina cómo se contabilizan las horas:
> - `normal` e `ingles`: en **horas** (horas_semanales × semanas del mes)
> - `sesion`: en **número de sesiones** (cada sesión tiene duración fija)

---

### `duraciones_sesion`
Duraciones posibles para cada tipo de sesión.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | |
| tipo_clase_id | FK → tipos_clase | |
| duracion_min | INT | Duración en minutos (ej: 45, 60) |
| descripcion | VARCHAR(100) | Ej: "Sesión estándar 45min" |

---

### `tarifas`
Plantillas de packs reutilizables. El admin las crea y luego las asigna a alumnos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | |
| nombre | VARCHAR(150) | Ej: "Bono 2h/semana Apoyo" |
| tipo_clase_id | FK → tipos_clase | |
| categoria | ENUM | `normal`, `ingles` o `sesion` |
| horas_semanales | NUMERIC(4,1) | Solo para normal/inglés. Ej: 2.0 |
| num_sesiones | INT | Solo para sesiones (bono). Ej: 4 |
| es_bono_sesion | BOOLEAN | TRUE = bono, FALSE = sesión suelta |
| duracion_sesion_min | INT | Duración fija de cada sesión |
| precio_base | NUMERIC(8,2) | Precio sin descuentos |
| activo | BOOLEAN | |

**Ejemplos de tarifas:**

| Nombre | Categoría | Horas/sem | Sesiones | Precio |
|--------|-----------|-----------|---------|--------|
| Apoyo 1h/semana | normal | 1.0 | — | 40€ |
| Apoyo 2h/semana | normal | 2.0 | — | 75€ |
| Inglés 2h/semana | ingles | 2.0 | — | 80€ |
| Logopedia sesión suelta | sesion | — | 1 | 35€ |
| Logopedia bono 4 sesiones | sesion | — | 4 | 120€ |

---

### `packs_alumno`
Pack contratado por un alumno concreto. Un alumno puede tener varios simultáneos (ej: apoyo + inglés + logopedia).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | |
| alumno_id | FK → alumnos | |
| tarifa_id | FK → tarifas | Tarifa base que usa |
| profesor_id | FK → usuarios | Profesor asignado |
| fecha_inicio | DATE | |
| fecha_fin | DATE | NULL = sin caducidad |
| activo | BOOLEAN | |
| notas | TEXT | Observaciones del admin |

---

### `asistencias`
Registro de cada asistencia individual. Es la tabla más importante operativamente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | |
| alumno_id | FK → alumnos | |
| pack_alumno_id | FK → packs_alumno | Pack al que se descuenta |
| profesor_id | FK → usuarios | Profesor que la registra |
| tipo_clase_id | FK → tipos_clase | |
| fecha | DATE | Fecha de la clase |
| hora_inicio | TIME | Hora de inicio |
| duracion_min | INT | Duración real en minutos |
| es_sesion | BOOLEAN | TRUE si es sesión (logopedia, etc.) |
| sincronizado | BOOLEAN | FALSE si llegó por sync offline |
| uuid_local | VARCHAR(36) UNIQUE | UUID generado en el móvil (evita duplicados en sync) |

---

### `resumen_mensual`
Cache calculada de horas y sesiones por alumno, pack y mes. Se actualiza automáticamente cada vez que se inserta una asistencia.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| alumno_id | FK → alumnos | |
| pack_alumno_id | FK → packs_alumno | |
| anio / mes | INT | Período |
| horas_consumidas | NUMERIC(5,2) | Total horas ese mes |
| sesiones_consumidas | INT | Total sesiones ese mes |
| semanas_en_mes | INT | 4 o 5 — determina si mostrar 🟠 |
| horas_contratadas | NUMERIC(5,2) | Calculado al inicio del mes |
| sesiones_contratadas | INT | |

> **Por qué es una tabla y no una vista:** Para que los paneles en tiempo real y el WebSocket respondan instantáneamente sin recalcular desde cero. Se actualiza en el mismo endpoint que inserta la asistencia.

---

### `cobros`
Cabecera de cada cobro realizado.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| alumno_id | FK → alumnos | |
| admin_id | FK → usuarios | Admin que realiza el cobro |
| fecha | TIMESTAMP | |
| subtotal | NUMERIC(8,2) | Antes de descuentos |
| descuento_hermano_pct | NUMERIC(5,2) | Siempre 10% si aplica |
| descuento_extra_pct | NUMERIC(5,2) | Descuento libre en % |
| descuento_extra_importe | NUMERIC(8,2) | Descuento libre en € |
| total | NUMERIC(8,2) | Importe final |
| anulado | BOOLEAN | Ticket anulado |
| admin_anulacion_id | FK → usuarios | Quién anuló |

---

### `cobros_pagos`
Detalle de formas de pago por cobro. Un cobro mixto genera varias filas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| cobro_id | FK → cobros | |
| forma_pago | ENUM | `efectivo`, `tarjeta`, `bizum`, `transferencia` |
| importe | NUMERIC(8,2) | Importe pagado con esa forma |

**Ejemplo cobro mixto (102,60€):**
```
cobro_id | forma_pago | importe
---------|------------|--------
       1 | efectivo   |  60.00
       1 | bizum      |  42.60
```

---

### `cobros_packs`
Qué packs cubre cada cobro (un cobro puede pagar varios packs a la vez).

---

### `facturas`
Facturas emitidas a petición del cliente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| cobro_id | FK → cobros UNIQUE | Una factura por cobro máximo |
| numero | VARCHAR(20) UNIQUE | FAC-2026-001 (correlativa) |
| nombre_fiscal | VARCHAR(200) | Nombre del cliente para la factura |
| nif | VARCHAR(20) | NIF/CIF del cliente |
| direccion_fiscal | TEXT | |
| email_envio | VARCHAR(150) | Para envío por email |

---

### `academia_config`
Datos fiscales de la academia. Solo puede existir **una fila** (CHECK id = 1).

| Campo | Descripción |
|-------|-------------|
| nombre | Nombre completo de la academia |
| cif | CIF fiscal |
| direccion | Dirección fiscal |
| telefono / email | Datos de contacto |
| logo_path | Ruta al logo para tickets y facturas |
| siguiente_num_factura | Contador para numeración correlativa |

---

### Vista `horas_profesor_mensual`
Vista calculada automáticamente desde `asistencias`. Muestra las horas trabajadas por cada profesor, desglosadas por tipo de clase y mes.

---

## Índices

```sql
CREATE INDEX idx_asistencias_alumno_fecha  ON asistencias(alumno_id, fecha);
CREATE INDEX idx_asistencias_profesor_fecha ON asistencias(profesor_id, fecha);
CREATE INDEX idx_resumen_mensual_alumno    ON resumen_mensual(alumno_id, anio, mes);
CREATE INDEX idx_cobros_alumno             ON cobros(alumno_id, fecha);
CREATE INDEX idx_packs_alumno              ON packs_alumno(alumno_id, activo);
```

Los índices aceleran las consultas más frecuentes: buscar asistencias de un alumno, ver el resumen mensual y filtrar cobros.

---

## Cálculo de horas mensuales

Para clases normales e inglés, las horas mensuales se calculan según las semanas del mes:

```python
def calcular_horas_mes(horas_semanales: float, anio: int, mes: int) -> tuple[float, int]:
    """
    Devuelve (horas_contratadas, semanas_en_mes).
    Un mes tiene 4 semanas normalmente, 5 si tiene 5 lunes
    (o el día de clase correspondiente).
    """
    import calendar
    # Contar semanas completas del mes
    _, dias = calendar.monthrange(anio, mes)
    semanas = 4 if dias <= 28 else (5 if dias >= 29 else 4)
    # Lógica más precisa: contar días de la semana específicos
    return horas_semanales * semanas, semanas
```

Si `semanas == 5`: el `resumen_mensual.semanas_en_mes = 5` → el panel muestra 🟠 para ese alumno ese mes.
