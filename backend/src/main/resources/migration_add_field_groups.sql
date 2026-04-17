-- Migration: Add support for Field Groups
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS parent_group_key VARCHAR(100)^

-- Update the check constraint to include 'field_group' and other missing types
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check^
ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check CHECK (field_type IN ('text', 'number', 'date', 'time', 'date_time', 'boolean', 'dropdown', 'radio', 'file', 'multiple_choice', 'linear_scale', 'field_group', 'multiple_choice_grid', 'star_rating', 'checkbox_grid'))^

-- Note: We don't need a foreign key to field_key here because field_key is not unique across forms,
-- but (form_id, field_key) is. The application logic will ensure consistency.
