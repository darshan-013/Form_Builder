-- Migration: Add Form Versioning Support
-- This script introduces the form_versions table and refactors existing associations.

-- 1. Create form_versions table
CREATE TABLE IF NOT EXISTS form_versions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id         UUID            NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    version_number  INTEGER         NOT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT FALSE,
    definition_json JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_by      VARCHAR(100)    NOT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    UNIQUE(form_id, version_number)
)^

ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS definition_json JSONB NOT NULL DEFAULT '{}'::jsonb^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'^
ALTER TABLE form_versions DROP COLUMN IF EXISTS status^
ALTER TABLE form_versions DROP COLUMN IF EXISTS published_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS updated_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS is_soft_deleted^
ALTER TABLE form_versions DROP COLUMN IF EXISTS deleted_at^

-- 2. Add form_version_id to related tables
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS form_version_id UUID REFERENCES form_versions(id) ON DELETE CASCADE^
ALTER TABLE form_groups ADD COLUMN IF NOT EXISTS form_version_id UUID REFERENCES form_versions(id) ON DELETE CASCADE^
ALTER TABLE static_form_fields ADD COLUMN IF NOT EXISTS form_version_id UUID REFERENCES form_versions(id) ON DELETE CASCADE^

-- 3. Data Migration: Create a default version for every existing form
INSERT INTO form_versions (id, form_id, version_number, is_active, definition_json, created_by, created_at)
SELECT gen_random_uuid(), id, 1,
       CASE WHEN status::text = 'PUBLISHED' THEN TRUE ELSE FALSE END,
       '{}'::jsonb,
       created_by,
       NOW()
FROM forms f
WHERE NOT EXISTS (SELECT 1 FROM form_versions fv WHERE fv.form_id = f.id)^

-- 3.1 Link existing fields/groups to this initial version
-- (Only runs if form_id still exists — idempotent guard)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'form_fields' AND column_name = 'form_id'
    ) THEN
        UPDATE form_fields ff
        SET form_version_id = fv.id
        FROM form_versions fv
        WHERE ff.form_id = fv.form_id AND ff.form_version_id IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'form_groups' AND column_name = 'form_id'
    ) THEN
        UPDATE form_groups fg
        SET form_version_id = fv.id
        FROM form_versions fv
        WHERE fg.form_id = fv.form_id AND fg.form_version_id IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'static_form_fields' AND column_name = 'form_id'
    ) THEN
        UPDATE static_form_fields sff
        SET form_version_id = fv.id
        FROM form_versions fv
        WHERE sff.form_id = fv.form_id AND sff.form_version_id IS NULL;
    END IF;
END $$^

-- 4. Constraints cleanup
-- After migration, everything should have a version. 
-- We drop the legacy form_id columns as they are no longer used by JPA entities.

-- First, recreate the unique constraint on form_version_id + field_key (replaces old form_id + field_key)
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS uq_form_field_key^
ALTER TABLE form_fields ADD CONSTRAINT uq_form_field_key UNIQUE (form_version_id, field_key)^

ALTER TABLE form_fields DROP COLUMN IF EXISTS form_id^
ALTER TABLE form_groups DROP COLUMN IF EXISTS form_id^
ALTER TABLE static_form_fields DROP COLUMN IF EXISTS form_id^

-- Ensure form_version_id is NOT NULL now that migration is complete
ALTER TABLE form_fields ALTER COLUMN form_version_id SET NOT NULL^
ALTER TABLE form_groups ALTER COLUMN form_version_id SET NOT NULL^
ALTER TABLE static_form_fields ALTER COLUMN form_version_id SET NOT NULL^

-- 5. Add version tracking to dynamic tables (base column)
-- This logic will be applied to NEW tables automatically via Java, 
-- but for existing ones, Java will use "ADD COLUMN IF NOT EXISTS" logic.
