-- Migration: Add grid_json and table_ref_json columns to form_fields
-- Date: 2026-03-26
-- Idempotent — safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS grid_json TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS table_ref_json TEXT^
