package com.formbuilder.service;

import com.formbuilder.entity.FormFieldEntity;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

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
            Map.entry("date", "DATE"),
            Map.entry("boolean", "BOOLEAN"),
            Map.entry("dropdown", "TEXT"), // Changed from VARCHAR(255) to TEXT to support JSON arrays
            Map.entry("radio", "VARCHAR(255)"),
            Map.entry("multiple_choice", "TEXT"),
            Map.entry("linear_scale", "INTEGER"),
            Map.entry("file", "TEXT"),
            Map.entry("multiple_choice_grid", "TEXT"),
            Map.entry("star_rating", "INTEGER"), // 1–5 stars, stored as integer
            Map.entry("checkbox_grid", "TEXT") // JSON {"Row":["ColA","ColB"]}
    );

    private final JdbcTemplate jdbc;

    // ── Table Name Generation ─────────────────────────────────────────────────

    /**
     * Converts a human-readable form name to a safe PostgreSQL table name.
     * Format: form_<sanitized>_<6-char-hex>
     */
    public String generateTableName(String formName) {
        String sanitized = formName.toLowerCase()
                .replaceAll("[^a-z0-9]+", "_") // replace non-alphanumeric runs with _
                .replaceAll("^_+|_+$", ""); // trim leading/trailing underscores
        if (sanitized.length() > 20) {
            sanitized = sanitized.substring(0, 20);
        }
        if (sanitized.isEmpty()) {
            sanitized = "form";
        }
        String shortId = UUID.randomUUID().toString().replace("-", "").substring(0, 6);
        return "form_" + sanitized + "_" + shortId;
    }

    // ── Public DDL API ────────────────────────────────────────────────────────

    /**
     * Step 1: CREATE TABLE with base columns only.
     * Step 2: ALTER TABLE ADD COLUMN for every field in the form.
     */
    public void createTable(String tableName, List<FormFieldEntity> fields) {
        // Step 1 — base table structure
        String create = """
                CREATE TABLE %s (
                    id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
                    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
                    is_soft_deleted BOOLEAN   NOT NULL DEFAULT FALSE,
                    deleted_at      TIMESTAMP,
                    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFTED',
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
                    " ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFTED'");
            jdbc.execute("ALTER TABLE " + q(tableName) +
                    " ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)");
            log.debug("Draft columns ensured for table: {}", tableName);
        } catch (Exception e) {
            log.warn("Could not add draft columns to {}: {}", tableName, e.getMessage());
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
                "SELECT field_key, field_type FROM form_fields WHERE form_id = ? ORDER BY field_order ASC",
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
