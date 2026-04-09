-- migration_add_submission_meta.sql
-- Establish form_submission_meta index and align form_versions

-- 1. Create submission meta index
CREATE TABLE IF NOT EXISTS form_submission_meta (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id            UUID         NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    form_version_id    UUID         NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
    submission_table   VARCHAR(255) NOT NULL,
    submission_row_id  UUID         NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'DRAFT', -- DRAFT | SUBMITTED
    submitted_by       VARCHAR(100),
    submitted_at       TIMESTAMP,
    created_at         TIMESTAMP    NOT NULL DEFAULT NOW()
)^

-- Backward-compatible alignment for instances created by legacy initializer
ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(100)^
ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP^
ALTER TABLE form_submission_meta ALTER COLUMN submission_table TYPE VARCHAR(255)^

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='form_submission_meta' AND column_name='user_id'
    ) THEN
        UPDATE form_submission_meta
        SET submitted_by = user_id
        WHERE submitted_by IS NULL AND user_id IS NOT NULL;
    END IF;
END $$^

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='form_submission_meta' AND column_name='updated_at'
    ) THEN
        UPDATE form_submission_meta
        SET submitted_at = updated_at
        WHERE submitted_at IS NULL AND status = 'SUBMITTED';
    END IF;
END $$^

CREATE INDEX IF NOT EXISTS idx_sub_meta_form_id_status ON form_submission_meta(form_id, status)^
CREATE INDEX IF NOT EXISTS idx_sub_meta_version_id ON form_submission_meta(form_version_id)^

-- 2. Align form_versions with Rule-based ground truth
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_versions' AND column_name='is_active') THEN
        ALTER TABLE form_versions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_versions' AND column_name='definition_json') THEN
        ALTER TABLE form_versions ADD COLUMN definition_json JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_versions' AND column_name='created_by') THEN
        ALTER TABLE form_versions ADD COLUMN created_by VARCHAR(100) NOT NULL DEFAULT 'system';
    END IF;
END $$^

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='form_versions' AND column_name='status'
    ) THEN
        UPDATE form_versions
        SET is_active = TRUE
        WHERE status = 'PUBLISHED' AND is_active = FALSE;
    END IF;
END $$^

ALTER TABLE form_versions DROP COLUMN IF EXISTS status^
ALTER TABLE form_versions DROP COLUMN IF EXISTS published_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS updated_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS is_soft_deleted^
ALTER TABLE form_versions DROP COLUMN IF EXISTS deleted_at^

ALTER TABLE form_versions DROP CONSTRAINT IF EXISTS uk_form_versions_form_id_version_number^
ALTER TABLE form_versions ADD CONSTRAINT uk_form_versions_form_id_version_number UNIQUE (form_id, version_number)^

-- 3. Integrity Constraint: Only one active version per form
-- This is naturally enforced by application logic (publishForm), 
-- but we can add a partial unique index for safety
DROP INDEX IF EXISTS uq_active_version_per_form^
CREATE UNIQUE INDEX uq_active_version_per_form ON form_versions (form_id) WHERE (is_active = TRUE)^

-- 4. Normalize validation rules while keeping form_fields intact
CREATE TABLE IF NOT EXISTS field_validation (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_version_id   UUID         NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    field_key         VARCHAR(100),
    validation_type   VARCHAR(50)  NOT NULL,
    expression        TEXT         NOT NULL,
    error_message     VARCHAR(255) NOT NULL,
    execution_order   INTEGER      NOT NULL DEFAULT 0,
    scope             VARCHAR(20)  NOT NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
)^

ALTER TABLE field_validation ADD COLUMN IF NOT EXISTS validation_type VARCHAR(50)^
ALTER TABLE field_validation ADD COLUMN IF NOT EXISTS execution_order INTEGER^
ALTER TABLE field_validation ADD COLUMN IF NOT EXISTS scope VARCHAR(20)^
ALTER TABLE field_validation ALTER COLUMN execution_order SET DEFAULT 0^
ALTER TABLE field_validation ALTER COLUMN execution_order SET NOT NULL^

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_field_validation_scope'
    ) THEN
        ALTER TABLE field_validation
        ADD CONSTRAINT ck_field_validation_scope CHECK (scope IN ('FIELD', 'FORM'));
    END IF;
END $$^

CREATE INDEX IF NOT EXISTS idx_field_validation_version ON field_validation(form_version_id)^
CREATE INDEX IF NOT EXISTS idx_field_validation_scope ON field_validation(scope)^
CREATE INDEX IF NOT EXISTS idx_field_validation_order ON field_validation(form_version_id, execution_order)^
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_validation_rule
    ON field_validation (form_version_id, COALESCE(field_key, '__FORM__'), validation_type, execution_order, scope)^

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'custom_validation_rules'
    ) THEN
        INSERT INTO field_validation (
            id, form_version_id, field_key, validation_type, expression, error_message, execution_order, scope, created_at
        )
        SELECT
            cvr.id,
            cvr.form_version_id,
            CASE WHEN cvr.scope = 'FORM' THEN NULL ELSE NULLIF(cvr.field_key, '__general__') END,
            'CUSTOM',
            cvr.expression,
            LEFT(COALESCE(cvr.error_message, 'Validation failed'), 255),
            COALESCE(cvr.execution_order, 0),
            COALESCE(cvr.scope, 'FIELD'),
            COALESCE(cvr.created_at, NOW())
        FROM custom_validation_rules cvr
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$^

INSERT INTO field_validation (
    form_version_id, field_key, validation_type, expression, error_message, execution_order, scope
)
SELECT
    ff.form_version_id,
    ff.field_key,
    'REQUIRED',
    'required',
    LEFT(COALESCE(ff.validation_message, ff.label || ' is required'), 255),
    0,
    'FIELD'
FROM form_fields ff
WHERE ff.required = TRUE
ON CONFLICT DO NOTHING^

INSERT INTO field_validation (
    form_version_id, field_key, validation_type, expression, error_message, execution_order, scope
)
SELECT
    ff.form_version_id,
    ff.field_key,
    'REGEX',
    ff.validation_regex,
    LEFT(COALESCE(ff.validation_message, ff.label || ' format is invalid'), 255),
    10,
    'FIELD'
FROM form_fields ff
WHERE ff.validation_regex IS NOT NULL AND BTRIM(ff.validation_regex) <> ''
ON CONFLICT DO NOTHING^

