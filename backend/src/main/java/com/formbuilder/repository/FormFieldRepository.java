package com.formbuilder.repository;

import com.formbuilder.model.FormField;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class FormFieldRepository {

    private final JdbcTemplate jdbc;

    // ── Queries ───────────────────────────────────────────────────────────────

    public List<FormField> findByFormId(UUID formId) {
        return jdbc.query(
                "SELECT * FROM form_fields WHERE form_id = ? ORDER BY field_order ASC",
                rowMapper(), formId);
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    public FormField save(FormField field) {
        String sql = """
                INSERT INTO form_fields
                  (form_id, field_key, label, field_type, required, default_value,
                   validation_regex, field_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
                RETURNING *
                """;
        return jdbc.queryForObject(sql, rowMapper(),
                field.getFormId(),
                field.getFieldKey(),
                field.getLabel(),
                field.getFieldType(),
                field.isRequired(),
                field.getDefaultValue(),
                field.getValidationRegex(),
                field.getFieldOrder());
    }

    public void deleteById(UUID id) {
        jdbc.update("DELETE FROM form_fields WHERE id = ?", id);
    }

    public void deleteByFormId(UUID formId) {
        jdbc.update("DELETE FROM form_fields WHERE form_id = ?", formId);
    }

    // ── RowMapper ─────────────────────────────────────────────────────────────

    private RowMapper<FormField> rowMapper() {
        return (rs, rowNum) -> FormField.builder()
                .id(rs.getObject("id", UUID.class))
                .formId(rs.getObject("form_id", UUID.class))
                .fieldKey(rs.getString("field_key"))
                .label(rs.getString("label"))
                .fieldType(rs.getString("field_type"))
                .required(rs.getBoolean("required"))
                .defaultValue(rs.getString("default_value"))
                .validationRegex(rs.getString("validation_regex"))
                .fieldOrder(rs.getInt("field_order"))
                .createdAt(rs.getTimestamp("created_at").toLocalDateTime())
                .build();
    }
}
