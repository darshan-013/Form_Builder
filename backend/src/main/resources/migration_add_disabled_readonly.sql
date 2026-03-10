-- Migration: Add disabled and read-only attributes to form_fields
-- Spring Boot SQL Script Separator: ^

ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE^
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN NOT NULL DEFAULT FALSE^
