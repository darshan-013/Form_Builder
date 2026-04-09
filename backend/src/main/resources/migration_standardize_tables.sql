-- Add code column if it doesn't exist
ALTER TABLE forms ADD COLUMN IF NOT EXISTS code VARCHAR(100)^

-- Copy legacy form_code to code when present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'forms' AND column_name = 'form_code'
    ) THEN
        UPDATE forms
        SET code = form_code
        WHERE code IS NULL AND form_code IS NOT NULL;
    END IF;
END $$^

-- Populate code from sanitized name for existing records
UPDATE forms
SET code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE code IS NULL^

-- Clean leading/trailing underscores from code
UPDATE forms
SET code = TRIM(BOTH '_' FROM code)
WHERE code LIKE '_%' OR code LIKE '%_'^

-- Handle duplicate codes by adding a suffix (Requirement 2.1 mapping safety)
DO $$
DECLARE
    r RECORD;
    counter INTEGER;
    base_code TEXT;
    new_code TEXT;
BEGIN
    FOR r IN (SELECT id, code FROM forms ORDER BY id) LOOP
        base_code := r.code;
        new_code := base_code;
        counter := 1;
        
        -- While another form exists with the same code that we already processed (lower ID)
        WHILE EXISTS (SELECT 1 FROM forms WHERE code = new_code AND id < r.id) LOOP
            new_code := base_code || '_' || counter;
            counter := counter + 1;
        END LOOP;
        
        IF new_code <> r.code THEN
            UPDATE forms SET code = new_code WHERE id = r.id;
        END IF;
    END LOOP;
END $$^

-- Ensure code is NOT NULL and UNIQUE now that it's populated
ALTER TABLE forms ALTER COLUMN code SET NOT NULL^
ALTER TABLE forms DROP CONSTRAINT IF EXISTS uk_forms_form_code^
ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_form_code_key^
ALTER TABLE forms DROP CONSTRAINT IF EXISTS uk_forms_code^
ALTER TABLE forms ADD CONSTRAINT uk_forms_code UNIQUE (code)^

-- Drop legacy form_code column after migration to code-only model
ALTER TABLE forms DROP COLUMN IF EXISTS form_code^
ALTER TABLE forms DROP COLUMN IF EXISTS table_name^

-- Align form_versions to the immutable snapshot schema
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS definition_json JSONB NOT NULL DEFAULT '{}'::jsonb^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'^
ALTER TABLE form_versions DROP COLUMN IF EXISTS status^
ALTER TABLE form_versions DROP COLUMN IF EXISTS published_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS updated_at^
ALTER TABLE form_versions DROP COLUMN IF EXISTS is_soft_deleted^
ALTER TABLE form_versions DROP COLUMN IF EXISTS deleted_at^
ALTER TABLE form_versions DROP CONSTRAINT IF EXISTS uk_form_versions_form_id_version_number^
ALTER TABLE form_versions ADD CONSTRAINT uk_form_versions_form_id_version_number UNIQUE (form_id, version_number)^

-- Submission table names are now derived from code as form_data_<code>.
-- Existing physical submission tables should be handled by the application/service layer.
