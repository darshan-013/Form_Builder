package com.formbuilder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.exception.ValidationException;
import com.formbuilder.repository.FormJpaRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.time.LocalTime;
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
    private final com.formbuilder.repository.CustomValidationRuleRepository customValidationRepo;
    private final ExpressionEvaluatorService expressionEvaluator;
    private final SchemaManager schemaManager;

    // ─────────────────────────────────────────────────────────────────────────
    // METADATA & STATUS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Requirement 3.4: A form has live submissions if there is at least one
     * active SUBMITTED row in the form submission table.
     */
    public boolean hasLiveSubmissions(UUID formId) {
        try {
            String tableName = getTableName(formId);
            String sql = "SELECT 1 " +
                    "FROM \"" + tableName + "\" d " +
                    "JOIN form_submission_meta m ON m.submission_row_id = d.id " +
                    "WHERE m.form_id = ? AND m.status = 'SUBMITTED' AND d.is_draft = FALSE AND d.is_soft_deleted = FALSE " +
                    "LIMIT 1";
            List<Map<String, Object>> rows = jdbc.queryForList(sql, formId);
            return !rows.isEmpty();
        } catch (Exception e) {
            log.warn("Could not check live submissions for form {}: {}", formId, e.getMessage());
            return false;
        }
    }

    /**
     * Requirement 3.2: Drop all existing drafts for a specific version
     * upon new version activation (publication).
     */
    @Transactional
    public int clearRespondentDrafts(UUID formId, UUID versionId) {
        try {
            String tableName = getTableName(formId);
            
            // 1. Fetch IDs of drafts for this specific version
            List<UUID> draftRowIds = jdbc.queryForList(
                "SELECT submission_row_id FROM form_submission_meta WHERE form_id = ? AND form_version_id = ? AND status = 'DRAFT'",
                UUID.class, formId, versionId);
            
            if (draftRowIds.isEmpty()) return 0;

            // 2. Delete from dynamic data table first (Child data)
            String sqlDeleteDynamic = String.format("DELETE FROM \"%s\" WHERE id IN (%s)", 
                tableName, draftRowIds.stream().map(id -> "?").collect(Collectors.joining(",")));
            jdbc.update(sqlDeleteDynamic, draftRowIds.toArray());

            // 3. Delete from meta-index (Parent entry)
            int affected = jdbc.update("DELETE FROM form_submission_meta WHERE form_id = ? AND form_version_id = ? AND status = 'DRAFT'", 
                formId, versionId);
            
            log.info("Requirement 3.2: Cleared {} respondent drafts for form {} (version {}).", affected, formId, versionId);
            return affected;
        } catch (Exception e) {
            log.error("Failed to clear respondent drafts for form {}: {}", formId, e.getMessage());
            return 0;
        }
    }

    /**
     * Get total live submission count for a form (only active SUBMITTED rows,
     * excluding drafts and soft-deleted rows).
     */
    public long getSubmissionCount(UUID formId) {
        try {
            String tableName = getTableName(formId);
            String sql = "SELECT COUNT(*) FROM \"" + tableName + "\" d " +
                    "JOIN form_submission_meta m ON m.submission_row_id = d.id " +
                    "WHERE m.form_id = ? AND m.status = 'SUBMITTED' AND d.is_draft = FALSE AND d.is_soft_deleted = FALSE";
            Long count = jdbc.queryForObject(sql, Long.class, formId);
            return count != null ? count : 0L;
        } catch (Exception e) {
            // If table doesn't exist yet, count is 0
            return 0L;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATE — direct JDBC, bypasses JPA FetchType.LAZY + open-in-view:false
    // ─────────────────────────────────────────────────────────────────────────

    public void validate(UUID formId, Map<String, Object> data, Map<String, List<MultipartFile>> files) {
        // Safety check: Flatten map if it contains nested 'data' (defensive layer)
        if (data != null && data.containsKey("data") && data.get("data") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> inner = (Map<String, Object>) data.get("data");
            inner.forEach(data::putIfAbsent);
        }

        String tableName = getTableName(formId);
        UUID versionId = resolveVersionForNewSubmission(formId);

        // Policy 10.4: Max payload size: 100 KB
        if (data != null) {
            try {
                byte[] bytes = objectMapper.writeValueAsBytes(data);
                if (bytes.length > 100 * 1024) {
                    throw new ValidationException(Map.of("payload", List.of("Submission payload exceeds the 100KB limit (Policy 10.4)")));
                }
            } catch (Exception e) {
                log.warn("Failed to calculate payload size for form {}: {}", formId, e.getMessage());
            }
        }

        // SRS Decision 4.3: Fast-fail Drift Detection
        schemaManager.validateSchema(tableName, versionId);

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
                        "ff.validation_json, ff.validation_regex, ff.validation_message, ff.shared_options_id, ff.ui_config_json, " +
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
            Object value = (data != null) ? data.get(field.getFieldKey()) : null;

            // Policy 9.5: Backend Sanitization - Trim Whitespace if configured
            if (value instanceof String && field.getValidationJson() != null) {
                try {
                    JsonNode rules = objectMapper.readTree(field.getValidationJson());
                    if (rules.hasNonNull("trimWhitespace") && rules.get("trimWhitespace").asBoolean()) {
                        value = ((String) value).trim();
                        if (data != null) data.put(field.getFieldKey(), value);
                    }
                } catch (Exception ignored) {}
            }

            log.debug("  checking '{}' type={} required={} validationJson={} hasOptions={}",
                    field.getFieldKey(), field.getFieldType(),
                    field.isRequired(), field.getValidationJson(),
                    field.getOptionsJson() != null);
            
            List<String> errs = validationService.validateField(field, value, tableName, files);
            if (!errs.isEmpty()) {
                log.debug("  FAIL '{}': {}", field.getFieldKey(), errs);
                fieldErrors.put(field.getFieldKey(), errs);
            }
        }

        // Custom Validation Engine Integration
        if (fieldErrors.isEmpty()) {
            List<com.formbuilder.entity.CustomValidationRuleEntity> customRules =
                    customValidationRepo.findByFormVersionIdOrderByExecutionOrderAsc(versionId);

            if (!customRules.isEmpty()) {
                log.info("Evaluating {} custom validation rules for version {}", customRules.size(), versionId);

                // Phase 1: Field-Scope Custom Validations
                for (com.formbuilder.entity.CustomValidationRuleEntity rule : customRules) {
                    if (!isExpressionRule(rule.getValidationType())) {
                        continue;
                    }
                    if (rule.getScope() == com.formbuilder.entity.CustomValidationRuleEntity.ValidationRuleScope.FIELD) {
                        if (!expressionEvaluator.evaluate(rule.getExpression(), data)) {
                            // Field scope requires a valid fieldKey; fallback to __general__ if missing
                            String key = (rule.getFieldKey() != null && !rule.getFieldKey().isBlank())
                                    ? rule.getFieldKey()
                                    : "__general__";
                            fieldErrors.computeIfAbsent(key, k -> new ArrayList<>()).add(rule.getErrorMessage());
                        }
                    }
                }

                // Phase 2: Form-Scope Custom Validations (always appear at the top)
                if (fieldErrors.isEmpty()) {
                    for (com.formbuilder.entity.CustomValidationRuleEntity rule : customRules) {
                        if (!isExpressionRule(rule.getValidationType())) {
                            continue;
                        }
                        if (rule.getScope() == com.formbuilder.entity.CustomValidationRuleEntity.ValidationRuleScope.FORM) {
                            if (!expressionEvaluator.evaluate(rule.getExpression(), data)) {
                                // Form scope always goes to general pool
                                fieldErrors.computeIfAbsent("__general__", k -> new ArrayList<>()).add(rule.getErrorMessage());
                            }
                        }
                    }
                }
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
                        "ff.validation_json, ff.validation_regex, ff.validation_message, ff.rules_json, ff.shared_options_id, ff.ui_config_json, " +
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

        // Resolve authenticated user if not provided explicitly
        if (userId == null && SecurityContextHolder.getContext().getAuthentication() != null) {
            userId = SecurityContextHolder.getContext().getAuthentication().getName();
        }

        UUID versionId;
        if (submissionId == null) {
            // PATH A — New draft: resolve current active version
            versionId = resolveVersionForNewSubmission(formId);
            
            // SRS Decision 4.3: Validate schema BEFORE saving even a draft
            schemaManager.checkDrift(formId);

            submissionId = UUID.randomUUID();
            // Use UPSERT logic via ON CONFLICT if we had a natural key, but here we use manual check + atomic meta insert
            // Actually, the unique constraint uq_draft_per_user_form allows us to use ON CONFLICT now
            
            String insertMeta = "INSERT INTO form_submission_meta (id, form_id, form_version_id, submitted_by, status, submission_table, submission_row_id, is_soft_deleted) " +
                                "VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, FALSE) " +
                                "ON CONFLICT (form_id, submitted_by) WHERE status = 'DRAFT' " +
                                "DO UPDATE SET form_version_id = EXCLUDED.form_version_id, " +
                                "is_soft_deleted = FALSE, updated_at = NOW() RETURNING id";
            
            // If user already had a draft for this form, this will return the EXISTING submissionId instead of using the new one
            List<UUID> existingIds = jdbc.queryForList(insertMeta, UUID.class, submissionId, formId, versionId, userId, tableName, submissionId);
            if (!existingIds.isEmpty()) {
                submissionId = existingIds.get(0);
            }

            // Ensure dynamic row exists or update it
            insertOrUpdateDynamicRow(tableName, submissionId, versionId, userId, data);
        } else {
            // PATH B — Draft resumption: resolve version from meta-index
            versionId = resolveVersionForDraftResumption(submissionId);
            schemaManager.checkDrift(formId);
            updateDynamicRow(tableName, submissionId, versionId, data, false);
        }
        return submissionId;
    }

    private void insertOrUpdateDynamicRow(String tableName, UUID id, UUID versionId, String userId, Map<String, Object> data) {
        // Find if row exists in dynamic table
        Integer count = jdbc.queryForObject(String.format("SELECT COUNT(*) FROM \"%s\" WHERE id = ?", tableName), Integer.class, id);
        if (count != null && count > 0) {
            updateDynamicRow(tableName, id, versionId, data, false);
        } else {
            insertDynamicRow(tableName, id, versionId, userId, data);
        }
    }

    private UUID resolveVersionForNewSubmission(UUID formId) {
        if (!formRepo.existsById(formId)) {
            throw new com.formbuilder.exception.SubmissionNotFoundException("Form not found.");
        }


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

    private void insertDynamicRow(String tableName, UUID id, UUID versionId, String userId,
            Map<String, Object> data) {
        // Fetch field metadata for recalculation
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type, is_calculated, formula_expression, calc_precision " +
                        "FROM form_fields WHERE form_version_id = ? ORDER BY field_order ASC",
                versionId);

        // Run Calculation
        Map<String, Object> workingValues = new LinkedHashMap<>(data != null ? data : Map.of());
        try {
            workingValues = calculationEngine.recalculate(fieldRows, workingValues);
        } catch (com.formbuilder.exception.ExpressionEvaluationException e) {
            log.warn("Calculation failed for draft [form={}]: {}", tableName, e.getMessage());
        }

        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();

        cols.add("id");
        vals.add(id);
        cols.add("form_version_id");
        vals.add(versionId);
        cols.add("is_draft");
        vals.add(true);
        if (userId != null) {
            cols.add("user_id");
            vals.add(userId);
        }
        cols.add("is_soft_deleted");
        vals.add(false);

        for (Map<String, Object> row : fieldRows) {
            String key = (String) row.get("field_key");
            String type = (String) row.get("field_type");
            if ("field_group".equals(type) || "file".equals(type))
                continue;
            
            Object val = workingValues.get(key);
            cols.add("\"" + key + "\"");
            vals.add(convertValue(val, type));
        }

        String sql = String.format("INSERT INTO \"%s\" (%s) VALUES (%s)",
                tableName, String.join(", ", cols), cols.stream().map(c -> "?").collect(Collectors.joining(", ")));
        jdbc.update(sql, vals.toArray());
    }

    private void updateDynamicRow(String tableName, UUID id, UUID versionId, Map<String, Object> data, boolean isFinal) {
        List<Map<String, Object>> fieldRows = jdbc.queryForList(
                "SELECT field_key, field_type, is_calculated, formula_expression, calc_precision " +
                        "FROM form_fields WHERE form_version_id = ? ORDER BY field_order ASC",
                versionId);

        // Run Calculation
        Map<String, Object> workingValues = new LinkedHashMap<>(data != null ? data : Map.of());
        try {
            workingValues = calculationEngine.recalculate(fieldRows, workingValues);
        } catch (com.formbuilder.exception.ExpressionEvaluationException e) {
            if (isFinal) {
                throw e; // Fail-Fast for final submit or official update
            } else {
                log.warn("Calculation failed for draft [id={}]: {}", id, e.getMessage());
            }
        }

        List<String> setClauses = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String key = (String) row.get("field_key");
            String type = (String) row.get("field_type");
            if ("file".equals(type) || "field_group".equals(type))
                continue;
            
            // For drafts (isFinal=false): always write ALL fields so the row is fully populated.
            // For final submission: only write fields that were actually submitted to avoid overwriting
            // with nulls when partial data is re-processed.
            if (!isFinal || Boolean.TRUE.equals(row.get("is_calculated")) || (data != null && data.containsKey(key))) {
                setClauses.add("\"" + key + "\" = ?");
                vals.add(convertValue(workingValues.get(key), type));
            }
        }
        setClauses.add("is_soft_deleted = FALSE");
        setClauses.add("updated_at = NOW()");
        vals.add(id);

        String sql = String.format("UPDATE \"%s\" SET %s WHERE id = ?", tableName, String.join(", ", setClauses));
        jdbc.update(sql, vals.toArray());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INSERT
    // ─────────────────────────────────────────────────────────────────────────

    public void insert(UUID formId, Map<String, Object> data) {
        insertInternal(formId, data);
    }

    private void insertInternal(UUID formId, Map<String, Object> data) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        dynamicTableService.addDraftColumnsIfMissing(tableName);

        UUID versionId = resolveVersionForNewSubmission(formId);

        // SRS Decision 4.3: Startup/Submission-time drift detection
        schemaManager.checkDrift(formId);

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
        try {
            workingValues = calculationEngine.recalculate(fieldRows, workingValues);
        } catch (com.formbuilder.exception.ExpressionEvaluationException e) {
            throw e; // Fail-Fast for final submission to ensure data integrity
        }
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
        vals.add(false);
        cols.add("form_version_id");
        vals.add(versionId);

        String table = '"' + tableName + '"';
        String sql = "INSERT INTO " + table
                + " (" + String.join(", ", cols) + ")"
                + " VALUES (" + cols.stream().map(c -> "?").collect(Collectors.joining(", ")) + ")";
        log.debug("INSERT: {}", sql);
        jdbc.update(sql, vals.toArray());
    }

    @Transactional
    public void finalizeSubmission(UUID submissionId, String userId, Map<String, Object> data) {
        // Resolve authenticated user if not provided explicitly
        if (userId == null && SecurityContextHolder.getContext().getAuthentication() != null) {
            userId = SecurityContextHolder.getContext().getAuthentication().getName();
        }

        // B3: Concurrency Guard + Atomic Status Change
        // Attempt to update status to SUBMITTED ONLY if it is currently DRAFT
        int affected = jdbc.update(
            "UPDATE form_submission_meta SET status = 'SUBMITTED', submitted_by = ?, submitted_at = NOW() " +
            "WHERE id = ? AND status = 'DRAFT' AND submitted_by = ?",
            userId, submissionId, userId);

        if (affected == 0) {
            // Could be: already submitted, different user, or draft does not exist
            throw new IllegalStateException("SUBMISSION_ALREADY_FINALIZED_OR_PERMISSION_DENIED");
        }

        // Re-fetch meta for versionId and formId
        Map<String, Object> meta = jdbc.queryForMap(
                "SELECT form_id, form_version_id FROM form_submission_meta WHERE id = ?",
                submissionId);

        UUID formId = (UUID) meta.get("form_id");
        UUID versionId = (UUID) meta.get("form_version_id");
        String tableName = getTableName(formId);

        // Requirement 3.1: Finalize blocked if version is inactive
        boolean isActive = versionRepo.findById(versionId)
                .map(com.formbuilder.entity.FormVersionEntity::isActive)
                .orElse(false);
        if (!isActive) {
            throw new com.formbuilder.exception.NoActiveVersionException("Cannot finalize submission for an inactive form version.");
        }

        // SRS Decision 4.3: Submission-time drift detection
        schemaManager.checkDrift(formId);

        // Update Dynamic Data - Mark as final (isFinal = true)
        updateDynamicRow(tableName, submissionId, versionId, data, true);
        jdbc.update(String.format("UPDATE \"%s\" SET is_draft = FALSE, updated_at = NOW() WHERE id = ?", tableName),
                submissionId);

        log.info("B3: Submission {} finalized under version {}.", submissionId, versionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // READ
    // ─────────────────────────────────────────────────────────────────────────

    public com.formbuilder.dto.DraftResult findDraft(UUID formId, String userId) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        dynamicTableService.addDraftColumnsIfMissing(tableName);

        // Resolve current active version for this form
        UUID currentVersionId = versionRepo.findByFormIdAndIsActiveTrue(formId)
                .map(com.formbuilder.entity.FormVersionEntity::getId)
                .orElse(null);

        // Fetch from meta-index first (Filter by is_soft_deleted = FALSE)
        List<Map<String, Object>> metaRows = jdbc.queryForList(
                "SELECT id, form_version_id FROM form_submission_meta WHERE form_id = ? AND submitted_by = ? AND status = 'DRAFT' AND is_soft_deleted = FALSE",
                formId, userId);

        if (metaRows.isEmpty()) {
            return com.formbuilder.dto.DraftResult.builder().status(com.formbuilder.dto.DraftResult.Status.NOT_FOUND).build();
        }

        UUID submissionId = (UUID) metaRows.get(0).get("id");
        UUID draftVersionId = (UUID) metaRows.get(0).get("form_version_id");

        if (currentVersionId != null && !draftVersionId.equals(currentVersionId)) {
            log.info("Draft version mismatch for form {}: DraftV={}, CurrentV={}. Discarding stale draft {}.", 
                formId, draftVersionId, currentVersionId, submissionId);
            // Cleanup stale draft in the correct order
            jdbc.update(String.format("DELETE FROM \"%s\" WHERE id = ?", tableName), submissionId);
            jdbc.update("DELETE FROM form_submission_meta WHERE id = ?", submissionId);
            
            return com.formbuilder.dto.DraftResult.builder()
                .status(com.formbuilder.dto.DraftResult.Status.DISCARDED)
                .message("Your previous draft was discarded because the form was updated.")
                .build();
        }

        List<Map<String, Object>> rows = jdbc.queryForList(
                String.format("SELECT * FROM \"%s\" WHERE id = ?", tableName), submissionId);

        if (rows.isEmpty()) {
             return com.formbuilder.dto.DraftResult.builder().status(com.formbuilder.dto.DraftResult.Status.NOT_FOUND).build();
        }

        Map<String, Object> draftData = new LinkedHashMap<>(rows.get(0));
        // Remove system columns from data map
        draftData.remove("id");
        draftData.remove("form_version_id");
        draftData.remove("created_at");
        draftData.remove("updated_at");
        draftData.remove("is_draft");
        draftData.remove("is_soft_deleted");
        draftData.remove("deleted_at");
        draftData.remove("user_id");

        return com.formbuilder.dto.DraftResult.builder()
            .status(com.formbuilder.dto.DraftResult.Status.FOUND)
            .submissionId(submissionId.toString())
            .formVersionId(draftVersionId.toString())
            .data(draftData)
            .build();
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
                    String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = FALSE AND is_draft = FALSE AND form_version_id = ? ORDER BY created_at DESC",
                            tableName), versionId);
        }

        if (activeOnly) {
            Optional<UUID> activeVersionId = versionRepo.findByFormIdAndIsActiveTrue(formId)
                    .map(com.formbuilder.entity.FormVersionEntity::getId);
            if (activeVersionId.isPresent()) {
                return jdbc.queryForList(
                        String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = FALSE AND is_draft = FALSE AND form_version_id = ? ORDER BY created_at DESC",
                                tableName), activeVersionId.get());
            }
            // If no active version, but activeOnly is true, return empty list (or all?)
            // Usually no active version means no results for this filter.
            return Collections.emptyList();
        }

        return jdbc.queryForList(
                String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = FALSE AND is_draft = FALSE ORDER BY created_at DESC",
                        tableName));
    }

    public Map<String, Object> getSubmissionSummaries(UUID formId, int page, int size, String sort, String filter) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 200);
        int offset = safePage * safeSize;

        String orderBy = "m.submitted_at DESC NULLS LAST, m.created_at DESC";
        if ("submittedAt,asc".equalsIgnoreCase(sort)) {
            orderBy = "m.submitted_at ASC NULLS LAST, m.created_at ASC";
        } else if ("submittedAt,desc".equalsIgnoreCase(sort)) {
            orderBy = "m.submitted_at DESC NULLS LAST, m.created_at DESC";
        }

        String where = " WHERE m.form_id = ? AND m.status = 'SUBMITTED' ";
        List<Object> params = new ArrayList<>();
        params.add(formId);

        if (filter != null && !filter.isBlank()) {
            where += " AND (COALESCE(m.submitted_by, '') ILIKE ?) ";
            String like = "%" + filter.trim() + "%";
            params.add(like);
        }

        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM form_submission_meta m" + where,
                Long.class,
                params.toArray());

        List<Object> itemsParams = new ArrayList<>(params);
        itemsParams.add(safeSize);
        itemsParams.add(offset);

        List<Map<String, Object>> raw = jdbc.queryForList(
                "SELECT m.id AS submission_id, m.status, m.submitted_by, m.submitted_at " +
                        "FROM form_submission_meta m" + where +
                        "ORDER BY " + orderBy + " LIMIT ? OFFSET ?",
                itemsParams.toArray());

        List<Map<String, Object>> items = raw.stream().map(r -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("submissionId", r.get("submission_id"));
            out.put("status", r.get("status"));
            out.put("submittedBy", r.get("submitted_by"));
            out.put("submittedAt", r.get("submitted_at"));
            return out;
        }).toList();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("total", total != null ? total : 0L);
        response.put("items", items);
        return response;
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

    /** Returns only soft-deleted submissions. */
    public List<Map<String, Object>> getDeletedSubmissions(UUID formId) {
        String tableName = getTableName(formId);
        dynamicTableService.ensureTableExists(tableName, formId);
        return jdbc.queryForList(
                String.format("SELECT * FROM \"%s\" WHERE is_soft_deleted = TRUE ORDER BY deleted_at DESC",
                        tableName));
    }

    /** Restores a soft-deleted submission. */
    public void restoreSubmission(UUID formId, UUID submissionId) {
        String tableName = getTableName(formId);
        int affected = jdbc.update(
                String.format("UPDATE \"%s\" SET is_soft_deleted = FALSE, deleted_at = NULL, updated_at = NOW() WHERE id = ? AND is_soft_deleted = TRUE",
                        tableName),
                submissionId);
        if (affected == 0)
            throw new NoSuchElementException("Deleted submission not found: " + submissionId);
        log.info("Submission {} restored in {}", submissionId, tableName);
    }

    /** Permanently deletes all soft-deleted submissions for a form. */
    public void purgeDeletedSubmissions(UUID formId) {
        String tableName = getTableName(formId);
        int affected = jdbc.update(String.format("DELETE FROM \"%s\" WHERE is_soft_deleted = TRUE", tableName));
        log.info("Purged {} soft-deleted submissions from {}", affected, tableName);
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
                "SELECT field_key, field_type, is_calculated, formula_expression, calc_precision " +
                        "FROM form_fields WHERE form_version_id = ? ORDER BY field_order ASC",
                versionId);

        // Run Calculation (Treat as final submission since it's an update check)
        Map<String, Object> workingValues = new LinkedHashMap<>(data != null ? data : Map.of());
        try {
            workingValues = calculationEngine.recalculate(fieldRows, workingValues);
        } catch (com.formbuilder.exception.ExpressionEvaluationException e) {
            throw e; // Fail-Fast
        }

        List<String> setClauses = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String fieldKey = (String) row.get("field_key");
            String fieldType = (String) row.get("field_type");
            if ("file".equals(fieldType) || "field_group".equals(fieldType))
                continue;
            
            // Update if calculated or provided
            if (Boolean.TRUE.equals(row.get("is_calculated")) || (data != null && data.containsKey(fieldKey))) {
                setClauses.add("\"" + fieldKey + "\" = ?");
                vals.add(convertValue(workingValues.get(fieldKey), fieldType));
            }
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
                "SELECT code FROM forms WHERE id = ?", formId);
        if (rows.isEmpty())
            throw new NoSuchElementException("Form not found: " + formId);

        String code = (String) rows.get(0).get("code");
        String tableName = dynamicTableService.generateTableName(code);

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
        f.setValidationMessage((String) row.get("validation_message"));
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

    private boolean isExpressionRule(String validationType) {
        if (validationType == null || validationType.isBlank()) {
            return true;
        }
        String type = validationType.trim().toUpperCase();
        return "CUSTOM".equals(type) || "CONDITIONAL".equals(type);
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
                    // Always use Double to match the NUMERIC column type — avoids integer overflow
                    try {
                        yield Double.parseDouble(s);
                    } catch (NumberFormatException e) {
                        yield null;
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
                case "time" -> java.sql.Time.valueOf(LocalTime.parse(s));
                case "date_time" -> java.sql.Timestamp.valueOf(LocalDateTime.parse(s.replace(" ", "T")));
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
