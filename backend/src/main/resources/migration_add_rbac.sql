-- =============================================================
--  RBAC (Role Based Access Control) Migration
--  Date: 2026-03-12
--
--  Adds production-level RBAC system:
--    - permissions        (9 fixed permission types)
--    - roles              (7 system roles + custom roles)
--    - role_permissions   (many-to-many matrix)
--    - rbac_users         (single auth + profile table)
--    - user_roles         (many-to-many user ↔ role)
--
--  rbac_users is the SINGLE source of truth for authentication
--  (username/password/enabled) and RBAC authorization (via roles).
--  The old Spring Security users/authorities tables are dropped
--  by migration_consolidate_auth.sql.
--
--  All statements are idempotent (IF NOT EXISTS / ON CONFLICT).
-- =============================================================

-- ─────────────────────────────────────────────
--  TABLE: permissions
--  Fixed set of 9 access-right types.
--  Application code references permission_key.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
    id              SERIAL       PRIMARY KEY,
    permission_key  VARCHAR(100) UNIQUE NOT NULL,
    description     TEXT
)^

COMMENT ON TABLE  permissions              IS 'Fixed permission types — application references permission_key.'^
COMMENT ON COLUMN permissions.permission_key IS 'Unique key: READ, WRITE, EDIT, DELETE, APPROVE, MANAGE, EXPORT, VISIBILITY, AUDIT.'^

-- Seed the 9 fixed permissions (idempotent via ON CONFLICT)
INSERT INTO permissions (permission_key, description) VALUES
    ('READ',       'Read Access — view forms, submissions, and data')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('WRITE',      'Write Access — create new forms and submissions')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('EDIT',       'Edit Access — modify existing forms and submissions')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('DELETE',     'Delete Access — remove forms and submissions')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('APPROVE',    'Approve Access — approve or reject submissions in workflow')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('MANAGE',     'Manage Access — manage roles, users, and system configuration')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('EXPORT',     'Export Access — export forms and submission data')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('VISIBILITY', 'Visibility Control — control who can see forms and data')
ON CONFLICT (permission_key) DO NOTHING^

INSERT INTO permissions (permission_key, description) VALUES
    ('AUDIT',      'Audit Access — view audit logs and activity history')
ON CONFLICT (permission_key) DO NOTHING^


-- ─────────────────────────────────────────────
--  TABLE: roles
--  System roles are seeded and protected.
--  Admin / Role Administrator can create custom
--  roles at runtime (is_system_role = FALSE).
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id              SERIAL        PRIMARY KEY,
    role_name       VARCHAR(100)  UNIQUE NOT NULL,
    is_system_role  BOOLEAN       NOT NULL DEFAULT FALSE,
    created_by      INT,                                    -- NULL for system-seeded roles
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW()
)^

COMMENT ON TABLE  roles                IS 'Role definitions — system roles are protected from deletion.'^
COMMENT ON COLUMN roles.is_system_role IS 'TRUE = seeded by system, cannot be deleted by users.'^
COMMENT ON COLUMN roles.created_by     IS 'FK to rbac_users.id — NULL for system-seeded roles.'^

-- Seed the 7 system roles (idempotent via ON CONFLICT)
INSERT INTO roles (role_name, is_system_role) VALUES
    ('Viewer',             TRUE)
ON CONFLICT (role_name) DO NOTHING^

INSERT INTO roles (role_name, is_system_role) VALUES
    ('Employee',           TRUE)
ON CONFLICT (role_name) DO NOTHING^

INSERT INTO roles (role_name, is_system_role) VALUES
    ('Manager',            TRUE)
ON CONFLICT (role_name) DO NOTHING^

INSERT INTO roles (role_name, is_system_role) VALUES
    ('Approver',           TRUE)
ON CONFLICT (role_name) DO NOTHING^

INSERT INTO roles (role_name, is_system_role) VALUES
    ('Builder',            TRUE)
ON CONFLICT (role_name) DO NOTHING^

INSERT INTO roles (role_name, is_system_role) VALUES
    ('Role Administrator', TRUE)
ON CONFLICT (role_name) DO NOTHING^

INSERT INTO roles (role_name, is_system_role) VALUES
    ('Admin',              TRUE)
ON CONFLICT (role_name) DO NOTHING^


-- ─────────────────────────────────────────────
--  TABLE: role_permissions
--  Many-to-many: which permissions each role has.
--  Unique constraint prevents duplicate grants.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    id              SERIAL  PRIMARY KEY,
    role_id         INT     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   INT     NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
)^

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id
    ON role_permissions(role_id)^

CREATE INDEX IF NOT EXISTS idx_role_permissions_perm_id
    ON role_permissions(permission_id)^

COMMENT ON TABLE role_permissions IS 'Role ↔ Permission matrix. Defines what each role is allowed to do.'^


-- ─────────────────────────────────────────────
--  TABLE: rbac_users
--  Single source of truth for authentication
--  and RBAC authorization. Stores credentials
--  (username/password) and profile info.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_users (
    id          SERIAL        PRIMARY KEY,
    username    VARCHAR(100)  UNIQUE NOT NULL,
    password    VARCHAR(255)  NOT NULL DEFAULT '',
    enabled     BOOLEAN       NOT NULL DEFAULT TRUE,
    name        VARCHAR(100),
    email       VARCHAR(150)  UNIQUE,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
)^

CREATE INDEX IF NOT EXISTS idx_rbac_users_email
    ON rbac_users(email)^

COMMENT ON TABLE  rbac_users          IS 'Single auth + RBAC user table. Stores credentials and profile.'^
COMMENT ON COLUMN rbac_users.username IS 'Unique login identifier.'^


-- ─────────────────────────────────────────────
--  TABLE: user_roles
--  Many-to-many: which roles each user has.
--  A user can have multiple roles.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
    id       SERIAL  PRIMARY KEY,
    user_id  INT     NOT NULL REFERENCES rbac_users(id) ON DELETE CASCADE,
    role_id  INT     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
)^

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
    ON user_roles(user_id)^

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
    ON user_roles(role_id)^

COMMENT ON TABLE user_roles IS 'User ↔ Role assignments. A user can hold multiple roles simultaneously.'^


-- =============================================================
--  SEED: Role ↔ Permission Matrix
--
--  Viewer:             READ
--  Employee:           READ, WRITE
--  Manager:            READ, APPROVE, EXPORT, VISIBILITY, AUDIT
--  Approver:           READ, APPROVE
--  Builder:            READ, WRITE, EDIT, DELETE, EXPORT
--  Role Administrator: READ, EDIT, MANAGE, VISIBILITY, AUDIT
--  Admin:              ALL (READ, WRITE, EDIT, DELETE, APPROVE,
--                           MANAGE, EXPORT, VISIBILITY, AUDIT)
-- =============================================================

-- Viewer → READ
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Viewer' AND p.permission_key = 'READ'
ON CONFLICT (role_id, permission_id) DO NOTHING^

-- Employee → READ, WRITE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Employee' AND p.permission_key IN ('READ', 'WRITE')
ON CONFLICT (role_id, permission_id) DO NOTHING^

-- Manager → READ, APPROVE, EXPORT, VISIBILITY, AUDIT
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Manager' AND p.permission_key IN ('READ', 'APPROVE', 'EXPORT', 'VISIBILITY', 'AUDIT')
ON CONFLICT (role_id, permission_id) DO NOTHING^

-- Approver → READ, APPROVE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Approver' AND p.permission_key IN ('READ', 'APPROVE')
ON CONFLICT (role_id, permission_id) DO NOTHING^

-- Builder → READ, WRITE, EDIT, DELETE, EXPORT
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Builder' AND p.permission_key IN ('READ', 'WRITE', 'EDIT', 'DELETE', 'EXPORT')
ON CONFLICT (role_id, permission_id) DO NOTHING^

-- Role Administrator → READ, EDIT, MANAGE, VISIBILITY, AUDIT
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Role Administrator' AND p.permission_key IN ('READ', 'EDIT', 'MANAGE', 'VISIBILITY', 'AUDIT')
ON CONFLICT (role_id, permission_id) DO NOTHING^

-- Admin → ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_name = 'Admin'
ON CONFLICT (role_id, permission_id) DO NOTHING^


