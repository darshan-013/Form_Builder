-- Add form_code column if it doesn't exist
ALTER TABLE forms ADD COLUMN IF NOT EXISTS form_code VARCHAR(50)^
ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS published_at TIMESTAMP^

-- Populate form_code from sanitized name for existing records
UPDATE forms
SET form_code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE form_code IS NULL^

-- Clean leading/trailing underscores from form_code
UPDATE forms
SET form_code = TRIM(BOTH '_' FROM form_code)
WHERE form_code LIKE '_%' OR form_code LIKE '%_'^

-- Handle duplicate form_codes by adding a suffix (Requirement 2.1 mapping safety)
DO $$
DECLARE
    r RECORD;
    counter INTEGER;
    base_code TEXT;
    new_code TEXT;
BEGIN
    FOR r IN (SELECT id, form_code FROM forms ORDER BY id) LOOP
        base_code := r.form_code;
        new_code := base_code;
        counter := 1;
        
        -- While another form exists with the same code that we already processed (lower ID)
        WHILE EXISTS (SELECT 1 FROM forms WHERE form_code = new_code AND id < r.id) LOOP
            new_code := base_code || '_' || counter;
            counter := counter + 1;
        END LOOP;
        
        IF new_code <> r.form_code THEN
            UPDATE forms SET form_code = new_code WHERE id = r.id;
        END IF;
    END LOOP;
END $$^

-- Ensure form_code is NOT NULL and UNIQUE now that it's populated
ALTER TABLE forms ALTER COLUMN form_code SET NOT NULL^
ALTER TABLE forms DROP CONSTRAINT IF EXISTS uk_forms_form_code^
ALTER TABLE forms ADD CONSTRAINT uk_forms_form_code UNIQUE (form_code)^

-- Dynamic SQL to rename existing submission tables to follow the new convention
DO $$
DECLARE
    r RECORD;
    new_tbl_name TEXT;
BEGIN
    FOR r IN (SELECT id, name, table_name, form_code FROM forms) LOOP
        new_tbl_name := 'form_data_' || r.form_code;
        
        -- Only rename if the actual table exists and name is different
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = r.table_name) AND r.table_name <> new_tbl_name THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' RENAME TO ' || quote_ident(new_tbl_name);
            
            -- Update the metadata in forms table to match the new physical name
            UPDATE forms SET table_name = new_tbl_name WHERE id = r.id;
        END IF;
    END LOOP;
END $$^
