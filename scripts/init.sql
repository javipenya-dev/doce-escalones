-- ============================================================
-- DATOS INICIALES — Academia 12 Escalones
-- Se ejecuta automáticamente al crear el contenedor PostgreSQL
-- ============================================================

-- Configuración de la academia
INSERT INTO academia_config (id, nombre, cif, direccion, telefono, email, siguiente_num_factura)
VALUES (1, '12 Escalones', '', 'Jerez de la Frontera', '', '', 1)
ON CONFLICT (id) DO NOTHING;

-- Tipos de clase base
INSERT INTO tipos_clase (nombre, categoria, activo) VALUES
  ('Apoyo escolar',  'normal', true),
  ('Inglés',         'ingles', true),
  ('Logopedia',      'sesion', true),
  ('Psicología',     'sesion', true)
ON CONFLICT DO NOTHING;

-- Duraciones de sesión
INSERT INTO duraciones_sesion (tipo_clase_id, duracion_min, descripcion)
SELECT id, 45,  'Sesión 45 min' FROM tipos_clase WHERE nombre = 'Logopedia'
ON CONFLICT DO NOTHING;

INSERT INTO duraciones_sesion (tipo_clase_id, duracion_min, descripcion)
SELECT id, 60,  'Sesión 60 min' FROM tipos_clase WHERE nombre = 'Logopedia'
ON CONFLICT DO NOTHING;

INSERT INTO duraciones_sesion (tipo_clase_id, duracion_min, descripcion)
SELECT id, 60,  'Sesión 60 min' FROM tipos_clase WHERE nombre = 'Psicología'
ON CONFLICT DO NOTHING;
