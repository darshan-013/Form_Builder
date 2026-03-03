-- Migration script to add options_json column to existing form_fields table
-- Run this manually if the table already exists

-- Add options_json column
ALTER TABLE form_fields
ADD COLUMN IF NOT EXISTS options_json TEXT;

-- Update the CHECK constraint to include new field types
ALTER TABLE form_fields
DROP CONSTRAINT IF EXISTS form_fields_field_type_check;

ALTER TABLE form_fields
ADD CONSTRAINT form_fields_field_type_check
CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'dropdown', 'radio', 'file'));

-- Add comment
COMMENT ON COLUMN form_fields.options_json IS 'JSON array of options for dropdown/radio fields (e.g., ["Option 1", "Option 2"])';

