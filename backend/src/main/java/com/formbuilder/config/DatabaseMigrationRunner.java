package com.formbuilder.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Runs idempotent DB cleanup/migration on every startup.
 * Executes in order:
 * 1. DROP abandoned tables (field_options, dropdown_options, dropdown_schemas)
 * 2. ADD validation_json (if missing)
 * 3. CREATE shared_options (if not exists)
 * 4. ADD shared_options_id (if missing)
 * 5. DROP obsolete columns (source_field_id, dropdown_schema_id, options_json)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DatabaseMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final com.formbuilder.repository.FormJpaRepository formRepo;
    private final com.formbuilder.service.DynamicTableService dynamicTableService;

    @Override
    public void run(ApplicationArguments args) {
        log.info("=== Running DB migration ===");

        // 0. SRS Decision 4.3: Startup Schema Drift Detection
        validateActiveFormsSchema();

        // 1. Drop abandoned tables
        exec("DROP TABLE IF EXISTS field_options    CASCADE");
        exec("DROP TABLE IF EXISTS dropdown_options CASCADE");
        exec("DROP TABLE IF EXISTS dropdown_schemas CASCADE");

        // 2. Add missing columns
        exec("ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS validation_json TEXT");

        // 3. Create shared_options table
        exec("""
                CREATE TABLE IF NOT EXISTS shared_options (
                    id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
                    options_json TEXT      NOT NULL,
                    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """);

        // 4. Add shared_options_id FK
        exec("""
                ALTER TABLE form_fields
                ADD COLUMN IF NOT EXISTS shared_options_id UUID
                REFERENCES shared_options(id) ON DELETE SET NULL
                """);

        // 5. Drop obsolete columns
        exec("ALTER TABLE form_fields DROP COLUMN IF EXISTS source_field_id");
        exec("ALTER TABLE form_fields DROP COLUMN IF EXISTS dropdown_schema_id");
        exec("ALTER TABLE form_fields DROP COLUMN IF EXISTS options_json");

        // 6. Conditional Rule Engine column
        exec("ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS rules_json TEXT");

        // 7. Form Groups — section containers
        exec("""
                CREATE TABLE IF NOT EXISTS form_groups (
                    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                    form_id           UUID         NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
                    group_title       VARCHAR(200) NOT NULL,
                    group_description TEXT,
                    group_order       INT          NOT NULL DEFAULT 0,
                    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
                    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_form_groups_form_id ON form_groups(form_id)");
        exec("""
                ALTER TABLE form_fields
                ADD COLUMN IF NOT EXISTS group_id UUID
                REFERENCES form_groups(id) ON DELETE SET NULL
                """);

        // ── 7b. Drop obsolete visibility column ───────────────────────────────────────
        exec("ALTER TABLE forms DROP COLUMN IF EXISTS visibility");

        // ── 7c. Remove legacy per-form allowed roles column ─────────────────
        exec("ALTER TABLE forms DROP COLUMN IF EXISTS allowed_roles");

        // ── 7d. Per-form allowed users (JSON array of user snapshots) ───────
        exec("ALTER TABLE forms ADD COLUMN IF NOT EXISTS allowed_users TEXT");

        // ── 8. RBAC — Role Based Access Control ──────────────────────────────

        // 8a. permissions table
        exec("""
                CREATE TABLE IF NOT EXISTS permissions (
                    id              SERIAL       PRIMARY KEY,
                    permission_key  VARCHAR(100) UNIQUE NOT NULL,
                    description     TEXT
                )
                """);

        // 8b. Seed fixed permissions
        String[] perms = {
                "READ",  "Read Access — view forms, submissions, and data",
                "WRITE", "Write Access — create new forms and submissions",
                "EDIT",  "Edit Access — modify existing forms and submissions",
                "DELETE","Delete Access — remove forms and submissions",
                "MANAGE","Manage Access — manage roles, users, and system configuration",
                "EXPORT","Export Access — export forms and submission data",
                "VISIBILITY","Visibility Control — control who can see forms and data",
                "AUDIT", "Audit Access — view audit logs and activity history"
        };
        for (int i = 0; i < perms.length; i += 2) {
            exec("INSERT INTO permissions (permission_key, description) VALUES ('"
                    + perms[i] + "', '" + perms[i + 1] + "') ON CONFLICT (permission_key) DO NOTHING");
        }
        exec("DELETE FROM role_permissions rp USING permissions p WHERE rp.permission_id = p.id AND p.permission_key = 'APPROVE'");
        exec("DELETE FROM permissions WHERE permission_key = 'APPROVE'");

        // 8c. roles table
        exec("""
                CREATE TABLE IF NOT EXISTS roles (
                    id              SERIAL        PRIMARY KEY,
                    role_name       VARCHAR(100)  UNIQUE NOT NULL,
                    is_system_role  BOOLEAN       NOT NULL DEFAULT FALSE,
                    created_by      INT,
                    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW()
                )
                """);

        // 8d. Seed system roles
        for (String role : List.of("Viewer", "Manager", "Approver",
                "Builder", "Role Administrator", "Admin")) {
            exec("INSERT INTO roles (role_name, is_system_role) VALUES ('"
                    + role + "', TRUE) ON CONFLICT (role_name) DO NOTHING");
        }
        exec("DELETE FROM roles WHERE role_name = 'Employee'");

        // 8e. role_permissions junction table
        exec("""
                CREATE TABLE IF NOT EXISTS role_permissions (
                    id              SERIAL  PRIMARY KEY,
                    role_id         INT     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                    permission_id   INT     NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id)");
        exec("CREATE INDEX IF NOT EXISTS idx_role_permissions_perm_id ON role_permissions(permission_id)");

        // 8f. rbac_users profile table (standalone — NO FK to Spring Security users table)
        exec("""
                CREATE TABLE IF NOT EXISTS rbac_users (
                    id          SERIAL        PRIMARY KEY,
                    username    VARCHAR(100)  UNIQUE NOT NULL,
                    password    VARCHAR(255)  NOT NULL DEFAULT '',
                    enabled     BOOLEAN       NOT NULL DEFAULT TRUE,
                    name        VARCHAR(100),
                    email       VARCHAR(150)  UNIQUE,
                    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
                )
                """);
        exec("ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS password VARCHAR(255) NOT NULL DEFAULT ''");
        exec("ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE");
        exec("CREATE INDEX IF NOT EXISTS idx_rbac_users_email ON rbac_users(email)");

        // 8g. user_roles junction table
        exec("""
                CREATE TABLE IF NOT EXISTS user_roles (
                    id       SERIAL  PRIMARY KEY,
                    user_id  INT     NOT NULL REFERENCES rbac_users(id) ON DELETE CASCADE,
                    role_id  INT     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                    CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)");
        exec("CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)");

        // 8h. immutable audit logs table
        exec("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id                     BIGSERIAL PRIMARY KEY,
                    action                 VARCHAR(60)  NOT NULL,
                    performed_by_user_id   INT,
                    performed_by_username  VARCHAR(100) NOT NULL,
                    target_entity          VARCHAR(30)  NOT NULL,
                    target_entity_id       VARCHAR(100),
                    description            TEXT         NOT NULL,
                    created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
                    metadata               JSONB,
                    related_role_id        INT,
                    related_role_name      VARCHAR(100),
                    related_user_id        INT,
                    related_username       VARCHAR(100)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)");
        exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)");
        exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by_username)");
        exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_role ON audit_logs(related_role_id)");
        exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(related_user_id)");

        // Block UPDATE/DELETE so audit logs remain immutable.
        exec("""
                CREATE OR REPLACE FUNCTION fn_prevent_audit_logs_change()
                RETURNS TRIGGER AS $$
                BEGIN
                    RAISE EXCEPTION 'audit_logs are immutable';
                END;
                $$ LANGUAGE plpgsql
                """);
        exec("DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs");
        exec("DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs");
        exec("CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_logs_change()");
        exec("CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_logs_change()");

        // 8i. Seed role ↔ permission matrix
        exec("INSERT INTO role_permissions (role_id, permission_id) " +
                "SELECT r.id, p.id FROM roles r, permissions p " +
                "WHERE r.role_name = 'Viewer' AND p.permission_key = 'READ' " +
                "ON CONFLICT (role_id, permission_id) DO NOTHING");

        exec("INSERT INTO role_permissions (role_id, permission_id) " +
                "SELECT r.id, p.id FROM roles r, permissions p " +
                "WHERE r.role_name = 'Manager' AND p.permission_key IN ('READ', 'EXPORT', 'VISIBILITY', 'AUDIT') " +
                "ON CONFLICT (role_id, permission_id) DO NOTHING");

        exec("INSERT INTO role_permissions (role_id, permission_id) " +
                "SELECT r.id, p.id FROM roles r, permissions p " +
                "WHERE r.role_name = 'Approver' AND p.permission_key IN ('READ') " +
                "ON CONFLICT (role_id, permission_id) DO NOTHING");

        exec("INSERT INTO role_permissions (role_id, permission_id) " +
                "SELECT r.id, p.id FROM roles r, permissions p " +
                "WHERE r.role_name = 'Builder' AND p.permission_key IN ('READ', 'WRITE', 'EDIT', 'DELETE', 'EXPORT') " +
                "ON CONFLICT (role_id, permission_id) DO NOTHING");

        exec("INSERT INTO role_permissions (role_id, permission_id) " +
                "SELECT r.id, p.id FROM roles r, permissions p " +
                "WHERE r.role_name = 'Role Administrator' AND p.permission_key IN ('READ', 'EDIT', 'MANAGE', 'VISIBILITY', 'AUDIT') " +
                "ON CONFLICT (role_id, permission_id) DO NOTHING");

        exec("INSERT INTO role_permissions (role_id, permission_id) " +
                "SELECT r.id, p.id FROM roles r, permissions p " +
                "WHERE r.role_name = 'Admin' " +
                "ON CONFLICT (role_id, permission_id) DO NOTHING");

        log.info("=== RBAC tables and seed data ensured ===");

        // ── 9. ONE-TIME RESET — Clean slate + Viewer default ──────────────
        // Deletes all forms, fields, users, RBAC data.
        // Uses _migration_flags table to ensure it only runs ONCE.
        exec("CREATE TABLE IF NOT EXISTS _migration_flags (" +
                "flag_name VARCHAR(100) PRIMARY KEY, " +
                "ran_at TIMESTAMP NOT NULL DEFAULT NOW())");

        try {
            List<Integer> flagCheck = jdbc.queryForList(
                    "SELECT 1 FROM _migration_flags WHERE flag_name = 'reset_viewer_default_v1'",
                    Integer.class);

            if (flagCheck.isEmpty()) {
                log.info("=== Running ONE-TIME data reset ===");

                // Drop dynamic submission tables (form_xxxx_yyyy) but protect schema tables
                try {
                    List<String> dynamicTables = jdbc.queryForList(
                            "SELECT tablename FROM pg_tables " +
                            "WHERE schemaname = 'public' " +
                            "AND tablename LIKE 'form\\_%' ESCAPE '\\' " +
                            "AND tablename NOT IN ('forms', 'form_fields', 'form_groups')",
                            String.class);
                    for (String tbl : dynamicTables) {
                        exec("DROP TABLE IF EXISTS \"" + tbl + "\" CASCADE");
                    }
                } catch (Exception e) {
                    log.warn("Could not drop dynamic tables: {}", e.getMessage());
                }

                // Clear data in proper FK order
                exec("DELETE FROM static_form_fields");
                exec("UPDATE form_fields SET group_id = NULL WHERE group_id IS NOT NULL");
                exec("DELETE FROM form_groups");
                exec("DELETE FROM form_fields");
                exec("DELETE FROM forms");
                exec("DELETE FROM shared_options");
                exec("DELETE FROM user_roles");
                exec("DELETE FROM rbac_users");

                // Mark as completed
                jdbc.update("INSERT INTO _migration_flags (flag_name) VALUES ('reset_viewer_default_v1')");
                log.info("=== ONE-TIME data reset complete — system is clean ===");
            } else {
                log.info("Reset migration already applied — skipping.");
            }
        } catch (Exception e) {
            log.warn("Reset migration check/run failed: {}", e.getMessage());
        }

        // ── 10. SEED SYSTEM USERS — Admin + Role Administrator ────────────
        // Creates default Admin and Role Administrator if they don't exist.
        // These are the only two elevated users in the system.
        // All other users register as Viewer and must be promoted.
        seedSystemUser("admin", "Admin", "admin@formcraft.local", "admin123", "Admin");
        seedSystemUser("roleadmin", "Role Administrator", "roleadmin@formcraft.local", "roleadmin123", "Role Administrator");

        // Remove Viewer role from admin/roleadmin if it was previously assigned
        exec("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM rbac_users WHERE username IN ('admin', 'roleadmin')) " +
             "AND role_id IN (SELECT id FROM roles WHERE role_name = 'Viewer')");

        // Log final table structure
        try {
            var cols = jdbc.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                            "WHERE table_name = 'form_fields' ORDER BY ordinal_position");
            log.info("form_fields columns after migration: {}", cols.stream()
                    .map(r -> r.get("column_name").toString()).toList());

            var tables = jdbc.queryForList(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
            log.info("Public tables after migration: {}", tables.stream()
                    .map(r -> r.get("tablename").toString()).toList());
        } catch (Exception e) {
            log.warn("Could not fetch post-migration table info: {}", e.getMessage());
        }

        log.info("=== DB migration complete ===");
    }

    /**
     * Seeds a system user if not already present.
     * Creates the rbac_users row with BCrypt password and assigns the given role.
     * Idempotent — safe to call on every startup.
     */
    private void seedSystemUser(String username, String displayName, String email,
                                String rawPassword, String roleName) {
        try {
            List<Integer> existing = jdbc.queryForList(
                    "SELECT id FROM rbac_users WHERE username = ?",
                    Integer.class, username);

            if (existing.isEmpty()) {
                String hashedPassword = passwordEncoder.encode(rawPassword);
                jdbc.update(
                        "INSERT INTO rbac_users (username, password, enabled, name, email, created_at) " +
                        "VALUES (?, ?, TRUE, ?, ?, NOW()) ON CONFLICT (username) DO NOTHING",
                        username, hashedPassword, displayName, email);

                List<Integer> userIds = jdbc.queryForList(
                        "SELECT id FROM rbac_users WHERE username = ?",
                        Integer.class, username);

                if (!userIds.isEmpty()) {
                    Integer userId = userIds.get(0);
                    // Assign the specified role only (Admin/Role Admin already have all needed permissions)
                    jdbc.update(
                            "INSERT INTO user_roles (user_id, role_id) " +
                            "SELECT ?, r.id FROM roles r WHERE r.role_name = ? " +
                            "ON CONFLICT (user_id, role_id) DO NOTHING",
                            userId, roleName);
                    log.info("Seeded system user '{}' with role: {}", username, roleName);
                }
            } else {
                log.debug("System user '{}' already exists — skipping seed", username);
            }
        } catch (Exception e) {
            log.warn("Failed to seed system user '{}': {}", username, e.getMessage());
        }
    }

    private void exec(String sql) {
        try {
            jdbc.execute(sql.trim());
            // Log only the first line of multi-line statements
            String label = sql.trim().lines().findFirst().orElse(sql.trim());
            log.info("OK: {}", label);
        } catch (Exception e) {
            log.warn("SKIP ({}): {}", e.getMessage(), sql.trim().lines().findFirst().orElse(""));
        }
    }

    private void validateActiveFormsSchema() {
        log.info("Checking for schema drift in active forms...");
        try {
            List<com.formbuilder.entity.FormEntity> activeForms = formRepo.findAllByStatus(com.formbuilder.entity.FormEntity.FormStatus.PUBLISHED);
            for (com.formbuilder.entity.FormEntity form : activeForms) {
                form.getPublishedVersion().ifPresent(version -> {
                    try {
                        dynamicTableService.validateSchema(form.getTableName(), version.getId());
                        log.info("Schema OK for form: {}", form.getFormCode());
                    } catch (com.formbuilder.exception.SchemaDriftException e) {
                        log.error("CRITICAL SCHEMA DRIFT DETECTED: Form '{}' (table '{}') is out of sync with its metadata! Errors: {}", 
                            form.getName(), form.getTableName(), e.getMessage());
                        // In a real "fail-fast" scenario, we might throw an exception here to stop startup.
                        // However, per user request "Application startup fails fast if drift is detected", 
                        // I will throw a RuntimeException to halt the application.
                        throw new RuntimeException("Application startup blocked due to schema drift in form: " + form.getFormCode(), e);
                    }
                });
            }
        } catch (Exception e) {
            if (e instanceof RuntimeException && e.getMessage().contains("startup blocked")) {
                throw (RuntimeException) e;
            }
            log.warn("Could not perform startup schema drift check: {}", e.getMessage());
        }
    }
}
