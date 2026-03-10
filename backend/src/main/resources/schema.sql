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
--  table_name is the name of the dynamically
--  created submission table (e.g. form_a3b8d1b6).
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forms (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(150)  NOT NULL,
    description   TEXT,
    table_name    VARCHAR(150)  NOT NULL UNIQUE,   -- e.g. "form_a3b8d1b6"
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP     NOT NULL DEFAULT NOW()
)^

COMMENT ON TABLE  forms              IS 'Master registry of every form created by admins.'^
COMMENT ON COLUMN forms.table_name  IS 'Name of the dedicated PostgreSQL table that stores submissions for this form.'^


-- ─────────────────────────────────────────────
--  TABLE: form_fields
--  Each row is a single field definition within
--  a form. Maps 1-to-many from forms → fields.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_fields (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id           UUID         NOT NULL
                                   REFERENCES forms (id) ON DELETE CASCADE,
    field_key         VARCHAR(100) NOT NULL,          -- column name in submission table
    label             VARCHAR(150) NOT NULL,          -- human-readable label shown on form
    field_type        VARCHAR(50)  NOT NULL            -- text | number | date | boolean | dropdown | radio | file | multiple_choice | linear_scale | field_group | grid_types
                                   CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'dropdown', 'radio', 'file', 'multiple_choice', 'linear_scale', 'field_group', 'multiple_choice_grid', 'star_rating', 'checkbox_grid')),
    required          BOOLEAN      NOT NULL DEFAULT FALSE,
    default_value     TEXT,
    validation_regex  TEXT,                           -- optional client+server-side regex
    validation_json   TEXT,                           -- advanced validation rules (JSON object)
    ui_config_json    TEXT,                           -- UI configuration JSON (e.g. scale min/max, labels)
    shared_options_id UUID                            -- FK → shared_options.id (required for dropdown/radio)
                       REFERENCES shared_options (id) ON DELETE SET NULL,
    is_disabled       BOOLEAN      NOT NULL DEFAULT FALSE,
    is_read_only      BOOLEAN      NOT NULL DEFAULT FALSE,
    field_order       INT          NOT NULL DEFAULT 0, -- render order in builder/preview
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),

    -- ── Constraints ──────────────────────────
    CONSTRAINT uq_form_field_key UNIQUE (form_id, field_key)  -- no duplicate column names per form
)^

COMMENT ON TABLE  form_fields               IS 'Field definitions for each form. Each field becomes a column in the form''s submission table.'^
COMMENT ON COLUMN form_fields.field_key     IS 'Snake_case identifier used as column name in the dynamic submission table.'^
COMMENT ON COLUMN form_fields.field_type    IS 'Logical type: text→TEXT, number→INTEGER, date→DATE, boolean→BOOLEAN, dropdown→VARCHAR(255), radio→VARCHAR(255), multiple_choice→VARCHAR(255), file→TEXT.'^
COMMENT ON COLUMN form_fields.shared_options_id IS 'FK → shared_options: all dropdown/radio options are stored there, never inline.'^
COMMENT ON COLUMN form_fields.field_order   IS 'Zero-based render order. Builder preserves this order via drag-and-drop.'^


-- ─────────────────────────────────────────────
--  INDEXES
-- ─────────────────────────────────────────────

-- Speed up all queries that join/filter form_fields by form
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id
    ON form_fields (form_id)^

-- Speed up ORDER BY field_order when rendering / previewing a form
CREATE INDEX IF NOT EXISTS idx_form_fields_field_order
    ON form_fields (form_id, field_order)^


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
--  NOTE: users table is managed by Spring
--  Security's JdbcUserDetailsManager and will
--  be initialised by Spring Boot's
--  spring.sql.init on startup.
--  See users_schema.sql for those DDL statements.
-- ─────────────────────────────────────────────
