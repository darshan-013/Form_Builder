-- =====================================================
-- MIGRATION — formbuilder DB
-- Run in pgAdmin → Query Tool against: formbuilder
-- =====================================================

-- STEP 1: Create shared_options table (must exist before FK)
CREATE TABLE IF NOT EXISTS shared_options (
    id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    options_json TEXT      NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- STEP 2: Add shared_options_id UUID FK to form_fields
ALTER TABLE form_fields
    ADD COLUMN IF NOT EXISTS shared_options_id UUID
    REFERENCES shared_options(id) ON DELETE SET NULL;

-- STEP 3: Drop the old inline options_json column from form_fields
ALTER TABLE form_fields DROP COLUMN IF EXISTS options_json;

-- STEP 4: Drop other obsolete columns (safe if already gone)
ALTER TABLE form_fields DROP COLUMN IF EXISTS source_field_id;
ALTER TABLE form_fields DROP COLUMN IF EXISTS dropdown_schema_id;

-- STEP 5: Drop abandoned tables (safe if already gone)
DROP TABLE IF EXISTS field_options    CASCADE;
DROP TABLE IF EXISTS dropdown_options CASCADE;
DROP TABLE IF EXISTS dropdown_schemas CASCADE;

-- VERIFY: form_fields columns (should show shared_options_id, NO options_json)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'form_fields'
ORDER BY ordinal_position;

-- VERIFY: all public tables (should show shared_options, NOT dropdown_schemas etc.)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
