-- migration_add_submission_meta.sql
-- Establish form_submission_meta index and align form_versions

-- 1. Create submission meta index
CREATE TABLE IF NOT EXISTS form_submission_meta (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id            UUID         NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    form_version_id    UUID         NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
    submission_table   VARCHAR(150) NOT NULL,
    submission_row_id  UUID         NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'DRAFT', -- DRAFT | SUBMITTED
    submitted_by       VARCHAR(100),
    submitted_at       TIMESTAMP,
    created_at         TIMESTAMP    NOT NULL DEFAULT NOW()
)^

CREATE INDEX IF NOT EXISTS idx_sub_meta_form_id_status ON form_submission_meta(form_id, status)^
CREATE INDEX IF NOT EXISTS idx_sub_meta_version_id ON form_submission_meta(form_version_id)^

-- 2. Align form_versions with Rule-based ground truth
-- Adding is_active column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_versions' AND column_name='is_active') THEN
        ALTER TABLE form_versions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$^

-- Migrate existing 'PUBLISHED' status to is_active = true
UPDATE form_versions SET is_active = TRUE WHERE status = 'PUBLISHED'^

-- 3. Integrity Constraint: Only one active version per form
-- This is naturally enforced by application logic (publishForm), 
-- but we can add a partial unique index for safety
DROP INDEX IF EXISTS uq_active_version_per_form^
CREATE UNIQUE INDEX uq_active_version_per_form ON form_versions (form_id) WHERE (is_active = TRUE)^
