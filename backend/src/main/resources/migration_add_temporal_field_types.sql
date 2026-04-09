-- Migration: Add time/date_time field type support
-- Date: 2026-04-09
-- Idempotent -- safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check^

ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
CHECK (field_type IN (
    'text', 'number', 'date', 'time', 'date_time', 'boolean',
    'dropdown', 'radio', 'file', 'multiple_choice', 'linear_scale',
    'field_group', 'multiple_choice_grid', 'star_rating', 'checkbox_grid'
))^

COMMENT ON COLUMN form_fields.field_type IS 'Logical type: text->TEXT, number->INTEGER, date->DATE, time->TIME, date_time->TIMESTAMP, boolean->BOOLEAN, dropdown->VARCHAR(255), radio->VARCHAR(255), multiple_choice->TEXT, linear_scale->INTEGER, star_rating->INTEGER, file->TEXT, multiple_choice_grid->TEXT, checkbox_grid->TEXT.'^

