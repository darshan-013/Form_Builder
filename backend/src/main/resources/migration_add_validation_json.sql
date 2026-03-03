-- =====================================================
-- Migration: cleanup + schema alignment
-- Safe idempotent — runs on every startup
-- Separator: ^ (configured in application.yml)
-- =====================================================

-- ── 1. DROP ABANDONED TABLES ─────────────────────────────────────────────────
DROP TABLE IF EXISTS field_options    CASCADE^
DROP TABLE IF EXISTS dropdown_options CASCADE^
DROP TABLE IF EXISTS dropdown_schemas CASCADE^

-- ── 2. ADD MISSING COLUMNS ───────────────────────────────────────────────────
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS validation_json TEXT^

-- ── 3. CREATE shared_options (if not exists) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_options (
    id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    options_json TEXT      NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
)^

-- ── 4. ADD shared_options_id FK on form_fields (if not exists) ───────────────
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS shared_options_id UUID
    REFERENCES shared_options(id) ON DELETE SET NULL^

-- ── 5. DROP OBSOLETE COLUMNS ─────────────────────────────────────────────────
ALTER TABLE form_fields DROP COLUMN IF EXISTS source_field_id^
ALTER TABLE form_fields DROP COLUMN IF EXISTS dropdown_schema_id^
ALTER TABLE form_fields DROP COLUMN IF EXISTS options_json^

-- ── COMMENTS ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE  shared_options                IS 'Canonical option lists — dropdown/radio options live here, never inline on form_fields.'^
COMMENT ON COLUMN form_fields.shared_options_id IS 'FK → shared_options.id — all dropdown/radio options stored here, never as inline JSON.'^
COMMENT ON COLUMN form_fields.validation_json   IS 'JSON object containing advanced validation rules for a field.'^
