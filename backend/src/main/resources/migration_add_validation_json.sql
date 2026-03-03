-- =====================================================
-- Migration: Add validation_json column to form_fields
-- Date: 2026-03-02
-- Description: Extends form_fields table with advanced
--              validation rules storage capability
-- =====================================================

-- Add validation_json column (safe - uses IF NOT EXISTS pattern via pg_catalog check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'form_fields'
        AND column_name = 'validation_json'
    ) THEN
        ALTER TABLE form_fields ADD COLUMN validation_json TEXT;
        RAISE NOTICE 'Added validation_json column to form_fields';
    ELSE
        RAISE NOTICE 'validation_json column already exists in form_fields';
    END IF;
END $$;

-- Add comment to document the new column
COMMENT ON COLUMN form_fields.validation_json IS 'JSON object containing advanced validation rules (e.g., {"minLength": 3, "maxLength": 50, "unique": true})';

-- Verify the change
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'form_fields'
ORDER BY ordinal_position;

