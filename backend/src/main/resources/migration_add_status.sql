-- Migration: Add status + created_by columns to forms table
-- Date: 2026-03-06
-- Idempotent — safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

ALTER TABLE forms ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'^

UPDATE forms SET status = 'DRAFT' WHERE status IS NULL OR status = ''
^

ALTER TABLE forms ADD COLUMN IF NOT EXISTS created_by VARCHAR(150)^

UPDATE forms SET created_by = 'admin' WHERE created_by IS NULL
^

-- ── Static Form Fields ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS static_form_fields (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id     UUID        NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    field_type  VARCHAR(50) NOT NULL
                            CHECK (field_type IN ('section_header','label_text','description_block')),
    data        TEXT,
    field_order INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
)^

-- ── Optional form settings ─────────────────────────────────────────────────
-- allow_multiple_submissions: true = unlimited (default), false = 1 per session
ALTER TABLE forms ADD COLUMN IF NOT EXISTS allow_multiple_submissions BOOLEAN NOT NULL DEFAULT TRUE^

-- show_timestamp: false = hidden (default), true = show submitted_at in list
ALTER TABLE forms ADD COLUMN IF NOT EXISTS show_timestamp BOOLEAN NOT NULL DEFAULT FALSE^

-- expires_at: null = never expires, set to a timestamp to auto-close the form
ALTER TABLE forms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP^

-- Add allow_multiple_submissions (default TRUE = no restriction, optional to limit to one)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS allow_multiple_submissions BOOLEAN NOT NULL DEFAULT TRUE^

-- Add show_timestamp (default TRUE = always record submission timestamp, compulsory)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS show_timestamp BOOLEAN NOT NULL DEFAULT TRUE^

-- Add expires_at (NULL = no expiry; set a timestamp to close the form after that date/time)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP^

