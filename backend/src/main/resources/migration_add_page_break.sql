-- Migration: Add page_break to static_form_fields field_type CHECK constraint
-- Date: 2026-03-09
-- Idempotent — safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

-- Drop old constraint and recreate to include page_break
ALTER TABLE static_form_fields
    DROP CONSTRAINT IF EXISTS static_form_fields_field_type_check^

ALTER TABLE static_form_fields
    ADD CONSTRAINT static_form_fields_field_type_check
    CHECK (field_type IN ('section_header','label_text','description_block','page_break'))^
