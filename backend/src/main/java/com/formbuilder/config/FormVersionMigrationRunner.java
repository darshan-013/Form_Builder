package com.formbuilder.config;

import com.formbuilder.service.SchemaManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Executes on application startup to ensure database integrity.
 * If any PUBLISHED form has drifted from its metadata definition (e.g. missing columns),
 * this runner will fail-fast and prevent the application from starting.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FormVersionMigrationRunner implements CommandLineRunner {

    private final SchemaManager schemaManager;

    @Override
    public void run(String... args) throws Exception {
        log.info("Running pre-flight checks: Schema Drift Validation...");
        try {
            schemaManager.validateAllPublishedForms();
            log.info("Pre-flight checks passed successfully.");
        } catch (Exception e) {
            log.error("PRE-FLIGHT CHECK FAILED: Application startup aborted due to strict schema integrity violation.");
            throw new IllegalStateException("Startup aborted: Database schema drift detected.", e);
        }
    }
}
