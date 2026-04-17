package com.formbuilder.service;

import com.formbuilder.dto.ValidationError;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.exception.SchemaDriftException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Core DDL service — creates / alters / drops the physical submission table
 * for each form using raw JdbcTemplate (NOT Hibernate).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DynamicTableService {

    private static final Map<String, String> SQL_TYPE = Map.ofEntries(
            Map.entry("text", "TEXT"),
            Map.entry("number", "NUMERIC"),
            Map.entry("decimal", "NUMERIC"),
            Map.entry("numeric", "NUMERIC"),
            Map.entry("date", "DATE"),
            Map.entry("time", "TIME"),
            Map.entry("date_time", "TIMESTAMP"),
            Map.entry("boolean", "BOOLEAN"),
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

    /**
     * Converts a human-readable form name or code to a safe PostgreSQL table name.
     */
    public String generateTableName(String code) {
        String sanitized = code.toLowerCase()
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (sanitized.isEmpty()) {
            sanitized = "generic_form";
        }
        return "form_data_" + sanitized;
    }

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

    public void createTable(String tableName, List<FormFieldEntity> fields) {
        String createSql = String.format("""
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
                """, q(tableName));
        log.debug("DDL createTable: {}", createSql.trim());
        jdbc.execute(createSql);

        for (FormFieldEntity field : fields) {
            if (!"field_group".equals(field.getFieldType())) {
                addColumn(tableName, field.getFieldKey(), field.getFieldType());
            }
        }
    }

    public void addDraftColumnsIfMissing(String tableName) {
        try {
            jdbc.execute("ALTER TABLE " + q(tableName) + " ADD COLUMN IF NOT EXISTS form_version_id UUID");
            jdbc.execute("ALTER TABLE " + q(tableName) + " ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT TRUE");
            jdbc.execute("ALTER TABLE " + q(tableName) + " ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)");
        } catch (Exception e) {
            log.warn("Could not add standard columns to {}: {}", tableName, e.getMessage());
        }
    }

    public void addSoftDeleteColumnIfMissing(String tableName) {
        try {
            jdbc.execute("ALTER TABLE " + q(tableName) + " ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN NOT NULL DEFAULT FALSE");
            jdbc.execute("ALTER TABLE " + q(tableName) + " ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
        } catch (Exception e) {
            log.warn("Could not add soft-delete columns to {}: {}", tableName, e.getMessage());
        }
    }

    public void addColumn(String tableName, String fieldKey, String fieldType) {
        if ("field_group".equals(fieldType)) return;
        String sql = "ALTER TABLE " + q(tableName) + " ADD COLUMN IF NOT EXISTS " + q(fieldKey) + " " + sqlType(fieldType);
        jdbc.execute(sql);
    }

    public void addColumnIfMissing(String tableName, String fieldKey, String fieldType) {
        addColumn(tableName, fieldKey, fieldType);
    }

    public void dropColumn(String tableName, String fieldKey) {
        String sql = "ALTER TABLE " + q(tableName) + " DROP COLUMN IF EXISTS " + q(fieldKey);
        jdbc.execute(sql);
    }

    public void alterColumnType(String tableName, String fieldKey, String newFieldType) {
        String type = sqlType(newFieldType);
        String sql = String.format("ALTER TABLE %s ALTER COLUMN %s TYPE %s USING %2$s::%3$s", q(tableName), q(fieldKey), type);
        jdbc.execute(sql);
    }

    public void dropTable(String tableName) {
        jdbc.execute("DROP TABLE IF EXISTS " + q(tableName));
    }

    @Transactional
    public void deleteAllDrafts(UUID formId) {
        String queryMeta = "SELECT id, submission_table, submission_row_id FROM form_submission_meta WHERE form_id = ? AND status = 'DRAFT'";
        List<Map<String, Object>> drafts = jdbc.queryForList(queryMeta, formId);

        for (Map<String, Object> draft : drafts) {
            String rawTable = (String) draft.get("submission_table");
            UUID rowId = (UUID) draft.get("submission_row_id");
            String sqlDeleteData = String.format("DELETE FROM %s WHERE id = ?", q(rawTable));
            jdbc.update(sqlDeleteData, rowId);
        }

        jdbc.update("DELETE FROM form_submission_meta WHERE form_id = ? AND status = 'DRAFT'", formId);
    }

    public List<Map<String, Object>> checkVersionMismatches(String tableName) {
        String sql = String.format(
            "SELECT m.id as meta_id, m.form_version_id as meta_v, d.form_version_id as data_v " +
            "FROM form_submission_meta m " +
            "JOIN %s d ON m.submission_row_id = d.id " +
            "WHERE m.form_version_id != d.form_version_id", q(tableName));
        return jdbc.queryForList(sql);
    }

    public List<Map<String, Object>> checkOrphanedMeta(String tableName) {
        String sql = String.format(
            "SELECT m.id, m.submission_row_id FROM form_submission_meta m " +
            "LEFT JOIN %s d ON m.submission_row_id = d.id " +
            "WHERE m.submission_table = ? AND d.id IS NULL", q(tableName));
        return jdbc.queryForList(sql, tableName);
    }

    public boolean tableExists(String tableName) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?", Integer.class, tableName);
        return count != null && count > 0;
    }

    public void ensureTableExists(String tableName, UUID formId) {
        if (tableExists(tableName)) return;
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT DISTINCT field_key, field_type FROM form_fields ff JOIN form_versions fv ON ff.form_version_id = fv.id WHERE fv.form_id = ?",
                formId);
        List<FormFieldEntity> fields = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            FormFieldEntity f = new FormFieldEntity();
            f.setFieldKey((String) row.get("field_key"));
            f.setFieldType((String) row.get("field_type"));
            fields.add(f);
        }
        createTable(tableName, fields);
    }

    private String q(String identifier) {
        if (!identifier.matches("[a-zA-Z0-9_]+")) throw new IllegalArgumentException("Unsafe SQL identifier: " + identifier);
        return "\"" + identifier + "\"";
    }

    private String sqlType(String fieldType) {
        String t = SQL_TYPE.get(fieldType);
        if (t == null) throw new IllegalArgumentException("Unknown field type: " + fieldType);
        return t;
    }
}
