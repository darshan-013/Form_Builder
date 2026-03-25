-- Add soft delete fields to form_versions table
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
