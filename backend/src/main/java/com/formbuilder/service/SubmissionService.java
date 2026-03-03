package com.formbuilder.service;

import com.formbuilder.entity.FormEntity;
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

    // ── Validate only (no INSERT) ─────────────────────────────────────────────

    /**
     * Validates all fields against their validation_json rules.
     * Throws ValidationException(Map<fieldKey, List<message>>) if any field fails.
     * Does NOT insert — call insert() separately after file handling.
     */
    public void validate(UUID formId, Map<String, Object> data, Map<String, MultipartFile> files) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));

        Map<String, List<String>> fieldErrors = new LinkedHashMap<>();
        for (FormFieldEntity field : form.getFields()) {
            Object value = (data != null) ? data.get(field.getFieldKey()) : null;
            List<String> errs = validationService.validateField(field, value, form.getTableName(), files);
            if (!errs.isEmpty()) {
                fieldErrors.put(field.getFieldKey(), errs);
            }
        }

        if (!fieldErrors.isEmpty()) {
            throw new ValidationException(fieldErrors);
        }
    }

    // ── Insert (validation already passed) ───────────────────────────────────

    /**
     * Inserts a validated submission into the form's dynamic table.
     * Call only after validate() succeeds and files have been saved.
     */
    public void insert(UUID formId, Map<String, Object> data) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));

        List<FormFieldEntity> fields = form.getFields();
        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();

        for (FormFieldEntity field : fields) {
            Object value = data != null ? data.get(field.getFieldKey()) : null;
            if (value == null && field.getDefaultValue() != null) {
                value = field.getDefaultValue();
            }
            cols.add('"' + field.getFieldKey() + '"');
            vals.add(convertValue(value, field.getFieldType()));
        }

        String table = '"' + form.getTableName() + '"';
        if (cols.isEmpty()) {
            jdbc.update("INSERT INTO " + table + " DEFAULT VALUES");
        } else {
            String colList  = String.join(", ", cols);
            String holders  = cols.stream().map(c -> "?").collect(Collectors.joining(", "));
            String sql      = "INSERT INTO " + table + " (" + colList + ") VALUES (" + holders + ")";
            log.debug("Submit INSERT: {}", sql);
            jdbc.update(sql, vals.toArray());
        }
    }

    // ── Combined (non-file submissions) ──────────────────────────────────────

    public void submit(UUID formId, Map<String, Object> data) {
        validate(formId, data, null);
        insert(formId, data);
    }

    public void submit(UUID formId, Map<String, Object> data, Map<String, MultipartFile> files) {
        validate(formId, data, files);
        insert(formId, data);
    }

    // ── Read Submissions ──────────────────────────────────────────────────────

    public List<Map<String, Object>> getSubmissions(UUID formId) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));
        String sql = "SELECT * FROM \"" + form.getTableName() + "\" ORDER BY created_at DESC";
        return jdbc.queryForList(sql);
    }

    // ── Type Conversion ───────────────────────────────────────────────────────

    private Object convertValue(Object value, String fieldType) {
        if (value == null) return null;
        String strValue = value.toString().trim();
        if (strValue.isEmpty()) return null;

        try {
            return switch (fieldType) {
                case "text"             -> strValue;
                case "number"           -> {
                    try { yield Integer.parseInt(strValue); }
                    catch (NumberFormatException e) { yield (int) Double.parseDouble(strValue); }
                }
                case "date"             -> java.sql.Date.valueOf(strValue);
                case "boolean"          -> switch (strValue.toLowerCase()) {
                    case "true",  "1", "yes", "on"  -> true;
                    case "false", "0", "no",  "off" -> false;
                    default -> Boolean.parseBoolean(strValue);
                };
                case "dropdown", "radio" -> strValue;
                case "file"              -> strValue;
                default                  -> strValue;
            };
        } catch (Exception e) {
            log.warn("Failed to convert value '{}' to type '{}': {}", value, fieldType, e.getMessage());
            return null;
        }
    }
}
