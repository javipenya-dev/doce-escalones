-- ============================================================
-- ACADEMIA - ESQUEMA DE BASE DE DATOS COMPLETO
-- ============================================================

-- ------------------------------------------------------------
-- USUARIOS DEL SISTEMA (admins y profesores)
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE,
    pin             VARCHAR(6) NOT NULL,          -- PIN de acceso a la app móvil
    rol             VARCHAR(10) NOT NULL CHECK (rol IN ('admin', 'profesor')),
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TIPOS DE CLASE
-- ------------------------------------------------------------
CREATE TABLE tipos_clase (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,        -- ej: "Clases Normales", "Inglés", "Logopedia"
    categoria       VARCHAR(10) NOT NULL CHECK (categoria IN ('normal', 'ingles', 'sesion')),
    activo          BOOLEAN DEFAULT TRUE
);

-- ------------------------------------------------------------
-- DURACIONES DE SESIÓN (solo para categoría 'sesion')
-- ------------------------------------------------------------
CREATE TABLE duraciones_sesion (
    id              SERIAL PRIMARY KEY,
    tipo_clase_id   INT REFERENCES tipos_clase(id),
    duracion_min    INT NOT NULL,                 -- duración en minutos (ej: 45, 60)
    descripcion     VARCHAR(100)                  -- ej: "Sesión estándar 45min"
);

-- ------------------------------------------------------------
-- ALUMNOS
-- ------------------------------------------------------------
CREATE TABLE alumnos (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(150) NOT NULL,
    fecha_nacimiento DATE,
    fecha_inscripcion DATE NOT NULL DEFAULT CURRENT_DATE,
    telefono1       VARCHAR(20),
    telefono2       VARCHAR(20),
    direccion       TEXT,
    email           VARCHAR(150),
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- RELACIÓN DE HERMANOS
-- ------------------------------------------------------------
CREATE TABLE hermanos (
    alumno_id_1     INT REFERENCES alumnos(id) ON DELETE CASCADE,
    alumno_id_2     INT REFERENCES alumnos(id) ON DELETE CASCADE,
    PRIMARY KEY (alumno_id_1, alumno_id_2),
    CHECK (alumno_id_1 < alumno_id_2)            -- evita duplicados (A,B) y (B,A)
);

-- ------------------------------------------------------------
-- TARIFAS (plantillas reutilizables)
-- ------------------------------------------------------------
CREATE TABLE tarifas (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,        -- ej: "Bono 2h/semana Inglés"
    tipo_clase_id   INT REFERENCES tipos_clase(id),
    categoria       VARCHAR(10) NOT NULL CHECK (categoria IN ('normal', 'ingles', 'sesion')),

    -- Para clases normales e inglés
    horas_semanales NUMERIC(4,1),                -- ej: 2.0 horas/semana
    -- horas_mensuales se calcula: horas_semanales * 4

    -- Para sesiones
    num_sesiones    INT,                         -- nulo si es sesión suelta
    es_bono_sesion  BOOLEAN DEFAULT FALSE,
    duracion_sesion_min INT,                     -- duración fija de cada sesión

    precio_base     NUMERIC(8,2) NOT NULL,
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PACKS CONTRATADOS POR ALUMNO
-- ------------------------------------------------------------
CREATE TABLE packs_alumno (
    id              SERIAL PRIMARY KEY,
    alumno_id       INT REFERENCES alumnos(id) ON DELETE CASCADE,
    tarifa_id       INT REFERENCES tarifas(id),
    profesor_id     INT REFERENCES usuarios(id),  -- profesor asignado (puede cambiar)
    fecha_inicio    DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_fin       DATE,                         -- NULL = sin caducidad
    activo          BOOLEAN DEFAULT TRUE,
    notas           TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ASISTENCIAS
-- ------------------------------------------------------------
CREATE TABLE asistencias (
    id              SERIAL PRIMARY KEY,
    alumno_id       INT REFERENCES alumnos(id),
    pack_alumno_id  INT REFERENCES packs_alumno(id),
    profesor_id     INT REFERENCES usuarios(id),
    tipo_clase_id   INT REFERENCES tipos_clase(id),
    fecha           DATE NOT NULL,
    hora_inicio     TIME,
    duracion_min    INT NOT NULL,                -- duración real de la clase/sesión
    es_sesion       BOOLEAN DEFAULT FALSE,

    -- Control offline
    sincronizado    BOOLEAN DEFAULT TRUE,
    uuid_local      VARCHAR(36) UNIQUE,          -- UUID generado en el móvil offline
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CONTADOR MENSUAL POR ALUMNO Y PACK (cache calculada)
-- Se recalcula cada vez que entra una asistencia
-- ------------------------------------------------------------
CREATE TABLE resumen_mensual (
    id              SERIAL PRIMARY KEY,
    alumno_id       INT REFERENCES alumnos(id),
    pack_alumno_id  INT REFERENCES packs_alumno(id),
    anio            INT NOT NULL,
    mes             INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    horas_consumidas NUMERIC(5,2) DEFAULT 0,
    sesiones_consumidas INT DEFAULT 0,
    semanas_en_mes  INT DEFAULT 4,               -- 4 o 5 (mes largo)
    horas_contratadas NUMERIC(5,2),              -- calculado al inicio del mes
    sesiones_contratadas INT,
    UNIQUE (pack_alumno_id, anio, mes)
);

-- ------------------------------------------------------------
-- COBROS
-- ------------------------------------------------------------
CREATE TABLE cobros (
    id              SERIAL PRIMARY KEY,
    alumno_id       INT REFERENCES alumnos(id),
    admin_id        INT REFERENCES usuarios(id),
    fecha           TIMESTAMP NOT NULL DEFAULT NOW(),
    subtotal        NUMERIC(8,2) NOT NULL,
    descuento_hermano_pct NUMERIC(5,2) DEFAULT 0,    -- siempre 10% si aplica
    descuento_extra_pct   NUMERIC(5,2) DEFAULT 0,    -- descuento libre %
    descuento_extra_importe NUMERIC(8,2) DEFAULT 0,  -- descuento libre €
    total           NUMERIC(8,2) NOT NULL,
    anulado         BOOLEAN DEFAULT FALSE,
    fecha_anulacion TIMESTAMP,
    admin_anulacion_id INT REFERENCES usuarios(id),
    notas           TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- DETALLE DE FORMAS DE PAGO POR COBRO (mixto posible)
-- ------------------------------------------------------------
CREATE TABLE cobros_pagos (
    id              SERIAL PRIMARY KEY,
    cobro_id        INT REFERENCES cobros(id) ON DELETE CASCADE,
    forma_pago      VARCHAR(20) NOT NULL CHECK (forma_pago IN ('efectivo', 'tarjeta', 'bizum', 'transferencia')),
    importe         NUMERIC(8,2) NOT NULL
);

-- ------------------------------------------------------------
-- DETALLE DE PACKS INCLUIDOS EN CADA COBRO
-- ------------------------------------------------------------
CREATE TABLE cobros_packs (
    id              SERIAL PRIMARY KEY,
    cobro_id        INT REFERENCES cobros(id) ON DELETE CASCADE,
    pack_alumno_id  INT REFERENCES packs_alumno(id),
    importe         NUMERIC(8,2) NOT NULL
);

-- ------------------------------------------------------------
-- FACTURAS
-- ------------------------------------------------------------
CREATE TABLE facturas (
    id              SERIAL PRIMARY KEY,
    cobro_id        INT REFERENCES cobros(id) UNIQUE,
    numero          VARCHAR(20) UNIQUE NOT NULL,  -- ej: FAC-2026-001
    fecha_emision   DATE NOT NULL DEFAULT CURRENT_DATE,
    nombre_fiscal   VARCHAR(200),
    nif             VARCHAR(20),
    direccion_fiscal TEXT,
    email_envio     VARCHAR(150),
    total           NUMERIC(8,2) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- HORAS TRABAJADAS POR PROFESOR (calculado de asistencias)
-- ------------------------------------------------------------
CREATE VIEW horas_profesor_mensual AS
SELECT
    u.id AS profesor_id,
    u.nombre || ' ' || u.apellidos AS profesor,
    tc.nombre AS tipo_clase,
    EXTRACT(YEAR FROM a.fecha)::INT AS anio,
    EXTRACT(MONTH FROM a.fecha)::INT AS mes,
    COUNT(*) AS num_clases,
    SUM(a.duracion_min) / 60.0 AS horas_trabajadas
FROM asistencias a
JOIN usuarios u ON u.id = a.profesor_id
JOIN tipos_clase tc ON tc.id = a.tipo_clase_id
GROUP BY u.id, u.nombre, u.apellidos, tc.nombre, anio, mes
ORDER BY anio DESC, mes DESC, profesor;

-- ------------------------------------------------------------
-- DATOS FISCALES DE LA ACADEMIA (una sola fila)
-- ------------------------------------------------------------
CREATE TABLE academia_config (
    id              INT PRIMARY KEY DEFAULT 1,
    nombre          VARCHAR(200) NOT NULL,
    cif             VARCHAR(20),
    direccion       TEXT,
    telefono        VARCHAR(20),
    email           VARCHAR(150),
    logo_path       VARCHAR(300),
    siguiente_num_factura INT DEFAULT 1,
    CHECK (id = 1)                               -- solo una fila posible
);

-- ------------------------------------------------------------
-- ÍNDICES PARA RENDIMIENTO
-- ------------------------------------------------------------
CREATE INDEX idx_asistencias_alumno_fecha ON asistencias(alumno_id, fecha);
CREATE INDEX idx_asistencias_profesor_fecha ON asistencias(profesor_id, fecha);
CREATE INDEX idx_resumen_mensual_alumno ON resumen_mensual(alumno_id, anio, mes);
CREATE INDEX idx_cobros_alumno ON cobros(alumno_id, fecha);
CREATE INDEX idx_packs_alumno ON packs_alumno(alumno_id, activo);
