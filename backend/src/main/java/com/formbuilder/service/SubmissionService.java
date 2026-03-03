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
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final JdbcTemplate jdbc;
    private final FormJpaRepository formRepo;
    private final ValidationService validationService;

    // ── Submit ───────────────────────────────────────────────────────────────

    public void submit(UUID formId, Map<String, Object> data) {
        submit(formId, data, null);
    }

    public void submit(UUID formId, Map<String, Object> data, Map<String, MultipartFile> files) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));
        List<FormFieldEntity> fields = form.getFields();

        // 1. Advanced validation using ValidationService
        List<String> allErrors = new ArrayList<>();
        for (FormFieldEntity field : fields) {
            Object value = (data != null) ? data.get(field.getFieldKey()) : null;
            List<String> fieldErrors = validationService.validateField(field, value, form.getTableName(), files);
            allErrors.addAll(fieldErrors);
        }

        if (!allErrors.isEmpty()) {
            throw new ValidationException(allErrors);
        }

        // 2. Build parameterized INSERT
        // Base columns (id, created_at, updated_at) have DB defaults — omit from INSERT
        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();

        for (FormFieldEntity field : fields) {
            Object value = (data != null) ? data.get(field.getFieldKey()) : null;
            if (value == null && field.getDefaultValue() != null) {
                value = field.getDefaultValue();
            }

            // Convert value to proper type for PostgreSQL
            Object convertedValue = convertValue(value, field.getFieldType());

            cols.add('"' + field.getFieldKey() + '"');
            vals.add(convertedValue);
        }

        String table = '"' + form.getTableName() + '"';
        if (cols.isEmpty()) {
            jdbc.update("INSERT INTO " + table + " DEFAULT VALUES");
        } else {
            String colList = String.join(", ", cols);
            String placeholders = cols.stream().map(c -> "?").collect(Collectors.joining(", "));
            String sql = "INSERT INTO " + table + " (" + colList + ") VALUES (" + placeholders + ")";
            log.debug("Submit INSERT: {}", sql);
            jdbc.update(sql, vals.toArray());
        }
    }

    // ── Read Submissions (admin) ──────────────────────────────────────────────

    public List<Map<String, Object>> getSubmissions(UUID formId) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));
        String sql = "SELECT * FROM \"" + form.getTableName() + "\" ORDER BY created_at DESC";
        return jdbc.queryForList(sql);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    /**
     * Validates each field against its definition.
     *
     * Rules (identical to frontend FormRenderer.validate()):
     * 1. Required check — blank value on a required field → error
     * Boolean fields are exempt: false is a valid value.
     * 2. Regex check — uses Pattern.find() NOT String.matches() so the
     * pattern is NOT implicitly anchored (^…$).
     * This matches JavaScript's new RegExp(p).test(v) behaviour.
     *
     * @throws ValidationException (400) when any rule is violated.
     */
    private void validate(List<FormFieldEntity> fields, Map<String, Object> data) {
        List<String> errors = new ArrayList<>();

        for (FormFieldEntity field : fields) {
            Object value = (data != null) ? data.get(field.getFieldKey()) : null;
            String strValue = (value != null) ? value.toString().trim() : "";
            boolean isBlank = strValue.isEmpty();

            // ── 1. Required check ──────────────────────────────────────────
            // Boolean fields are never "blank" — the presence of false is valid.
            if (field.isRequired() && isBlank && !"boolean".equals(field.getFieldType())) {
                errors.add(field.getLabel() + " is required");
                continue; // no point checking regex on an empty value
            }

            // ── 2. Regex check ─────────────────────────────────────────────
            // Applied only when a non-empty value is present.
            // Pattern.find() — searches anywhere in the string, consistent with JS .test().
            if (field.getValidationRegex() != null
                    && !field.getValidationRegex().isBlank()
                    && !isBlank) {
                try {
                    boolean matches = Pattern
                            .compile(field.getValidationRegex())
                            .matcher(strValue)
                            .find();
                    if (!matches) {
                        errors.add(field.getLabel() + " format is invalid");
                    }
                } catch (Exception ex) {
                    // Malformed regex in DB — log and skip rather than crash
                    log.warn("Skipping invalid regex '{}' for field '{}': {}",
                            field.getValidationRegex(), field.getFieldKey(), ex.getMessage());
                }
            }

            // ── 3. Selection validation (dropdown/radio) ───────────────────
            // Ensure submitted value exists in optionsJson array
            if (("dropdown".equals(field.getFieldType()) || "radio".equals(field.getFieldType()))
                    && !isBlank
                    && field.getOptionsJson() != null) {
                try {
                    // Parse options JSON array
                    String optionsStr = field.getOptionsJson().trim();
                    if (optionsStr.startsWith("[") && optionsStr.endsWith("]")) {
                        // Simple JSON array parsing (e.g., ["Option1","Option2"])
                        String[] options = optionsStr
                                .substring(1, optionsStr.length() - 1)
                                .split(",");
                        boolean found = false;
                        for (String opt : options) {
                            String cleanOpt = opt.trim().replaceAll("^\"|\"$", ""); // Remove quotes
                            if (cleanOpt.equals(strValue)) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            errors.add(field.getLabel() + " has an invalid selection");
                        }
                    }
                } catch (Exception ex) {
                    log.warn("Failed to parse optionsJson for field '{}': {}",
                            field.getFieldKey(), ex.getMessage());
                }
            }
        }

        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
    }

    // ── Type Conversion ──────────────────────────────────────────────────────

    /**
     * Converts form submission values to proper Java types for PostgreSQL.
     * Frontend sends everything as strings, we need to convert based on field type.
     *
     * @param value The raw value from the form submission
     * @param fieldType The field type (text, number, date, boolean)
     * @return Converted value suitable for JDBC insertion
     */
    private Object convertValue(Object value, String fieldType) {
        if (value == null) {
            return null;
        }

        String strValue = value.toString().trim();
        if (strValue.isEmpty()) {
            return null;
        }

        try {
            return switch (fieldType) {
                case "text" -> strValue;
                case "number" -> {
                    // PostgreSQL INTEGER type
                    try {
                        yield Integer.parseInt(strValue);
                    } catch (NumberFormatException e) {
                        // Try parsing as double then convert to int
                        double d = Double.parseDouble(strValue);
                        yield (int) d;
                    }
                }
                case "date" -> {
                    // PostgreSQL DATE type expects java.sql.Date
                    // Frontend sends ISO date string: "2024-01-15"
                    yield java.sql.Date.valueOf(strValue);
                }
                case "boolean" -> {
                    // PostgreSQL BOOLEAN type
                    // Accept: true/false, 1/0, yes/no, on/off
                    yield switch (strValue.toLowerCase()) {
                        case "true", "1", "yes", "on" -> true;
                        case "false", "0", "no", "off" -> false;
                        default -> Boolean.parseBoolean(strValue);
                    };
                }
                case "dropdown", "radio" -> strValue; // Store as VARCHAR
                case "file" -> strValue; // Store file path as TEXT
                default -> strValue; // Fallback to string
            };
        } catch (Exception e) {
            log.warn("Failed to convert value '{}' to type '{}': {}", value, fieldType, e.getMessage());
            return null; // Return null for invalid conversions
        }
    }
}
