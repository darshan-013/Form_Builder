-- =========================================================
-- Form Archive Migration
-- Date: 2026-04-09
-- Converts legacy form soft-delete markers into explicit ARCHIVED status.
-- =========================================================

-- Ensure status column exists
ALTER TABLE forms
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'^

-- Migrate legacy soft-delete rows into ARCHIVED status (if legacy columns exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'forms' AND column_name = 'is_soft_deleted'
    ) THEN
        UPDATE forms
        SET status = 'ARCHIVED'
        WHERE is_soft_deleted = TRUE;
    END IF;
END $$^

-- Remove legacy soft-delete columns from forms table (forms are lifecycle-managed by status)
ALTER TABLE forms DROP COLUMN IF EXISTS deleted_at^
ALTER TABLE forms DROP COLUMN IF EXISTS is_soft_deleted^
