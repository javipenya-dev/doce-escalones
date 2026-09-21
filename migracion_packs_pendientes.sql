-- ============================================================
-- Migración: Sistema de Packs Pendientes
-- Añade categoria_pendiente a packs_alumno + índice único parcial
-- Fecha: 25 junio 2026
-- ============================================================
--
-- IMPORTANTE: Ejecutar este script UNA SOLA VEZ en la base de datos
-- real (sobremesa, 192.168.1.156) usando pgAdmin o psql.
-- Es seguro: solo añade una columna nueva (nullable) y un índice,
-- no borra ni modifica ningún dato existente de los 1861 alumnos.
--
-- Cómo ejecutarlo:
--   1. Abrir pgAdmin → conectar a la base de datos doce_escalones
--   2. Abrir Query Tool
--   3. Pegar este script completo y ejecutar (F5)
--   4. Verificar que dice "Query returned successfully" sin errores
-- ============================================================


-- 1. Añadir la columna nueva (nullable, no rompe nada existente)
ALTER TABLE packs_alumno
ADD COLUMN IF NOT EXISTS categoria_pendiente VARCHAR(10);

-- 2. Añadir el CHECK constraint para que solo acepte los 3 valores válidos
--    (mismo enum que ya usa la columna categoria de tarifas)
ALTER TABLE packs_alumno
ADD CONSTRAINT IF NOT EXISTS chk_categoria_pendiente
CHECK (categoria_pendiente IS NULL OR categoria_pendiente IN ('normal', 'ingles', 'sesion'));

-- 3. Crear el índice único PARCIAL — solo aplica mientras tarifa_id es NULL
--    Esto evita que se creen dos packs pendientes de la misma categoría
--    para el mismo alumno (protección ante condición de carrera).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pack_pendiente_alumno_categoria
ON packs_alumno (alumno_id, categoria_pendiente)
WHERE tarifa_id IS NULL;

-- ============================================================
-- Verificación post-migración (ejecutar para confirmar que todo fue bien)
-- ============================================================

-- Debe mostrar la columna nueva en la lista:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'packs_alumno'
-- ORDER BY ordinal_position;

-- Debe mostrar el índice nuevo:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'packs_alumno';

-- Confirmar que NINGÚN dato existente se vio afectado (debe dar el mismo
-- número de filas que tenías antes de la migración):
-- SELECT COUNT(*) FROM packs_alumno;