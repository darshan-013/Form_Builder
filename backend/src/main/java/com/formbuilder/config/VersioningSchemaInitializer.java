package com.formbuilder.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class VersioningSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void initVersioningSchema() {
        log.info("Initializing Versioning Schema repairs...");

        try {
            // 1. Form Versioning schema alignment
            executeSilently("ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1");
            executeSilently("ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE");
            executeSilently("ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS definition_json JSONB NOT NULL DEFAULT '{}'::jsonb");
            executeSilently("ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'");

            // Backward compatibility: migrate legacy published rows to active before dropping old columns
            if (columnExists("form_versions", "status")) {
                jdbcTemplate.execute("UPDATE form_versions SET is_active = TRUE WHERE status = 'PUBLISHED' AND is_active = FALSE");
            }

            executeSilently("ALTER TABLE form_versions DROP COLUMN IF EXISTS status");
            executeSilently("ALTER TABLE form_versions DROP COLUMN IF EXISTS published_at");
            executeSilently("ALTER TABLE form_versions DROP COLUMN IF EXISTS updated_at");
            executeSilently("ALTER TABLE form_versions DROP COLUMN IF EXISTS is_soft_deleted");
            executeSilently("ALTER TABLE form_versions DROP COLUMN IF EXISTS deleted_at");

            executeSilently("CREATE UNIQUE INDEX IF NOT EXISTS uq_form_versions_form_id_version_number ON form_versions(form_id, version_number)");

            // 2. Form Submission Meta Index (spec-aligned)
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS form_submission_meta (
                    id UUID PRIMARY KEY,
                    form_id UUID NOT NULL,
                    form_version_id UUID NOT NULL,
                    submission_table VARCHAR(255) NOT NULL,
                    submission_row_id UUID NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
                    submitted_by VARCHAR(100),
                    submitted_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """);

            executeSilently("ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(100)");
            executeSilently("ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP");
            executeSilently("ALTER TABLE form_submission_meta ALTER COLUMN submission_table TYPE VARCHAR(255)");
            executeSilently("ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submission_row_id UUID");

            // Legacy compatibility backfill for older installations
            if (columnExists("form_submission_meta", "user_id")) {
                executeSilently("UPDATE form_submission_meta SET submitted_by = user_id WHERE submitted_by IS NULL AND user_id IS NOT NULL");
            }
            if (columnExists("form_submission_meta", "updated_at")) {
                executeSilently("UPDATE form_submission_meta SET submitted_at = updated_at WHERE submitted_at IS NULL AND status = 'SUBMITTED'");
            }

            // 3. Ensure form_id unique for active versions [E8]
            jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_version ON form_versions(form_id) WHERE is_active = true");

            // 4. Ensure form_version_id exists in static_form_fields
            executeSilently("ALTER TABLE static_form_fields ADD COLUMN IF NOT EXISTS form_version_id UUID REFERENCES form_versions(id) ON DELETE CASCADE");

            log.info("Versioning Schema repairs completed.");
        } catch (Exception e) {
            log.error("Failed to initialize Versioning Schema: {}", e.getMessage(), e);
        }
    }

    private void executeSilently(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.debug("SQL execution skipped: {} -> {}", sql, e.getMessage());
        }
    }

    private boolean columnExists(String tableName, String columnName) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
                    Integer.class,
                    tableName,
                    columnName);
            return count != null && count > 0;
        } catch (Exception e) {
            return false;
        }
    }
}
