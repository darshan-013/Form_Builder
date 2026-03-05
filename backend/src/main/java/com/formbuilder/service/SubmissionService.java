package com.formbuilder.service;


import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.exception.ValidationException;
import com.formbuilder.repository.FormJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final JdbcTemplate jdbc;
    private final FormJpaRepository formRepo;
    private final ValidationService validationService;

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATE — direct JDBC, bypasses JPA FetchType.LAZY + open-in-view:false
    // ─────────────────────────────────────────────────────────────────────────

    public void validate(UUID formId, Map<String, Object> data, Map<String, MultipartFile> files) {
        String tableName = getTableName(formId);

        // JOIN shared_options so options_json is available for dropdown/radio validation
        // without any JPA/repo calls inside the validation path
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT ff.field_key, ff.label, ff.field_type, ff.required, " +
                "ff.validation_json, ff.validation_regex, ff.shared_options_id, ff.ui_config_json, " +
                "so.options_json " +
                "FROM form_fields ff " +
                "LEFT JOIN shared_options so ON ff.shared_options_id = so.id " +
                "WHERE ff.form_id = ? ORDER BY ff.field_order ASC", formId);

        log.info("validate() form={} fields={} keys={}",
                formId, fieldRows.size(), data != null ? data.keySet() : "none");

        Map<String, List<String>> fieldErrors = new LinkedHashMap<>();
        for (Map<String, Object> row : fieldRows) {
            FormFieldEntity field = rowToField(row);
            log.debug("  checking '{}' type={} required={} validationJson={} hasOptions={}",
                    field.getFieldKey(), field.getFieldType(),
                    field.isRequired(), field.getValidationJson(),
                    field.getOptionsJson() != null);
            Object value = (data != null) ? data.get(field.getFieldKey()) : null;
            List<String> errs = validationService.validateField(field, value, tableName, files);
            if (!errs.isEmpty()) {
                log.debug("  FAIL '{}': {}", field.getFieldKey(), errs);
                fieldErrors.put(field.getFieldKey(), errs);
            }
        }

        if (!fieldErrors.isEmpty()) throw new ValidationException(fieldErrors);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATE UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    public void validateUpdate(UUID formId, Map<String, Object> data) {
        String tableName = getTableName(formId);

        // JOIN shared_options to carry options_json for dropdown/radio validation
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT ff.field_key, ff.label, ff.field_type, ff.required, " +
                "ff.validation_json, ff.validation_regex, ff.shared_options_id, ff.ui_config_json, " +
                "so.options_json " +
                "FROM form_fields ff " +
                "LEFT JOIN shared_options so ON ff.shared_options_id = so.id " +
                "WHERE ff.form_id = ? ORDER BY ff.field_order ASC", formId);

        Map<String, List<String>> fieldErrors = new LinkedHashMap<>();
        for (Map<String, Object> row : fieldRows) {
            String fieldKey  = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");
            if ("file".equals(fieldType)) continue;
            if (!data.containsKey(fieldKey)) continue;

            FormFieldEntity field = rowToField(row);
            List<String> errs = validationService.validateField(field, data.get(fieldKey), tableName, null);
            if (!errs.isEmpty()) fieldErrors.put(fieldKey, errs);
        }
        if (!fieldErrors.isEmpty()) throw new ValidationException(fieldErrors);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INSERT
    // ─────────────────────────────────────────────────────────────────────────

    public void insert(UUID formId, Map<String, Object> data) {
        String tableName = getTableName(formId);

        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type, default_value " +
                "FROM form_fields WHERE form_id = ? ORDER BY field_order ASC", formId);

        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String fieldKey  = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");
            Object value     = (data != null) ? data.get(fieldKey) : null;
            if (value == null) value = row.get("default_value");
            cols.add('"' + fieldKey + '"');
            vals.add(convertValue(value, fieldType));
        }

        String table = '"' + tableName + '"';
        if (cols.isEmpty()) {
            jdbc.update("INSERT INTO " + table + " DEFAULT VALUES");
        } else {
            String sql = "INSERT INTO " + table
                    + " (" + String.join(", ", cols) + ")"
                    + " VALUES (" + cols.stream().map(c -> "?").collect(Collectors.joining(", ")) + ")";
            log.debug("INSERT: {}", sql);
            jdbc.update(sql, vals.toArray());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // READ
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getSubmissions(UUID formId) {
        return jdbc.queryForList(
                "SELECT * FROM \"" + getTableName(formId) + "\" ORDER BY created_at DESC");
    }

    public Map<String, Object> getSubmission(UUID formId, UUID submissionId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM \"" + getTableName(formId) + "\" WHERE id = ?", submissionId);
        if (rows.isEmpty()) throw new NoSuchElementException("Submission not found: " + submissionId);
        return rows.get(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE
    // ─────────────────────────────────────────────────────────────────────────

    public void deleteSubmission(UUID formId, UUID submissionId) {
        int affected = jdbc.update(
                "DELETE FROM \"" + getTableName(formId) + "\" WHERE id = ?", submissionId);
        if (affected == 0) throw new NoSuchElementException("Submission not found: " + submissionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> updateSubmission(UUID formId, UUID submissionId, Map<String, Object> data) {
        String tableName = getTableName(formId);

        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type FROM form_fields WHERE form_id = ?", formId);

        List<String> setClauses = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String fieldKey  = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");
            if ("file".equals(fieldType)) continue;
            if (!data.containsKey(fieldKey)) continue;
            setClauses.add("\"" + fieldKey + "\" = ?");
            vals.add(convertValue(data.get(fieldKey), fieldType));
        }
        if (setClauses.isEmpty()) throw new IllegalArgumentException("No updatable fields provided");

        vals.add(submissionId);
        String sql = "UPDATE \"" + tableName + "\" SET "
                + String.join(", ", setClauses) + " WHERE id = ?";
        log.debug("UPDATE: {}", sql);
        int affected = jdbc.update(sql, vals.toArray());
        if (affected == 0) throw new NoSuchElementException("Submission not found: " + submissionId);
        return getSubmission(formId, submissionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private String getTableName(UUID formId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT table_name FROM forms WHERE id = ?", formId);
        if (rows.isEmpty()) throw new NoSuchElementException("Form not found: " + formId);
        return (String) rows.get(0).get("table_name");
    }

    private FormFieldEntity rowToField(Map<String, Object> row) {
        FormFieldEntity f = new FormFieldEntity();
        f.setFieldKey((String) row.get("field_key"));
        f.setLabel((String) row.get("label"));
        f.setFieldType((String) row.get("field_type"));
        f.setRequired(Boolean.TRUE.equals(row.get("required")));
        f.setValidationJson((String) row.get("validation_json"));
        f.setValidationRegex((String) row.get("validation_regex"));
        f.setUiConfigJson((String) row.get("ui_config_json"));
        // Carry resolved options_json (from shared_options JOIN) into the entity
        f.setOptionsJson((String) row.get("options_json"));
        Object sid = row.get("shared_options_id");
        if (sid instanceof UUID uid) f.setSharedOptionsId(uid);
        else if (sid != null) {
            try { f.setSharedOptionsId(UUID.fromString(sid.toString())); }
            catch (IllegalArgumentException ignored) {}
        }
        return f;
    }

    private Object convertValue(Object value, String fieldType) {
        if (value == null) return null;
        String s = value.toString().trim();
        if (s.isEmpty()) return null;
        try {
            return switch (fieldType) {
                case "number" -> {
                    try { yield Integer.parseInt(s); }
                    catch (NumberFormatException e) { yield Double.parseDouble(s); }
                }
                case "linear_scale" -> {
                    // Always stored as INTEGER — parse the numeric string sent from frontend
                    try { yield Integer.parseInt(s); }
                    catch (NumberFormatException e) { yield (int) Math.round(Double.parseDouble(s)); }
                }
                case "multiple_choice_grid" -> s; // stored as JSON TEXT {"Row":"Col"}
                case "date"    -> java.sql.Date.valueOf(s);
                case "boolean" -> switch (s.toLowerCase()) {
                    case "true",  "1", "yes", "on"  -> true;
                    case "false", "0", "no",  "off" -> false;
                    default -> Boolean.parseBoolean(s);
                };
                default -> s;
            };
        } catch (Exception e) {
            log.warn("convertValue: '{}' → '{}' failed: {}", value, fieldType, e.getMessage());
            return null;
        }
    }
}
