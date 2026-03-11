-- =========================================================
-- Soft Delete Migration
-- Date: 2026-03-11
-- Adds is_soft_deleted and deleted_at columns to the forms table.
-- Dynamic submission tables are migrated automatically on first
-- access via SubmissionService.getSubmissions() (lazy migration).
-- =========================================================

-- Step 1: Add soft-delete columns to the forms table
ALTER TABLE forms
    ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN NOT NULL DEFAULT FALSE^

ALTER TABLE forms
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP^

-- Step 2: Ensure existing rows have the correct default
UPDATE forms SET is_soft_deleted = FALSE WHERE is_soft_deleted IS NULL^

-- Verify (uncomment to check):
-- SELECT id, name, is_soft_deleted, deleted_at FROM forms LIMIT 10^
