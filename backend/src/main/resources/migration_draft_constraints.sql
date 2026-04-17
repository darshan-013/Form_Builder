-- migration_draft_constraints.sql
-- Enforce "One active draft per user per form" (SRS Decision 5.1)
-- Added pre-cleanup to remove existing duplicates (keeping latest only)

-- 0. Ensure meta table has all required audit/soft-delete columns
ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN NOT NULL DEFAULT FALSE^
ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()^

-- 1. Pre-cleanup of duplicate drafts to prevent index creation failure
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT id, submission_table, submission_row_id
        FROM (
            SELECT id, submission_table, submission_row_id,
                   ROW_NUMBER() OVER (PARTITION BY form_id, submitted_by ORDER BY created_at DESC) as rn
            FROM form_submission_meta
            WHERE status = 'DRAFT'
        ) sub
        WHERE rn > 1
    ) LOOP
        -- Delete from dynamic data table safely if it exists
        EXECUTE format('DELETE FROM %I WHERE id = %L', r.submission_table, r.submission_row_id);
        
        -- Delete from meta table
        DELETE FROM form_submission_meta WHERE id = r.id;
    END LOOP;
END $$^

-- 2. Create a partial unique index that only applies to rows with 'DRAFT' status.
-- This allows a user to have multiple 'SUBMITTED' rows for the same form, 
-- but only one 'DRAFT' row at any given time.
DROP INDEX IF EXISTS uq_draft_per_user_form^
CREATE UNIQUE INDEX uq_draft_per_user_form 
ON form_submission_meta (form_id, submitted_by) 
WHERE (status = 'DRAFT')^

-- 2. Performance index for version-aware cleanup
CREATE INDEX IF NOT EXISTS idx_sub_meta_status_version 
ON form_submission_meta (form_version_id, status)^

-- 3. Convert number field columns from INTEGER to NUMERIC in all dynamic form tables.
-- This prevents "integer out of range" errors when users enter decimal or large values.
DO $$
DECLARE
    tbl RECORD;
    col RECORD;
BEGIN
    FOR tbl IN (
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'form_data_%'
    ) LOOP
        FOR col IN (
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = tbl.table_name
              AND data_type = 'integer'
              -- Exclude system/metadata integer columns
              AND column_name NOT IN ('linear_scale', 'star_rating')
              AND column_name NOT LIKE '%_scale'
              AND column_name NOT LIKE '%_rating'
        ) LOOP
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC USING %I::NUMERIC',
                tbl.table_name, col.column_name, col.column_name
            );
            RAISE NOTICE 'Converted column %.% from INTEGER to NUMERIC', tbl.table_name, col.column_name;
        END LOOP;
    END LOOP;
END $$^
