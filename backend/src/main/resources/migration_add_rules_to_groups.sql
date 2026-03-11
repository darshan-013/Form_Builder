-- ─────────────────────────────────────────────
-- Add rules_json to form_groups table
-- ─────────────────────────────────────────────

ALTER TABLE form_groups ADD COLUMN IF NOT EXISTS rules_json TEXT^
