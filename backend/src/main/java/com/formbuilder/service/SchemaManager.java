package com.formbuilder.service;

import com.formbuilder.dto.ValidationError;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormVersionEntity;
import com.formbuilder.exception.SchemaDriftException;
import com.formbuilder.repository.FormJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchemaManager {

    private final JdbcTemplate jdbc;
    private final FormJpaRepository formRepo;
    private final DynamicTableService dynamicTableService;

    private static final Set<String> DISPLAY_ONLY_TYPES = Set.of(
            "heading", "divider", "description", "spacer", "page_break", "field_group"
    );

    /**
     * Checks if the physical table for the active version of a form matches its metadata fields.
     * Throws SchemaDriftException if drift is detected.
     */
    public void checkDrift(UUID formId) {
        FormEntity form = formRepo.findById(formId)
                .orElseThrow(() -> new IllegalArgumentException("Form not found for drift check: " + formId));

        FormVersionEntity activeVersion = form.getActiveVersion()
                .orElseThrow(() -> new IllegalArgumentException("No active version found for form: " + formId));

        String tableName = dynamicTableService.generateTableName(form.getCode());
        validateSchema(tableName, activeVersion.getId());
    }

    /**
     * Core drift detection logic. Compares metadata fields with physical columns.
     */
    public void validateSchema(String tableName, UUID versionId) {
        log.debug("Checking schema drift for table: {}, version: {}", tableName, versionId);

        // 1. Get metadata fields
        List<Map<String, Object>> metadataFields = jdbc.queryForList(
                "SELECT field_key, field_type FROM form_fields WHERE form_version_id = ?", versionId);

        // 2. Get actual columns from information_schema (Postgres uses lowercase for unquoted table names)
        Set<String> actualColumns = new HashSet<>();
        jdbc.query("SELECT column_name FROM information_schema.columns WHERE table_name = ?",
                (java.sql.ResultSet rs) -> {
                    while (rs.next()) {
                        actualColumns.add(rs.getString("column_name").toLowerCase());
                    }
                    return null;
                }, tableName.toLowerCase());

        List<ValidationError> errors = new ArrayList<>();

        // 3. Compare Metadata -> Physical (Missing Columns Check)
        for (Map<String, Object> field : metadataFields) {
            String fieldKey = (String) field.get("field_key");
            String fieldType = (String) field.get("field_type");

            if (isIgnoredType(fieldType)) {
                continue; // Display-only types don't have database columns
            }

            if (!actualColumns.contains(fieldKey.toLowerCase())) {
                errors.add(new ValidationError(fieldKey, "Missing expected column in physical table"));
            }
        }

        if (!errors.isEmpty()) {
            throw new SchemaDriftException(
                    String.format("Schema Drift Detected: Physical table '%s' is missing columns expected by metadata in version %s.",
                            tableName, versionId),
                    tableName,
                    versionId,
                    errors);
        }
        
        log.debug("Schema drift check passed for table: {}", tableName);
    }

    /**
     * Finds all PUBLISHED forms and runs the drift check on them.
     */
    public void validateAllPublishedForms() {
        List<FormEntity> publishedForms = formRepo.findAllByStatus(FormEntity.FormStatus.PUBLISHED);
        log.info("Starting schema drift check for {} PUBLISHED forms...", publishedForms.size());

        for (FormEntity form : publishedForms) {
            try {
                checkDrift(form.getId());
            } catch (IllegalArgumentException e) {
                log.warn("Skipping schema drift check for form {} ({}): {}", form.getName(), form.getCode(), e.getMessage());
            } catch (SchemaDriftException e) {
                log.error("CRITICAL SCHEMA DRIFT ON PUBLISHED FORM: Form {} ({}) has missing columns! Errors: {}", 
                        form.getName(), form.getCode(), e.getDriftErrors());
                throw e; // Fail fast on startup if this is called from the runner
            }
        }
        log.info("Schema drift check completed successfully across all PUBLISHED forms.");
    }

    private boolean isIgnoredType(String fieldType) {
        return fieldType == null || DISPLAY_ONLY_TYPES.contains(fieldType.toLowerCase());
    }
}
