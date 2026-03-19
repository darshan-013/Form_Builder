/*
-- =============================================================
--  RBAC Backfill Migration
--  Date: 2026-03-12
--
--  Creates rbac_users profiles for all existing Spring Security
--  users who do not yet have an RBAC profile, and assigns them
--  the Viewer role (READ only).
--
--  New users start as Viewer. Admin/Role Administrator must
--  promote users to higher roles manually.
--
--  Idempotent — safe to run on every startup.
-- =============================================================

-- Step 1: Create rbac_users row for every Spring Security user missing one
INSERT INTO rbac_users (username, name)
SELECT u.username, u.username
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM rbac_users r WHERE r.username = u.username
)
ON CONFLICT (username) DO NOTHING^

-- Step 2: Assign Viewer role to every rbac_user that has NO roles at all
INSERT INTO user_roles (user_id, role_id)
SELECT ru.id, r.id
FROM rbac_users ru
CROSS JOIN roles r
WHERE r.role_name = 'Viewer'
  AND NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = ru.id
  )
ON CONFLICT (user_id, role_id) DO NOTHING^
*/
