-- Migration to add Calculated Fields support to form_fields table
-- Uses IF NOT EXISTS so the script is safe to re-run on startup
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS is_calculated BOOLEAN DEFAULT FALSE^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS formula_expression TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS dependencies_json TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS calc_precision INTEGER^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS lock_after_calc BOOLEAN DEFAULT FALSE^
