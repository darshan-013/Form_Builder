-- Migration: Add Builder assignment columns and ASSIGNED status support
-- Date: 2026-03-13
-- Idempotent - safe to run repeatedly

ALTER TABLE forms ADD COLUMN IF NOT EXISTS assigned_builder_id INT^

ALTER TABLE forms ADD COLUMN IF NOT EXISTS assigned_builder_username VARCHAR(150)^

ALTER TABLE forms DROP CONSTRAINT IF EXISTS fk_forms_assigned_builder^
ALTER TABLE forms
    ADD CONSTRAINT fk_forms_assigned_builder
    FOREIGN KEY (assigned_builder_id)
    REFERENCES rbac_users(id)
    ON DELETE SET NULL^

CREATE INDEX IF NOT EXISTS idx_forms_assigned_builder_id
    ON forms(assigned_builder_id)^

CREATE INDEX IF NOT EXISTS idx_forms_assigned_builder_username
    ON forms(assigned_builder_username)^

