/*
-- =============================================================
--  RESET MIGRATION — Clean Slate + Viewer Default
--  Date: 2026-03-12
--
--  ONE-TIME RESET: Deletes all forms, fields, users, RBAC data.
--  Uses a guard flag in a control table to ensure it only runs once.
--  After this runs, the system is empty.
--  New users register and get Viewer role (READ only).
-- =============================================================

-- Create a control table to track one-time migrations
CREATE TABLE IF NOT EXISTS _migration_flags (
    flag_name  VARCHAR(100) PRIMARY KEY,
    ran_at     TIMESTAMP NOT NULL DEFAULT NOW()
)^

-- Only run the reset if the flag does not exist yet
DO $$
DECLARE
    tbl TEXT;
    protected_tables TEXT[] := ARRAY['forms', 'form_fields', 'form_groups'];
BEGIN
    IF EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = 'reset_viewer_default_v1') THEN
        RETURN;
    END IF;

    -- Drop ALL dynamic form submission tables (form_xxxx_yyyy pattern)
    -- PROTECT the schema tables: forms, form_fields, form_groups
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'form\_%' ESCAPE '\'
          AND tablename != ALL(protected_tables)
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl);
    END LOOP;

    -- Clear child tables first, then parents (respecting FK order)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='static_form_fields') THEN
        DELETE FROM static_form_fields;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='form_groups') THEN
        UPDATE form_fields SET group_id = NULL WHERE group_id IS NOT NULL;
        DELETE FROM form_groups;
    END IF;

    DELETE FROM form_fields;
    DELETE FROM forms;
    DELETE FROM shared_options;
    DELETE FROM user_roles;
    DELETE FROM rbac_users;

    INSERT INTO _migration_flags (flag_name) VALUES ('reset_viewer_default_v1');
END;
$$^
*/
