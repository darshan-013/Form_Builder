-- Migration: Add form_groups table and group_id FK on form_fields
-- form_groups stores section containers that visually group fields on the canvas.
-- NOTE: form_id is nullable here; migration_add_versioning.sql will later add
--       form_version_id and drop form_id.

CREATE TABLE IF NOT EXISTS form_groups (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id           UUID         REFERENCES forms(id) ON DELETE CASCADE,
    group_title       VARCHAR(200) NOT NULL,
    group_description TEXT,
    group_order       INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
)^

ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES form_groups(id) ON DELETE SET NULL^
