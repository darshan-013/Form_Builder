-- Migration: Add multiple_choice_grid, star_rating, checkbox_grid field types
-- Date: 2026-03-05 (updated 2026-03-06)
-- Idempotent — safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

-- 1. Drop old grid-specific columns if they were added previously (idempotent)
ALTER TABLE form_fields DROP COLUMN IF EXISTS grid_rows_json^
ALTER TABLE form_fields DROP COLUMN IF EXISTS grid_columns_json^

-- 2. Expand the CHECK constraint to include all field types
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check^

ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
CHECK (field_type IN (
  'text', 'number', 'date', 'time', 'date_time', 'boolean',
  'dropdown', 'radio', 'file',
  'multiple_choice', 'linear_scale',
  'field_group',
  'multiple_choice_grid',
  'star_rating',
  'checkbox_grid'
))^

COMMENT ON COLUMN form_fields.shared_options_id IS 'FK → shared_options: dropdown/radio → flat array; multiple_choice_grid/checkbox_grid → {"rows":[...],"columns":[...]}'^
