package com.formbuilder.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

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

    @Override
    public void run(ApplicationArguments args) {
        log.info("=== Running DB migration ===");

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
}
