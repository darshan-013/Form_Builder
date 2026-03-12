-- =============================================================
--  AUTH CONSOLIDATION MIGRATION
--  Date: 2026-03-12
--
--  Merges authentication into rbac_users table:
--  1. Add password + enabled columns to rbac_users
--  2. Copy passwords from Spring Security users table
--  3. Drop FK constraint rbac_users.username → users.username
--  4. Drop authorities + users tables (no longer needed)
--
--  After this, rbac_users is the SINGLE source of truth for
--  both authentication and RBAC authorization.
--
--  Idempotent — safe to run on every startup.
-- =============================================================

-- Step 1: Add password column to rbac_users (if not exists)
ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS password VARCHAR(255) NOT NULL DEFAULT ''
^

-- Step 2: Add enabled column to rbac_users (if not exists)
ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE
^

-- Step 3: Copy passwords from old users table into rbac_users (if users table still exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        UPDATE rbac_users ru
        SET password = u.password, enabled = u.enabled
        FROM users u
        WHERE u.username = ru.username
          AND (ru.password IS NULL OR ru.password = '');
        RAISE NOTICE 'Copied passwords from users table to rbac_users.';
    END IF;
END;
$$
^

-- Step 4: Drop the FK constraint from rbac_users.username → users.username
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT constraint_name INTO fk_name
    FROM information_schema.table_constraints
    WHERE table_name = 'rbac_users'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%username%'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE rbac_users DROP CONSTRAINT ' || quote_ident(fk_name);
        RAISE NOTICE 'Dropped FK constraint: %', fk_name;
    END IF;

    -- Also try the auto-generated FK name pattern
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'rbac_users'
          AND constraint_type = 'FOREIGN KEY'
    ) THEN
        FOR fk_name IN
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'rbac_users'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'username'
        LOOP
            EXECUTE 'ALTER TABLE rbac_users DROP CONSTRAINT IF EXISTS ' || quote_ident(fk_name);
            RAISE NOTICE 'Dropped FK constraint: %', fk_name;
        END LOOP;
    END IF;
END;
$$
^

-- Step 5: Drop the old Spring Security tables (no longer needed)
DROP TABLE IF EXISTS authorities CASCADE
^

DROP TABLE IF EXISTS users CASCADE
^

