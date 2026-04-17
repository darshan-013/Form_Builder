-- Legacy cleanup for form_versions
ALTER TABLE form_versions DROP COLUMN IF EXISTS status^
ALTER TABLE form_versions DROP COLUMN IF EXISTS published_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS updated_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS is_soft_deleted^
ALTER TABLE form_versions DROP COLUMN IF EXISTS deleted_at^
