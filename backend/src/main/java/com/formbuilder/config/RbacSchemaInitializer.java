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
public class RbacSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void initRbacSchema() {
        log.info("Initializing RBAC Schema repairs...");

        try {
            // RBAC Soft Delete Columns (Additive Only)
            executeSilently("ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE");
            executeSilently("ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE");
            executeSilently("ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE");

            log.info("RBAC Schema repairs completed.");
        } catch (Exception e) {
            log.error("Failed to initialize RBAC Schema: {}", e.getMessage(), e);
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
