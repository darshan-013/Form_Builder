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
import java.util.UUID;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final JdbcTemplate jdbc;
    private final FormJpaRepository formRepo;
    private final ValidationService validationService;
    private final CalculationEngine calculationEngine;
    private final RuleEvaluator ruleEvaluator;

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATE — direct JDBC, bypasses JPA FetchType.LAZY + open-in-view:false
    // ─────────────────────────────────────────────────────────────────────────

    public void validate(UUID formId, Map<String, Object> data, Map<String, MultipartFile> files) {
        String tableName = getTableName(formId);

        // Fetch ALL groups for this form to check group-level visibility rules
        List<Map<String, Object>> groupRows = jdbc.queryForList(
                "SELECT id, rules_json FROM form_groups WHERE form_id = ?", formId);
        Map<UUID, String> groupRules = new HashMap<>();
        for (Map<String, Object> grow : groupRows) {
            groupRules.put((UUID) grow.get("id"), (String) grow.get("rules_json"));
        }

        // JOIN shared_options so options_json is available for dropdown/radio
        // validation
        // without any JPA/repo calls inside the validation path
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT ff.field_key, ff.label, ff.field_type, ff.required, " +
                        "ff.validation_json, ff.validation_regex, ff.shared_options_id, ff.ui_config_json, " +
                        "ff.rules_json, ff.group_id, " +
                        "so.options_json " +
                        "FROM form_fields ff " +
                        "LEFT JOIN shared_options so ON ff.shared_options_id = so.id " +
                        "WHERE ff.form_id = ? ORDER BY ff.field_order ASC",
                formId);

        log.info("validate() form={} fields={} keys={}",
                formId, fieldRows.size(), data != null ? data.keySet() : "none");

        Map<String, List<String>> fieldErrors = new LinkedHashMap<>();

        // Cache group visibility results to avoid redundant evaluations
        Map<UUID, Boolean> groupVisibility = new HashMap<>();

        for (Map<String, Object> row : fieldRows) {
            String fieldKey = (String) row.get("field_key");
            UUID groupId = (UUID) row.get("group_id");

            // 1. Check if the field belongs to a HIDDEN group
            if (groupId != null) {
                boolean isGroupVisible = groupVisibility.computeIfAbsent(groupId, id -> {
                    String grules = groupRules.get(id);
                    return ruleEvaluator.isVisible(grules, data);
                });
                if (!isGroupVisible) {
                    log.debug("  SKIPPING field '{}' (parent group {} is hidden)", fieldKey, groupId);
                    continue;
                }
            }

            // 2. Check if the field ITSELF is hidden by its own rules
            String fieldRules = (String) row.get("rules_json");
            if (!ruleEvaluator.isVisible(fieldRules, data)) {
                log.debug("  SKIPPING field '{}' (field itself is hidden)", fieldKey);
                continue;
            }

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

        if (!fieldErrors.isEmpty())
            throw new ValidationException(fieldErrors);
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
                        "WHERE ff.form_id = ? ORDER BY ff.field_order ASC",
                formId);

        Map<String, List<String>> fieldErrors = new LinkedHashMap<>();
        for (Map<String, Object> row : fieldRows) {
            String fieldKey = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");
            if ("file".equals(fieldType))
                continue;
            if (!data.containsKey(fieldKey))
                continue;

            FormFieldEntity field = rowToField(row);
            List<String> errs = validationService.validateField(field, data.get(fieldKey), tableName, null);
            if (!errs.isEmpty())
                fieldErrors.put(fieldKey, errs);
        }
        if (!fieldErrors.isEmpty())
            throw new ValidationException(fieldErrors);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INSERT
    // ─────────────────────────────────────────────────────────────────────────

    public void insert(UUID formId, Map<String, Object> data) {
        String tableName = getTableName(formId);

        // Fetch all field metadata including calculated-field columns
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type, default_value, " +
                        "is_calculated, formula_expression, calc_precision " +
                        "FROM form_fields WHERE form_id = ? ORDER BY field_order ASC",
                formId);

        // ── Backend recalculation: prevent client tampering of formula values ──
        // Build working values: submitted data with defaults for any missing key
        Map<String, Object> workingValues = new LinkedHashMap<>();
        for (Map<String, Object> row : fieldRows) {
            String key = (String) row.get("field_key");
            Object val = (data != null) ? data.get(key) : null;
            if (val == null)
                val = row.get("default_value");
            workingValues.put(key, val);
        }
        // Override calculated fields with server-evaluated results
        workingValues = calculationEngine.recalculate(fieldRows, workingValues);
        final Map<String, Object> finalValues = workingValues;

        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String fieldKey = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");

            if ("field_group".equals(fieldType)) {
                continue;
            }

            Object value = finalValues.get(fieldKey);
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
        String tableName = getTableName(formId);
        // Ensure soft-delete column exists (migration for pre-existing tables)
        try {
            return jdbc.queryForList(
                    "SELECT * FROM \"" + tableName + "\" WHERE is_soft_deleted = FALSE ORDER BY created_at DESC");
        } catch (Exception e) {
            // Column does not exist yet on old tables — add it and retry
            log.warn("is_soft_deleted column missing on {}, adding it now", tableName);
            jdbc.execute("ALTER TABLE \"" + tableName
                    + "\" ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN NOT NULL DEFAULT FALSE");
            jdbc.execute("ALTER TABLE \"" + tableName + "\" ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
            return jdbc.queryForList(
                    "SELECT * FROM \"" + tableName + "\" WHERE is_soft_deleted = FALSE ORDER BY created_at DESC");
        }
    }

    public Map<String, Object> getSubmission(UUID formId, UUID submissionId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM \"" + getTableName(formId) + "\" WHERE id = ?", submissionId);
        if (rows.isEmpty())
            throw new NoSuchElementException("Submission not found: " + submissionId);
        return rows.get(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE / SOFT DELETE / TRASH
    // ─────────────────────────────────────────────────────────────────────────

    /** Soft-delete: marks submission as trashed, hides from active view. */
    public void deleteSubmission(UUID formId, UUID submissionId) {
        String tableName = getTableName(formId);
        int affected = jdbc.update(
                "UPDATE \"" + tableName + "\" SET is_soft_deleted = TRUE, deleted_at = NOW() " +
                        "WHERE id = ? AND is_soft_deleted = FALSE",
                submissionId);
        if (affected == 0)
            throw new NoSuchElementException("Submission not found or already deleted: " + submissionId);
        log.info("Submission {} soft-deleted from {}", submissionId, tableName);
    }

    /** Returns all soft-deleted submissions for a form (trash bin). */
    public List<Map<String, Object>> getTrashSubmissions(UUID formId) {
        String tableName = getTableName(formId);
        try {
            return jdbc.queryForList(
                    "SELECT * FROM \"" + tableName + "\" WHERE is_soft_deleted = TRUE ORDER BY deleted_at DESC");
        } catch (Exception e) {
            log.warn("is_soft_deleted column missing on {}, returning empty trash", tableName);
            return java.util.Collections.emptyList();
        }
    }

    /** Restore a soft-deleted submission back to active. */
    public void restoreSubmission(UUID formId, UUID submissionId) {
        String tableName = getTableName(formId);
        int affected = jdbc.update(
                "UPDATE \"" + tableName + "\" SET is_soft_deleted = FALSE, deleted_at = NULL " +
                        "WHERE id = ? AND is_soft_deleted = TRUE",
                submissionId);
        if (affected == 0)
            throw new NoSuchElementException("Submission not found in trash: " + submissionId);
        log.info("Submission {} restored in {}", submissionId, tableName);
    }

    /** Permanently delete a submission that is already in trash. */
    public void permanentDeleteSubmission(UUID formId, UUID submissionId) {
        String tableName = getTableName(formId);
        int affected = jdbc.update(
                "DELETE FROM \"" + tableName + "\" WHERE id = ? AND is_soft_deleted = TRUE", submissionId);
        if (affected == 0)
            throw new NoSuchElementException("Submission not found in trash: " + submissionId);
        log.info("Submission {} permanently deleted from {}", submissionId, tableName);
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
            String fieldKey = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");
            if ("file".equals(fieldType) || "field_group".equals(fieldType))
                continue;
            if (!data.containsKey(fieldKey))
                continue;
            setClauses.add("\"" + fieldKey + "\" = ?");
            vals.add(convertValue(data.get(fieldKey), fieldType));
        }
        if (setClauses.isEmpty())
            throw new IllegalArgumentException("No updatable fields provided");

        vals.add(submissionId);
        String sql = "UPDATE \"" + tableName + "\" SET "
                + String.join(", ", setClauses) + " WHERE id = ?";
        log.debug("UPDATE: {}", sql);
        int affected = jdbc.update(sql, vals.toArray());
        if (affected == 0)
            throw new NoSuchElementException("Submission not found: " + submissionId);
        return getSubmission(formId, submissionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private String getTableName(UUID formId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT table_name FROM forms WHERE id = ?", formId);
        if (rows.isEmpty())
            throw new NoSuchElementException("Form not found: " + formId);
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
        f.setRulesJson((String) row.get("rules_json"));
        f.setGroupId((UUID) row.get("group_id"));
        // Carry resolved options_json (from shared_options JOIN) into the entity
        f.setOptionsJson((String) row.get("options_json"));
        Object sid = row.get("shared_options_id");
        if (sid instanceof UUID uid)
            f.setSharedOptionsId(uid);
        else if (sid != null) {
            try {
                f.setSharedOptionsId(UUID.fromString(sid.toString()));
            } catch (IllegalArgumentException ignored) {
            }
        }
        return f;
    }

    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();

    private Object convertValue(Object value, String fieldType) {
        if (value == null)
            return null;

        // If value is a List (e.g., multi-select dropdown from JSON array deserialized
        // by Jackson),
        // serialize it to a proper JSON array string before further processing.
        // value.toString() on a List produces [Item1, Item2] (no quotes) which is
        // invalid JSON.
        if (value instanceof List) {
            try {
                value = objectMapper.writeValueAsString(value); // now it's ["Item1","Item2"]
            } catch (Exception e) {
                log.warn("convertValue: failed to serialize List to JSON: {}", e.getMessage());
            }
        }

        String s = value.toString().trim();
        if (s.isEmpty())
            return null;
        try {
            return switch (fieldType) {
                case "number" -> {
                    try {
                        yield Integer.parseInt(s);
                    } catch (NumberFormatException e) {
                        yield Double.parseDouble(s);
                    }
                }
                case "linear_scale", "star_rating" -> {
                    // Always stored as INTEGER — parse the numeric string sent from frontend
                    try {
                        yield Integer.parseInt(s);
                    } catch (NumberFormatException e) {
                        yield (int) Math.round(Double.parseDouble(s));
                    }
                }
                case "multiple_choice_grid" -> s; // stored as JSON TEXT {"Row":"Col"}
                case "checkbox_grid" -> s; // stored as JSON TEXT {"Row":["ColA","ColB"]}
                case "date" -> java.sql.Date.valueOf(s);
                case "boolean" -> switch (s.toLowerCase()) {
                    case "true", "1", "yes", "on" -> true;
                    case "false", "0", "no", "off" -> false;
                    default -> Boolean.parseBoolean(s);
                };
                case "dropdown" -> {
                    // Could be a JSON array "[\"a\", \"b\"]" or a raw string "India"
                    if (s.startsWith("[")) {
                        yield s; // already JSON array string
                    } else {
                        // Store single select as a JSON string to keep DB column uniformly JSON
                        // example: "India" -> "\"India\""
                        yield "\"" + s.replace("\"", "\\\"") + "\"";
                    }
                }
                default -> s;
            };
        } catch (Exception e) {
            log.warn("convertValue: '{}' → '{}' failed: {}", value, fieldType, e.getMessage());
            return null;
        }
    }
}
