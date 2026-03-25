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
            // 1. Form Versioning - is_active ground truth
            executeSilently("ALTER TABLE form_versions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE");
            
            // Migrate status 'PUBLISHED' to is_active = true if just added
            jdbcTemplate.execute("UPDATE form_versions SET is_active = TRUE WHERE status = 'PUBLISHED' AND is_active = FALSE");

            // 2. Form Submission Meta Index
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS form_submission_meta (
                    id UUID PRIMARY KEY,
                    form_id UUID NOT NULL,
                    form_version_id UUID NOT NULL,
                    user_id VARCHAR(150),
                    status VARCHAR(50) DEFAULT 'DRAFT',
                    submission_table VARCHAR(100),
                    submission_row_id UUID,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            executeSilently("ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submission_table VARCHAR(100)");
            executeSilently("ALTER TABLE form_submission_meta ADD COLUMN IF NOT EXISTS submission_row_id UUID");

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
}
