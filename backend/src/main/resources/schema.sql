-- =============================================================
--  Dynamic Form Builder — Fixed Metadata Schema
--  PostgreSQL 17
--  NOTE: Submission tables are NOT defined here.
--        They are created at runtime by DynamicTableService
--        using JdbcTemplate DDL.
-- =============================================================

-- Spring Boot SQL Script Separator (required for PostgreSQL functions with $$)
-- This tells Spring to split statements using ^; instead of just ;
--;

-- ─────────────────────────────────────────────
--  EXTENSIONS
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto"^   -- provides gen_random_uuid()

-- ─────────────────────────────────────────────
--  TABLE: shared_options
--  Stores a canonical options_json that can be
--  referenced by many form_fields rows across
--  many forms. When this row is updated, ALL
--  fields pointing to it see the new options.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_options (
    id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    options_json TEXT      NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
)^

COMMENT ON TABLE  shared_options             IS 'Canonical option lists shared across multiple form fields.'^
COMMENT ON COLUMN shared_options.options_json IS 'JSON array: [{"label":"A","value":"A"},...]'^

-- ─────────────────────────────────────────────
--  TABLE: forms
--  Stores form metadata. One row per form.
--  submission table is derived from code as form_data_<code>.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forms (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(100)  NOT NULL UNIQUE,  -- unique identifier e.g. "employee_onboarding"
    name          VARCHAR(255)  NOT NULL,
    description   TEXT,
    status        VARCHAR(20)   NOT NULL DEFAULT 'DRAFT', -- DRAFT | PUBLISHED | ARCHIVED
    created_by    VARCHAR(100)  NOT NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP     NOT NULL DEFAULT NOW()
)^

-- Ensure columns exist before commenting (for systems with older schemas)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS code VARCHAR(100)^
ALTER TABLE forms ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'^
ALTER TABLE forms ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)^

COMMENT ON TABLE  forms              IS 'Master registry of every form created by admins.'^
COMMENT ON COLUMN forms.code         IS 'Unique string identifier for the form, used in URL logic and table naming.'^

-- ─────────────────────────────────────────────
--  TABLE: form_versions
--  Stores immutable snapshots of a form''s definition.
-- ─────────────────────────────────────────────
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

-- Ensure columns exist before indexing or usage (for systems with older schemas)
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS definition_json JSONB NOT NULL DEFAULT '{}'::jsonb^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'^
ALTER TABLE form_versions DROP COLUMN IF EXISTS status^
ALTER TABLE form_versions DROP COLUMN IF EXISTS published_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS updated_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS is_soft_deleted^
ALTER TABLE form_versions DROP COLUMN IF EXISTS deleted_at^
ALTER TABLE form_versions DROP CONSTRAINT IF EXISTS uk_form_versions_form_id_version_number^
ALTER TABLE form_versions ADD CONSTRAINT uk_form_versions_form_id_version_number UNIQUE (form_id, version_number)^


-- ─────────────────────────────────────────────
--  TABLE: form_fields
--  Each row is a single field definition within
--  a form. Maps 1-to-many from forms → fields.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_fields (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_version_id   UUID         NOT NULL
                                   REFERENCES form_versions (id) ON DELETE CASCADE,
    group_id          UUID,                           -- FK -> form_groups.id
    field_key         VARCHAR(100) NOT NULL,          -- column name in submission table
    label             VARCHAR(150) NOT NULL,          -- human-readable label shown on form
    field_type        VARCHAR(50)  NOT NULL,
    required          BOOLEAN      NOT NULL DEFAULT FALSE,
    default_value     TEXT,
    validation_regex  TEXT,
    validation_json   TEXT,
    ui_config_json    TEXT,
    validation_message TEXT,
    shared_options_id UUID                            -- FK -> shared_options.id
                       REFERENCES shared_options (id) ON DELETE SET NULL,
    is_disabled       BOOLEAN      NOT NULL DEFAULT FALSE,
    is_read_only      BOOLEAN      NOT NULL DEFAULT FALSE,
    field_order       INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_form_field_key UNIQUE (form_version_id, field_key)
)^

-- Ensure columns exist before indexing or usage (for systems with older schemas)
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS form_version_id UUID^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS group_id UUID^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS validation_json TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS ui_config_json TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN DEFAULT FALSE^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS rules_json TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS is_calculated BOOLEAN DEFAULT FALSE^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS formula_expression TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS dependencies_json TEXT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS calc_precision INT^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS lock_after_calc BOOLEAN DEFAULT FALSE^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS validation_message TEXT^

COMMENT ON TABLE  form_fields               IS 'Field definitions for each form. Each field becomes a column in the form''s submission table.'^
COMMENT ON COLUMN form_fields.field_key     IS 'Snake_case identifier used as column name in the dynamic submission table.'^
COMMENT ON COLUMN form_fields.field_type    IS 'Logical type: text→TEXT, number→INTEGER, date→DATE, boolean→BOOLEAN, dropdown→VARCHAR(255), radio→VARCHAR(255), multiple_choice→VARCHAR(255), file→TEXT.'^
COMMENT ON COLUMN form_fields.shared_options_id IS 'FK → shared_options: all dropdown/radio options are stored there, never inline.'^
COMMENT ON COLUMN form_fields.field_order   IS 'Zero-based render order. Builder preserves this order via drag-and-drop.'^


-- ─────────────────────────────────────────────
--  TABLE: field_validation
--  Normalized validation rules per form version.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_validation (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_version_id   UUID         NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    field_key         VARCHAR(100),
    validation_type   VARCHAR(50)  NOT NULL,
    expression        TEXT         NOT NULL,
    error_message     VARCHAR(255) NOT NULL,
    execution_order   INTEGER      NOT NULL DEFAULT 0,
    scope             VARCHAR(20)  NOT NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_field_validation_scope CHECK (scope IN ('FIELD', 'FORM'))
)^

CREATE INDEX IF NOT EXISTS idx_field_validation_version
    ON field_validation (form_version_id)^

CREATE INDEX IF NOT EXISTS idx_field_validation_scope
    ON field_validation (scope)^

CREATE INDEX IF NOT EXISTS idx_field_validation_order
    ON field_validation (form_version_id, execution_order)^

CREATE UNIQUE INDEX IF NOT EXISTS uq_field_validation_rule
    ON field_validation (form_version_id, COALESCE(field_key, '__FORM__'), validation_type, execution_order, scope)^


-- ─────────────────────────────────────────────
--  INDEXES
-- ─────────────────────────────────────────────

-- Speed up all queries that join/filter form_fields by version
CREATE INDEX IF NOT EXISTS idx_form_fields_version_id
    ON form_fields (form_version_id)^

-- Speed up ORDER BY field_order when rendering / previewing a version
CREATE INDEX IF NOT EXISTS idx_form_fields_field_order
    ON form_fields (form_version_id, field_order)^


-- ─────────────────────────────────────────────
--  TRIGGER: auto-update forms.updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql^

CREATE OR REPLACE TRIGGER trg_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at()^


-- ─────────────────────────────────────────────
--  NOTE: Authentication and user profiles are
--  stored in the rbac_users table, created by
--  migration_add_rbac.sql. The old Spring Security
--  users/authorities tables have been dropped.
-- ─────────────────────────────────────────────


-- ─────────────────────────────────────────────
--  TABLE: audit_logs
--  Immutable system audit trail.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id                     BIGSERIAL    PRIMARY KEY,
    action                 VARCHAR(60)  NOT NULL,
    performed_by_user_id   INT,
    performed_by_username  VARCHAR(100) NOT NULL,
    target_entity          VARCHAR(30)  NOT NULL,
    target_entity_id       VARCHAR(100),
    description            TEXT         NOT NULL,
    created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
    metadata               JSONB,
    related_role_id        INT,
    related_role_name      VARCHAR(100),
    related_user_id        INT,
    related_username       VARCHAR(100)
)^

-- Ensure columns exist before indexing or usage (for systems with older schemas)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS related_role_id INT^
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS related_role_name VARCHAR(100)^
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS related_user_id INT^
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS related_username VARCHAR(100)^

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs (created_at)^

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs (action)^

CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by
    ON audit_logs (performed_by_username)^

CREATE INDEX IF NOT EXISTS idx_audit_logs_role
    ON audit_logs (related_role_id)^

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON audit_logs (related_user_id)^

CREATE OR REPLACE FUNCTION fn_prevent_audit_logs_change()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs are immutable';
END;
$$ LANGUAGE plpgsql^

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs^
DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs^

CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_audit_logs_change()^

CREATE TRIGGER trg_audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_audit_logs_change()^

