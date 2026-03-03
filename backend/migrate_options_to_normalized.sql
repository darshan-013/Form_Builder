-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Convert JSON options to normalized table
-- This script migrates existing options_json data to field_options table
-- ═══════════════════════════════════════════════════════════════

-- First, create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS field_options (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id        UUID          NOT NULL
                                  REFERENCES form_fields (id) ON DELETE CASCADE,
    option_value    VARCHAR(255)  NOT NULL,
    option_order    INT           NOT NULL DEFAULT 0,
    is_default      BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_field_option_value UNIQUE (field_id, option_value),
    CHECK (option_value IS NOT NULL AND option_value != '')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_field_options_field_id ON field_options (field_id);
CREATE INDEX IF NOT EXISTS idx_field_options_order ON field_options (field_id, option_order);
CREATE INDEX IF NOT EXISTS idx_field_options_active ON field_options (field_id, is_active);


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION PROCEDURE
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
    field_record RECORD;
    options_array TEXT[];
    option_text TEXT;
    order_num INT;
    migrated_count INT := 0;
    error_count INT := 0;
BEGIN
    RAISE NOTICE 'Starting migration of JSON options to normalized table...';
    RAISE NOTICE '';

    -- Loop through all dropdown/radio fields that have options_json
    FOR field_record IN
        SELECT
            ff.id,
            ff.label,
            ff.field_type,
            ff.options_json,
            f.name as form_name
        FROM form_fields ff
        JOIN forms f ON ff.form_id = f.id
        WHERE ff.field_type IN ('dropdown', 'radio')
        AND ff.options_json IS NOT NULL
        AND ff.options_json != ''
        AND ff.options_json != 'null'
        ORDER BY ff.created_at
    LOOP
        BEGIN
            -- Parse JSON array to PostgreSQL array
            SELECT ARRAY(
                SELECT jsonb_array_elements_text(field_record.options_json::jsonb)
            ) INTO options_array;

            -- Skip if array is empty
            IF array_length(options_array, 1) IS NULL OR array_length(options_array, 1) = 0 THEN
                RAISE NOTICE '  ⚠ Skipped field "%" (%) - empty options array',
                    field_record.label, field_record.field_type;
                CONTINUE;
            END IF;

            -- Insert each option as a separate row
            order_num := 0;
            FOREACH option_text IN ARRAY options_array
            LOOP
                INSERT INTO field_options (field_id, option_value, option_order, is_default, is_active)
                VALUES (field_record.id, option_text, order_num, false, true)
                ON CONFLICT (field_id, option_value) DO NOTHING;  -- skip duplicates

                order_num := order_num + 1;
            END LOOP;

            migrated_count := migrated_count + 1;
            RAISE NOTICE '  ✓ Migrated % options for field "%" (%) in form "%"',
                array_length(options_array, 1),
                field_record.label,
                field_record.field_type,
                field_record.form_name;

        EXCEPTION
            WHEN OTHERS THEN
                error_count := error_count + 1;
                RAISE WARNING '  ✗ Failed to migrate field "%" (%): %',
                    field_record.label, field_record.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════';
    RAISE NOTICE 'Migration Summary:';
    RAISE NOTICE '  ✓ Successfully migrated: % fields', migrated_count;
    RAISE NOTICE '  ✗ Errors: % fields', error_count;
    RAISE NOTICE '════════════════════════════════════════════════════════';

END $$;


-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Show migrated options
RAISE NOTICE '';
RAISE NOTICE 'Migrated Options:';
RAISE NOTICE '';

SELECT
    f.name AS form_name,
    ff.label AS field_label,
    ff.field_type,
    COUNT(fo.id) AS option_count,
    STRING_AGG(fo.option_value, ', ' ORDER BY fo.option_order) AS options
FROM form_fields ff
JOIN forms f ON ff.form_id = f.id
LEFT JOIN field_options fo ON ff.id = fo.field_id
WHERE ff.field_type IN ('dropdown', 'radio')
GROUP BY f.id, f.name, ff.id, ff.label, ff.field_type
ORDER BY f.created_at DESC, ff.field_order;


-- Check for fields without normalized options
SELECT
    f.name AS form_name,
    ff.label AS field_label,
    ff.field_type,
    CASE
        WHEN ff.options_json IS NULL THEN 'No JSON options'
        WHEN ff.options_json = '' THEN 'Empty JSON'
        WHEN ff.options_json = 'null' THEN 'Null string'
        ELSE 'Has JSON: ' || LEFT(ff.options_json, 50)
    END AS status
FROM form_fields ff
JOIN forms f ON ff.form_id = f.id
LEFT JOIN field_options fo ON ff.id = fo.field_id
WHERE ff.field_type IN ('dropdown', 'radio')
    AND fo.id IS NULL
ORDER BY f.created_at DESC;


-- ═══════════════════════════════════════════════════════════════
-- OPTIONAL: Clear options_json after successful migration
-- Uncomment the line below ONLY if you want to fully switch to normalized
-- and no longer need the JSON column
-- ═══════════════════════════════════════════════════════════════

-- UPDATE form_fields SET options_json = NULL WHERE field_type IN ('dropdown', 'radio');

