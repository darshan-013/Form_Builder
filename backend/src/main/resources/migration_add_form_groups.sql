-- Migration: Add form_groups table and group_id FK on form_fields
-- form_groups stores section containers that visually group fields on the canvas.

CREATE TABLE IF NOT EXISTS form_groups (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id           UUID         NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    group_title       VARCHAR(200) NOT NULL,
    group_description TEXT,
    group_order       INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
)^

CREATE INDEX IF NOT EXISTS idx_form_groups_form_id ON form_groups(form_id)^

ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES form_groups(id) ON DELETE SET NULL^
