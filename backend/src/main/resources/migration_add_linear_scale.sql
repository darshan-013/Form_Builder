-- Migration: Add linear_scale field type + ui_config_json column
-- Date: 2026-03-05
-- Idempotent — safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

-- 1. Add ui_config_json column if it doesn't exist
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS ui_config_json TEXT^

-- 2. The constraint was already updated by migration_add_multiple_choice.sql
--    (which now includes linear_scale). Nothing more needed here.

COMMENT ON COLUMN form_fields.ui_config_json IS 'UI config JSON: linear_scale stores {scaleMin,scaleMax,labelLeft,labelRight}'^
