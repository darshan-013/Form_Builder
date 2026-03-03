-- ═══════════════════════════════════════════════════════════════
-- Update Existing Dropdown/Radio Fields with Sample Options
-- This will add default options to fields that have NULL options_json
-- ═══════════════════════════════════════════════════════════════

-- Check current state (before update)
SELECT
    id,
    label,
    field_type,
    options_json,
    CASE
        WHEN options_json IS NULL THEN 'NULL (needs update)'
        ELSE 'HAS OPTIONS'
    END as status
FROM form_fields
WHERE field_type IN ('dropdown', 'radio')
ORDER BY created_at DESC;

-- Update dropdown fields with NULL options
UPDATE form_fields
SET options_json = '["Option 1","Option 2","Option 3"]'
WHERE field_type = 'dropdown'
AND (options_json IS NULL OR options_json = '' OR options_json = 'null');

-- Update radio fields with NULL options
UPDATE form_fields
SET options_json = '["Yes","No","Maybe"]'
WHERE field_type = 'radio'
AND (options_json IS NULL OR options_json = '' OR options_json = 'null');

-- Verify the update
SELECT
    id,
    label,
    field_type,
    options_json,
    'FIXED' as status
FROM form_fields
WHERE field_type IN ('dropdown', 'radio')
ORDER BY created_at DESC;

-- Count updated fields
SELECT
    field_type,
    COUNT(*) as total_fields
FROM form_fields
WHERE field_type IN ('dropdown', 'radio')
GROUP BY field_type;

