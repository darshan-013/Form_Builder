/*
-- Adding Soft Delete flag to RBAC entities
ALTER TABLE rbac_users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE roles ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE modules ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

-- Update existing records to not be deleted
UPDATE rbac_users SET is_deleted = FALSE WHERE is_deleted IS NULL;
UPDATE roles SET is_deleted = FALSE WHERE is_deleted IS NULL;
UPDATE modules SET is_deleted = FALSE WHERE is_deleted IS NULL;
*/
