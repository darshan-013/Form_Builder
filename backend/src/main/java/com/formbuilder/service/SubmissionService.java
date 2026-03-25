package com.formbuilder.service;

import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.exception.ValidationException;
import com.formbuilder.repository.FormJpaRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper;

    private final JdbcTemplate jdbc;
    private final FormJpaRepository formRepo;
    private final com.formbuilder.repository.FormVersionRepository versionRepo;
    private final ValidationService validationService;
    private final CalculationEngine calculationEngine;
    private final RuleEvaluator ruleEvaluator;
    private final DynamicTableService dynamicTableService;

    // ─────────────────────────────────────────────────────────────────────────
    // METADATA & STATUS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Requirement 3.4: A form has live submissions if there is at least one
     * record that is NOT a draft and NOT soft-deleted.
     */
    public boolean hasLiveSubmissions(UUID formId) {
        try {
            String tableName = getTableName(formId);
            String sql = "SELECT COUNT(*) FROM " + tableName + " WHERE is_draft = false AND is_soft_deleted = false";
            Integer count = jdbc.queryForObject(sql, Integer.class);
            return count != null && count > 0;
        } catch (Exception e) {
            log.warn("Could not check live submissions for form {}: {}", formId, e.getMessage());
            return false;
        }
    }

    /**
     * Requirement 3.2: Drop all existing drafts for the previous version
     * upon new version activation (publication).
     */
    @Transactional
    public void clearRespondentDrafts(UUID formId) {
        try {
            String tableName = getTableName(formId);
            // 1. Clear from dynamic data table
            jdbc.update("DELETE FROM " + tableName + " WHERE is_draft = true");
            // 2. Clear from meta-index
            jdbc.update("DELETE FROM form_submission_meta WHERE form_id = ? AND status = 'DRAFT'", formId);
            log.info("Requirement 3.2: Cleared respondent drafts for form {}.", formId);
        } catch (Exception e) {
            log.warn("Failed to clear respondent drafts for form {}: {}", formId, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATE — direct JDBC, bypasses JPA FetchType.LAZY + open-in-view:false
    // ─────────────────────────────────────────────────────────────────────────

    public void validate(UUID formId, Map<String, Object> data, Map<String, MultipartFile> files) {
        String tableName = getTableName(formId);
        UUID versionId = resolveVersionForNewSubmission(formId);

        // SRS Decision 4.3: Fast-fail Drift Detection
        dynamicTableService.validateSchema(tableName, versionId);

        // Fetch ALL groups for this SPECIFIC version
        List<Map<String, Object>> groupRows = jdbc.queryForList(
                "SELECT id, rules_json FROM form_groups WHERE form_version_id = ?", versionId);
        Map<UUID, String> groupRules = new HashMap<>();
        for (Map<String, Object> grow : groupRows) {
            groupRules.put((UUID) grow.get("id"), (String) grow.get("rules_json"));
        }

        // JOIN shared_options for metadata
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT ff.field_key, ff.label, ff.field_type, ff.required, " +
                        "ff.validation_json, ff.validation_regex, ff.shared_options_id, ff.ui_config_json, " +
                        "ff.rules_json, ff.group_id, " +
                        "so.options_json " +
                        "FROM form_fields ff " +
                        "LEFT JOIN shared_options so ON ff.shared_options_id = so.id " +
                        "WHERE ff.form_version_id = ? ORDER BY ff.field_order ASC",
                versionId);

        log.info("validate() form={} version={} fields={} keys={}",
                formId, versionId, fieldRows.size(), data != null ? data.keySet() : "none");

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
        // Updating existing submission: resolve version from its own row
        UUID versionId = resolveVersionForDraftResumption(UUID.fromString(data.get("id").toString()));

        // JOIN shared_options to carry options_json for dropdown/radio validation
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT ff.field_key, ff.label, ff.field_type, ff.required, " +
                        "ff.validation_json, ff.validation_regex, ff.shared_options_id, ff.ui_config_json, " +
                        "so.options_json " +
                        "FROM form_fields ff " +
                        "LEFT JOIN shared_options so ON ff.shared_options_id = so.id " +
                        "WHERE ff.form_version_id = ? ORDER BY ff.field_order ASC",
                versionId);

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
    // DRAFT
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public UUID saveDraft(UUID formId, String userId, Map<String, Object> data, UUID submissionId) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        dynamicTableService.addDraftColumnsIfMissing(tableName);

        UUID versionId;
        if (submissionId == null) {
            // PATH A — New submission/draft: resolve authoritative active version
            versionId = resolveVersionForNewSubmission(formId);

            submissionId = UUID.randomUUID();
            // R6: Meta-index record must exist BEFORE data table insert
            jdbc.update("INSERT INTO form_submission_meta (id, form_id, form_version_id, user_id, status, submission_table, submission_row_id) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)",
                    submissionId, formId, versionId, userId, tableName, submissionId);

            insertDynamicRow(tableName, submissionId, versionId, userId, "DRAFTED", data);
        } else {
            // PATH B — Draft resumption: resolve version from meta-index
            versionId = resolveVersionForDraftResumption(submissionId);
            updateDynamicRow(tableName, submissionId, versionId, data);
        }
        return submissionId;
    }

    private UUID resolveVersionForNewSubmission(UUID formId) {
        com.formbuilder.entity.FormEntity form = formRepo.findById(formId)
                .orElseThrow(() -> new com.formbuilder.exception.SubmissionNotFoundException("Form not found."));


        return versionRepo.findByFormIdAndIsActiveTrue(formId)
                .map(com.formbuilder.entity.FormVersionEntity::getId)
                .orElseThrow(() -> new com.formbuilder.exception.NoActiveVersionException(
                        "This form has no active version. Contact an administrator."));
    }

    private UUID resolveVersionForDraftResumption(UUID submissionId) {
        try {
            Map<String, Object> meta = jdbc.queryForMap(
                    "SELECT form_version_id, status FROM form_submission_meta WHERE id = ?", submissionId);

            if (!"DRAFT".equals(meta.get("status"))) {
                throw new com.formbuilder.exception.SubmissionNotFoundException(
                        "This submission has already been finalized.");
            }
            UUID versionId = (UUID) meta.get("form_version_id");

            // Requirement 3.1: Validate that the version is still active
            boolean isActive = versionRepo.findById(versionId)
                    .map(com.formbuilder.entity.FormVersionEntity::isActive)
                    .orElse(false);

            if (!isActive) {
                throw new com.formbuilder.exception.NoActiveVersionException(
                        "This form version is no longer active. Your draft cannot be resumed.");
            }

            return versionId;
        } catch (org.springframework.dao.EmptyResultDataAccessException e) {
            throw new com.formbuilder.exception.SubmissionNotFoundException("Draft not found.");
        }
    }

    private void insertDynamicRow(String tableName, UUID id, UUID versionId, String userId, String status,
            Map<String, Object> data) {
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type FROM form_fields WHERE form_version_id = ?", versionId);

        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();

        cols.add("id");
        vals.add(id);
        cols.add("form_version_id");
        vals.add(versionId);
        cols.add("is_draft");
        vals.add("DRAFTED".equals(status));
        if (userId != null) {
            cols.add("user_id");
            vals.add(userId);
        }

        for (Map<String, Object> row : fieldRows) {
            String key = (String) row.get("field_key");
            String type = (String) row.get("field_type");
            if ("field_group".equals(type) || "file".equals(type))
                continue;
            cols.add("\"" + key + "\"");
            vals.add(data != null ? convertValue(data.get(key), type) : null);
        }

        String sql = String.format("INSERT INTO \"%s\" (%s) VALUES (%s)",
                tableName, String.join(", ", cols), cols.stream().map(c -> "?").collect(Collectors.joining(", ")));
        jdbc.update(sql, vals.toArray());
    }

    private void updateDynamicRow(String tableName, UUID id, UUID versionId, Map<String, Object> data) {
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type FROM form_fields WHERE form_version_id = ?", versionId);

        List<String> setClauses = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String key = (String) row.get("field_key");
            String type = (String) row.get("field_type");
            if ("file".equals(type) || "field_group".equals(type))
                continue;
            if (data != null && data.containsKey(key)) {
                setClauses.add("\"" + key + "\" = ?");
                vals.add(convertValue(data.get(key), type));
            }
        }
        setClauses.add("updated_at = NOW()");
        vals.add(id);

        String sql = String.format("UPDATE \"%s\" SET %s WHERE id = ?", tableName, String.join(", ", setClauses));
        jdbc.update(sql, vals.toArray());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INSERT
    // ─────────────────────────────────────────────────────────────────────────

    public void insert(UUID formId, Map<String, Object> data) {
        insertInternal(formId, data, null, "SUBMITTED");
    }

    private void insertInternal(UUID formId, Map<String, Object> data, String userId, String status) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        dynamicTableService.addDraftColumnsIfMissing(tableName);

        UUID versionId = resolveVersionForNewSubmission(formId);
        com.formbuilder.entity.FormVersionEntity version = versionRepo.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));

        // Fetch all field metadata including calculated-field columns
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type, default_value, " +
                        "is_calculated, formula_expression, calc_precision " +
                        "FROM form_fields WHERE form_version_id = ? ORDER BY field_order ASC",
                versionId);

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

        cols.add("is_draft");
        vals.add(!"SUBMITTED".equals(status));
        cols.add("form_version_id");
        vals.add(versionId);

        if (userId != null) {
            cols.add("user_id");
            vals.add(userId);
        }

        String table = '"' + tableName + '"';
        String sql = "INSERT INTO " + table
                + " (" + String.join(", ", cols) + ")"
                + " VALUES (" + cols.stream().map(c -> "?").collect(Collectors.joining(", ")) + ")";
        log.debug("INSERT: {}", sql);
        jdbc.update(sql, vals.toArray());
    }

    @Transactional
    public void finalizeSubmission(UUID submissionId, String userId, Map<String, Object> data) {
        // B3: Concurrency Guard - SELECT FOR UPDATE on meta-index
        Map<String, Object> meta = jdbc.queryForMap(
                "SELECT form_id, form_version_id, status FROM form_submission_meta WHERE id = ? FOR UPDATE",
                submissionId);

        if (!"DRAFT".equals(meta.get("status"))) {
            // Already submitted or in restricted state
            throw new IllegalStateException("SUBMISSION_ALREADY_FINALIZED");
        }

        UUID formId = (UUID) meta.get("form_id");
        UUID versionId = (UUID) meta.get("form_version_id");
        String tableName = getTableName(formId);

        // Update Dynamic Data
        updateDynamicRow(tableName, submissionId, versionId, data);
        jdbc.update(String.format("UPDATE \"%s\" SET is_draft = FALSE, updated_at = NOW() WHERE id = ?", tableName),
                submissionId);

        // Update Meta Status
        jdbc.update("UPDATE form_submission_meta SET status = 'SUBMITTED', updated_at = NOW() WHERE id = ?",
                submissionId);

        log.info("B3: Submission {} finalized under version {}.", submissionId, versionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // READ
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> findDraft(UUID formId, String userId) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        dynamicTableService.addDraftColumnsIfMissing(tableName);

        // Fetch from meta-index first (the authority)
        List<Map<String, Object>> metaRows = jdbc.queryForList(
                "SELECT id, form_version_id FROM form_submission_meta WHERE form_id = ? AND user_id = ? AND status = 'DRAFT' ORDER BY updated_at DESC LIMIT 1",
                formId, userId);

        if (metaRows.isEmpty())
            return null;

        UUID submissionId = (UUID) metaRows.get(0).get("id");
        UUID versionId = (UUID) metaRows.get(0).get("form_version_id");

        List<Map<String, Object>> rows = jdbc.queryForList(
                String.format("SELECT * FROM \"%s\" WHERE id = ?", tableName), submissionId);

        if (rows.isEmpty())
            return null;

        Map<String, Object> draft = new LinkedHashMap<>(rows.get(0));
        draft.put("submissionId", submissionId);
        draft.put("formVersionId", versionId);
        return draft;
    }

    public List<Map<String, Object>> getSubmissions(UUID formId, boolean activeOnly, UUID versionId) {
        String tableName = getTableName(formId);
        // Ensure the dynamic submission table exists (recreate if missing)
        dynamicTableService.ensureTableExists(tableName, formId);
        // Ensure draft columns exist (migration for pre-existing tables)
        dynamicTableService.addDraftColumnsIfMissing(tableName);
        dynamicTableService.addSoftDeleteColumnIfMissing(tableName);

        if (versionId != null) {
            return jdbc.queryForList(
                    String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = FALSE AND form_version_id = ? ORDER BY created_at DESC",
                            tableName), versionId);
        }

        if (activeOnly) {
            Optional<UUID> activeVersionId = versionRepo.findByFormIdAndIsActiveTrue(formId)
                    .map(com.formbuilder.entity.FormVersionEntity::getId);
            if (activeVersionId.isPresent()) {
                return jdbc.queryForList(
                        String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = FALSE AND form_version_id = ? ORDER BY created_at DESC",
                                tableName), activeVersionId.get());
            }
            // If no active version, but activeOnly is true, return empty list (or all?)
            // Usually no active version means no results for this filter.
            return Collections.emptyList();
        }

        return jdbc.queryForList(
                String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = FALSE ORDER BY created_at DESC",
                        tableName));
    }

    public Map<String, Object> getSubmission(UUID formId, UUID submissionId) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM \"" + tableName + "\" WHERE id = ?", submissionId);
        if (rows.isEmpty())
            throw new NoSuchElementException("Submission not found: " + submissionId);
        return rows.get(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE / SOFT DELETE
    // ─────────────────────────────────────────────────────────────────────────

    /** Soft-delete: marks submission as deleted, hides from active view. */
    public void deleteSubmission(UUID formId, UUID submissionId) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        int affected = jdbc.update(
                String.format(
                        "UPDATE \"%s\" SET is_soft_deleted = TRUE, deleted_at = NOW() WHERE id = ? AND is_soft_deleted = FALSE",
                        tableName),
                submissionId);
        if (affected == 0)
            throw new NoSuchElementException("Submission not found or already deleted: " + submissionId);
        log.info("Submission {} soft-deleted from {}", submissionId, tableName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> updateSubmission(UUID formId, UUID submissionId, Map<String, Object> data) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);

        // Find which version this submission belongs to
        Map<String, Object> sub = getSubmission(formId, submissionId);
        UUID versionId = (UUID) sub.get("form_version_id");

        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type FROM form_fields WHERE form_version_id = ?", versionId);

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
        String sql = String.format("UPDATE \"%s\" SET %s WHERE id = ?", tableName, String.join(", ", setClauses));
        log.debug("UPDATE: {}", sql);
        int affected = jdbc.update(sql, vals.toArray());
        if (affected == 0)
            throw new NoSuchElementException("Submission not found: " + submissionId);
        return getSubmission(formId, submissionId);
    }

    // Removed deprecated getVersionIdFromData per [B2] path separation requirement.

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private String getTableName(UUID formId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT table_name FROM forms WHERE id = ?", formId);
        if (rows.isEmpty())
            throw new NoSuchElementException("Form not found: " + formId);

        String tableName = (String) rows.get(0).get("table_name");

        // E4 compliance: Validate table name pattern
        if (tableName == null || !tableName.matches("^form_data_[a-z0-9_]+$")) {
            log.error("Invalid table name detected for form {}: {}", formId, tableName);
            throw new IllegalStateException("Security violation: Invalid table name.");
        }

        return tableName;
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
