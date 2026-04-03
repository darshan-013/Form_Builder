package com.formbuilder.service;

import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.exception.SchemaDriftException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Core DDL service — creates / alters / drops the physical submission table
 * for each form using raw JdbcTemplate (NOT Hibernate).
 *
 * Table naming: form_<sanitizedFormName>_<6-char-hex>
 * e.g. form_contact_form_a3b8d1
 *
 * Base columns (created in CREATE TABLE):
 * id UUID PRIMARY KEY DEFAULT gen_random_uuid()
 * created_at TIMESTAMP DEFAULT NOW()
 * updated_at TIMESTAMP DEFAULT NOW()
 *
 * Field columns are added via ALTER TABLE ADD COLUMN after table creation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DynamicTableService {

    // Map.ofEntries used because Map.of() is limited to 10 entries
    private static final Map<String, String> SQL_TYPE = Map.ofEntries(
            Map.entry("text", "TEXT"),
            Map.entry("number", "INTEGER"),
            Map.entry("decimal", "NUMERIC"),
            Map.entry("numeric", "NUMERIC"),
            Map.entry("date", "DATE"),
            Map.entry("boolean", "BOOLEAN"),
            // Normalize all string fields to TEXT for easier comparison in drift detection
            Map.entry("dropdown", "TEXT"),
            Map.entry("radio", "TEXT"),
            Map.entry("multiple_choice", "TEXT"),
            Map.entry("linear_scale", "INTEGER"),
            Map.entry("file", "TEXT"),
            Map.entry("multiple_choice_grid", "TEXT"),
            Map.entry("star_rating", "INTEGER"),
            Map.entry("checkbox_grid", "TEXT")
    );

    private final JdbcTemplate jdbc;

    private static final Set<String> RESERVED_KEYWORDS = Set.of(
            "SELECT", "INSERT", "UPDATE", "DELETE", "FROM", "WHERE", "JOIN", "INNER", "LEFT", "RIGHT", "FULL",
            "GROUP", "ORDER", "BY", "HAVING", "LIMIT", "OFFSET", "UNION", "DISTINCT",
            "TABLE", "COLUMN", "INDEX", "PRIMARY", "FOREIGN", "KEY", "CONSTRAINT", "REFERENCES",
            "VIEW", "SEQUENCE", "TRIGGER", "USER", "ROLE", "GRANT", "REVOKE",
            "ID", "CREATED_AT", "UPDATED_AT", "FORM_VERSION_ID", "IS_DRAFT", "IS_SOFT_DELETED", "DELETED_AT"
    );

    // ── Table Name Generation ─────────────────────────────────────────────────

    /**
     * Converts a human-readable form name or code to a safe PostgreSQL table name.
     * Format: form_data_<form_code>
     */
    public String generateTableName(String formCode) {
        String sanitized = formCode.toLowerCase()
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (sanitized.isEmpty()) {
            sanitized = "generic_form";
        }
        return "form_data_" + sanitized;
    }

    // ── Public DDL API ────────────────────────────────────────────────────────

    public void validateFieldKey(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Field key cannot be empty.");
        }
        if (key.length() > 100) {
            throw new IllegalArgumentException("Field key '" + key + "' exceeds maximum length of 100 characters.");
        }
        if (!key.matches("^[a-z0-9_]+$")) {
            throw new IllegalArgumentException("Field key '" + key + "' must contain only lowercase alphanumeric characters and underscores.");
        }
        if (RESERVED_KEYWORDS.contains(key.toUpperCase())) {
            throw new IllegalArgumentException("Field key '" + key + "' is a reserved keyword and cannot be used.");
        }
    }

    /**
     * Step 1: CREATE TABLE with base columns only.
     * Step 2: ALTER TABLE ADD COLUMN for every field in the form.
     */
    public void createTable(String tableName, List<FormFieldEntity> fields) {
        // Step 1 — base table structure
        String create = """
                CREATE TABLE %s (
                    id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
                    form_version_id UUID      NOT NULL,
                    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
                    is_draft        BOOLEAN   NOT NULL DEFAULT TRUE,
                    is_soft_deleted BOOLEAN   NOT NULL DEFAULT FALSE,
                    deleted_at      TIMESTAMP,
                    user_id         VARCHAR(255)
                )
                """.formatted(q(tableName));
        log.debug("DDL createTable: {}", create.trim());
        jdbc.execute(create);

        // Step 2 — one column per field
        for (FormFieldEntity field : fields) {
            if (!"field_group".equals(field.getFieldType())) {
                addColumn(tableName, field.getFieldKey(), field.getFieldType());
            }
        }
    }

    /**
     * Back-fills status and user_id columns on an existing submission table.
     */
    public void addDraftColumnsIfMissing(String tableName) {
        try {
            jdbc.execute("ALTER TABLE " + q(tableName) +
                    " ADD COLUMN IF NOT EXISTS form_version_id UUID");
            jdbc.execute("ALTER TABLE " + q(tableName) +
                    " ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT TRUE");
            jdbc.execute("ALTER TABLE " + q(tableName) +
                    " ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)");
            log.debug("Standard columns ensured for table: {}", tableName);
        } catch (Exception e) {
            log.warn("Could not add standard columns to {}: {}", tableName, e.getMessage());
        }
    }

    /**
     * Back-fills is_soft_deleted and deleted_at columns on an existing submission
     * table
     * that was created before the soft-delete feature was added.
     * Safe to call repeatedly — uses ADD COLUMN IF NOT EXISTS.
     */
    public void addSoftDeleteColumnIfMissing(String tableName) {
        try {
            jdbc.execute("ALTER TABLE " + q(tableName) +
                    " ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN NOT NULL DEFAULT FALSE");
            jdbc.execute("ALTER TABLE " + q(tableName) +
                    " ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
            log.debug("Soft-delete columns ensured for table: {}", tableName);
        } catch (Exception e) {
            log.warn("Could not add soft-delete columns to {}: {}", tableName, e.getMessage());
        }
    }

    /** ALTER TABLE <tableName> ADD COLUMN <fieldKey> <sqlType> */
    public void addColumn(String tableName, String fieldKey, String fieldType) {
        if ("field_group".equals(fieldType))
            return;
        String sql = "ALTER TABLE " + q(tableName)
                + " ADD COLUMN IF NOT EXISTS " + q(fieldKey) + " " + sqlType(fieldType);
        log.debug("DDL addColumn: {}", sql);
        jdbc.execute(sql);
    }

    public void addColumnIfMissing(String tableName, String fieldKey, String fieldType) {
        addColumn(tableName, fieldKey, fieldType);
    }

    /** ALTER TABLE <tableName> DROP COLUMN <fieldKey> */
    public void dropColumn(String tableName, String fieldKey) {
        String sql = "ALTER TABLE " + q(tableName) + " DROP COLUMN IF EXISTS " + q(fieldKey);
        log.debug("DDL dropColumn: {}", sql);
        jdbc.execute(sql);
    }

    /**
     * ALTER TABLE <tableName> ALTER COLUMN <fieldKey> TYPE <newSqlType>
     * USING cast ensures PostgreSQL can coerce existing data.
     */
    public void alterColumnType(String tableName, String fieldKey, String newFieldType) {
        String type = sqlType(newFieldType);
        String sql = "ALTER TABLE " + q(tableName)
                + " ALTER COLUMN " + q(fieldKey)
                + " TYPE " + type
                + " USING " + q(fieldKey) + "::" + type;
        log.debug("DDL alterColumnType: {}", sql);
        jdbc.execute(sql);
    }

    /** DROP TABLE IF EXISTS <tableName> */
    public void dropTable(String tableName) {
        String sql = "DROP TABLE IF EXISTS " + q(tableName);
        log.debug("DDL dropTable: {}", sql);
        jdbc.execute(sql);
    }

    /**
     * S1 — Draft deletion logic.
     * 1. Query form_submission_meta to find linked rows in dynamic tables.
     * 2. Delete linked dynamic rows.
     * 3. Delete meta rows.
     */
    @Transactional
    public void deleteAllDrafts(UUID formId) {
        String queryMeta = "SELECT id, submission_table, submission_row_id FROM form_submission_meta " +
                           "WHERE form_id = ? AND status = 'DRAFT'";
        List<Map<String, Object>> drafts = jdbc.queryForList(queryMeta, formId);

        for (Map<String, Object> draft : drafts) {
            String rawTable = (String) draft.get("submission_table");
            UUID rowId = (UUID) draft.get("submission_row_id");
            
            // System Rule: Use String.format() with pre-validated table names only
            String sqlDeleteData = String.format("DELETE FROM %s WHERE id = ?", q(rawTable));
            jdbc.update(sqlDeleteData, rowId);
        }

        String sqlDeleteMeta = "DELETE FROM form_submission_meta WHERE form_id = ? AND status = 'DRAFT'";
        jdbc.update(sqlDeleteMeta, formId);
        log.info("S1: Cleaned up {} drafts for formId={}", drafts.size(), formId);
    }

    /**
     * S2 — Passive drift detection (Decision 4.3).
     * Throws SchemaDriftException if metadata and physical schema disagree.
     */
    public void validateSchema(String tableName, UUID versionId) {
        // 1. Get metadata fields
        List<Map<String, Object>> metadataFields = jdbc.queryForList(
                "SELECT field_key, field_type FROM form_fields WHERE form_version_id = ?", versionId);

        // 2. Get actual columns from information_schema
        Map<String, String> actualColumns = new HashMap<>();
        // Postgres information_schema uses lowercase for unquoted table names
        jdbc.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?",
                (java.sql.ResultSet rs) -> {
                    while (rs.next()) {
                        actualColumns.put(rs.getString("column_name"), rs.getString("data_type").toLowerCase());
                    }
                    return null;
                }, tableName.toLowerCase());

        List<String> errors = new ArrayList<>();
        for (Map<String, Object> field : metadataFields) {
            String fieldKey = (String) field.get("field_key");
            String fieldType = (String) field.get("field_type");
            
            if (!actualColumns.containsKey(fieldKey)) {
                errors.add(String.format("Column '%s' is missing", fieldKey));
                continue;
            }

            String expectedSqlType = sqlType(fieldType).toLowerCase();
            String actualSqlType = actualColumns.get(fieldKey);
            
            if (!isTypeCompatible(expectedSqlType, actualSqlType)) {
                errors.add(String.format("Column '%s' type mismatch (Expected logic: %s, Database: %s)", 
                        fieldKey, expectedSqlType, actualSqlType));
            }
        }

        if (!errors.isEmpty()) {
            throw new SchemaDriftException(String.format(
                "Decision 4.3 Violation: Physical table '%s' has drifted from metadata in version %s. Errors: [%s]",
                tableName, versionId, String.join("; ", errors)));
        }
    }

    private boolean isTypeCompatible(String expected, String actual) {
        if (expected.equals("text")) {
            return actual.equals("text") || actual.equals("character varying") || actual.equals("varchar");
        }
        if (expected.equals("integer")) {
            return actual.equals("integer") || actual.equals("int4");
        }
        if (expected.equals("numeric")) {
            return actual.equals("numeric") || actual.equals("decimal");
        }
        if (expected.equals("boolean")) {
            return actual.equals("boolean") || actual.equals("bool");
        }
        if (expected.equals("date")) {
            return actual.equals("date");
        }
        return actual.equals(expected);
    }

    /**
     * S3 — Integrity check queries.
     * Query 1: Version mismatch between meta and data table.
     */
    public List<Map<String, Object>> checkVersionMismatches(String tableName) {
        String sql = String.format(
            "SELECT m.id as meta_id, m.form_version_id as meta_v, d.form_version_id as data_v " +
            "FROM form_submission_meta m " +
            "JOIN %s d ON m.submission_row_id = d.id " +
            "WHERE m.form_version_id != d.form_version_id", q(tableName));
        return jdbc.queryForList(sql);
    }

    /**
     * S3 — Integrity check queries.
     * Query 2: Orphaned meta rows.
     */
    public List<Map<String, Object>> checkOrphanedMeta(String tableName) {
        String sql = String.format(
            "SELECT m.id, m.submission_row_id FROM form_submission_meta m " +
            "LEFT JOIN %s d ON m.submission_row_id = d.id " +
            "WHERE m.submission_table = ? AND d.id IS NULL", q(tableName));
        return jdbc.queryForList(sql, tableName);
    }

    /** Check whether a dynamic submission table exists in the database. */
    public boolean tableExists(String tableName) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
                Integer.class, tableName);
        return count != null && count > 0;
    }

    /**
     * Ensures the submission table exists. If the table is missing (e.g. DB was
     * recreated but form metadata survived), it is re-created from the field
     * definitions stored in form_fields.
     */
    public void ensureTableExists(String tableName, UUID formId) {
        if (tableExists(tableName)) {
            return;
        }
        log.warn("Submission table '{}' missing — recreating from form_fields for formId={}", tableName, formId);
        // Fetch field definitions via JDBC (no JPA dependency)
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT DISTINCT field_key, field_type FROM form_fields ff " +
                "JOIN form_versions fv ON ff.form_version_id = fv.id " +
                "WHERE fv.form_id = ?",
                formId);
        // Build minimal FormFieldEntity list for createTable()
        List<FormFieldEntity> fields = new java.util.ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            FormFieldEntity f = new FormFieldEntity();
            f.setFieldKey((String) row.get("field_key"));
            f.setFieldType((String) row.get("field_type"));
            fields.add(f);
        }
        createTable(tableName, fields);
        log.info("Recreated missing table '{}' with {} field columns", tableName, fields.size());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Double-quote an identifier, validating it contains only safe characters. */
    private String q(String identifier) {
        if (!identifier.matches("[a-zA-Z0-9_]+")) {
            throw new IllegalArgumentException("Unsafe SQL identifier rejected: " + identifier);
        }
        return '"' + identifier + '"';
    }

    private String sqlType(String fieldType) {
        String t = SQL_TYPE.get(fieldType);
        if (t == null) {
            throw new IllegalArgumentException("Unknown field type: " + fieldType);
        }
        return t;
    }
}
