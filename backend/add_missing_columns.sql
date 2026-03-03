-- ═══════════════════════════════════════════════════════════════
-- Add options_json and validation_json columns if missing
-- Run this script directly in PostgreSQL if columns are missing
-- ═══════════════════════════════════════════════════════════════

-- Check if options_json column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'form_fields'
        AND column_name = 'options_json'
    ) THEN
        ALTER TABLE form_fields ADD COLUMN options_json TEXT;
        RAISE NOTICE 'Added options_json column to form_fields';
    ELSE
        RAISE NOTICE 'options_json column already exists';
    END IF;
END $$;

-- Check if validation_json column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'form_fields'
        AND column_name = 'validation_json'
    ) THEN
        ALTER TABLE form_fields ADD COLUMN validation_json TEXT;
        RAISE NOTICE 'Added validation_json column to form_fields';
    ELSE
        RAISE NOTICE 'validation_json column already exists';
    END IF;
END $$;

-- Verify columns exist
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'form_fields'
AND column_name IN ('options_json', 'validation_json')
ORDER BY column_name;

