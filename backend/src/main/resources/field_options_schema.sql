-- ═══════════════════════════════════════════════════════════════
-- NORMALIZED OPTIONS TABLE
-- Separate table for dropdown/radio field options
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
--  TABLE: field_options
--  Stores individual options for dropdown/radio fields
--  Each option is a separate row (normalized design)
-- ─────────────────────────────────────────────
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

COMMENT ON TABLE  field_options                IS 'Normalized storage for dropdown/radio options. Each option is a separate row.';
COMMENT ON COLUMN field_options.field_id       IS 'References the parent field in form_fields table.';
COMMENT ON COLUMN field_options.option_value   IS 'The display text and submit value for this option.';
COMMENT ON COLUMN field_options.option_order   IS 'Order in which options appear in dropdown/radio group (0-based).';
COMMENT ON COLUMN field_options.is_default     IS 'True if this option should be pre-selected by default.';
COMMENT ON COLUMN field_options.is_active      IS 'False for soft-deleted options (keeps history).';


-- ─────────────────────────────────────────────
--  INDEXES
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_field_options_field_id
    ON field_options (field_id);

CREATE INDEX IF NOT EXISTS idx_field_options_order
    ON field_options (field_id, option_order);

CREATE INDEX IF NOT EXISTS idx_field_options_active
    ON field_options (field_id, is_active);

