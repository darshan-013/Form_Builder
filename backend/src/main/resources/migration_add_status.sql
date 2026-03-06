-- Migration: Add status column to forms table
-- Date: 2026-03-06
-- Idempotent — safe to run on every startup
-- Separator: ^ (matches application.yml sql.init.separator)

ALTER TABLE forms ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'^

UPDATE forms SET status = 'DRAFT' WHERE status IS NULL OR status = ''
^

COMMENT ON COLUMN forms.status IS 'Lifecycle status: DRAFT (no submissions allowed) or PUBLISHED (submissions open).'
^
