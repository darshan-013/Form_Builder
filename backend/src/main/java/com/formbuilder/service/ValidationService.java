package com.formbuilder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formbuilder.entity.FormFieldEntity;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class ValidationService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Validates a single field against its validation rules.
     *
     * @param field     Field metadata
     * @param value     Submitted value
     * @param tableName Form's submission table name (for uniqueness checks)
     * @param files     Optional file map for file field validation
     * @return List of error messages (empty if valid)
     */
    public List<String> validateField(FormFieldEntity field, Object value, String tableName,
            Map<String, List<MultipartFile>> files) {
        List<String> errors = new ArrayList<>();
        if ("field_group".equals(field.getFieldType())) {
            return errors;
        }

        // Parse validation rules
        JsonNode rules = parseValidationJson(field.getValidationJson());

        log.debug("Validating field '{}' (type={}, required={}, validationJson={})",
                field.getFieldKey(), field.getFieldType(), field.isRequired(), field.getValidationJson());

        if (rules == null) {
            rules = objectMapper.createObjectNode();
        }

        // If value is a List (e.g., multi-select dropdown from JSON array), serialize
        // it
        // back to a proper JSON string so downstream validators can parse it correctly.
        // value.toString() on a List produces [Item1, Item2] (no quotes) which is not
        // valid JSON.
        String rawValue;
        if (value instanceof List) {
            try {
                rawValue = objectMapper.writeValueAsString(value);
            } catch (JsonProcessingException e) {
                rawValue = value.toString();
            }
        } else {
            rawValue = (value != null) ? value.toString() : "";
        }

        String strValue = rawValue.trim();
        boolean isEmpty = strValue.isEmpty();

        // Required check (universal — except boolean, multiple_choice_grid,
        // checkbox_grid which have their own logic)
        if (field.isRequired() && isEmpty
                && !"boolean".equals(field.getFieldType())
                && !"multiple_choice_grid".equals(field.getFieldType())
                && !"checkbox_grid".equals(field.getFieldType())) {
            errors.add(field.getLabel() + " is required");
            return errors;
        }

        // Skip further validation on empty optional fields (not grids — they handle
        // empty internally)
        if (isEmpty && !field.isRequired()
                && !"multiple_choice_grid".equals(field.getFieldType())
                && !"checkbox_grid".equals(field.getFieldType())) {
            return errors;
        }

        // Type-specific validation
        switch (field.getFieldType().toLowerCase()) {
            case "text" -> validateTextField(field, strValue, rawValue, rules, errors, tableName);
            case "number" -> validateNumberField(field, strValue, rules, errors, tableName);
            case "date" -> validateDateField(field, strValue, rules, errors);
            case "time" -> validateTimeField(field, strValue, rules, errors);
            case "date_time" -> validateDateTimeField(field, strValue, rules, errors);
            case "boolean" -> validateBooleanField(field, value, rules, errors);
            case "dropdown" -> validateDropdownField(field, strValue, rules, errors);
            case "radio" -> validateRadioField(field, strValue, rules, errors);
            case "multiple_choice" -> validateMultipleChoiceField(field, strValue, rules, errors);
            case "linear_scale" -> validateLinearScaleField(field, strValue, rules, errors);
            case "multiple_choice_grid" -> validateMultipleChoiceGridField(field, strValue, rules, errors);
            case "star_rating" -> validateStarRatingField(field, strValue, rules, errors);
            case "checkbox_grid" -> validateCheckboxGridField(field, strValue, rules, errors);
            case "file" -> validateFileField(field, files, rules, errors, tableName);
        }

        if (!errors.isEmpty()) {
            log.debug("Field '{}' failed validation: {}", field.getFieldKey(), errors);
            // Policy 9.1: If a custom validation message is defined, use it instead of technical errors
            if (field.getValidationMessage() != null && !field.getValidationMessage().isBlank()) {
                return List.of(field.getValidationMessage());
            }
        }

        return errors;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXT FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateTextField(FormFieldEntity field, String value, String rawValue, JsonNode rules, List<String> errors,
            String tableName) {
        String label = field.getLabel();

        // trimWhitespace: backend always trims before validating — honoured by design

        if (rules.hasNonNull("minLength")) {
            int min = rules.get("minLength").asInt();
            if (value.length() < min)
                errors.add(label + " must be at least " + min + " characters");
        }
        if (rules.hasNonNull("maxLength")) {
            int max = rules.get("maxLength").asInt();
            if (value.length() > max)
                errors.add(label + " must not exceed " + max + " characters");
        }
        if (rules.hasNonNull("exactLength")) {
            int exact = rules.get("exactLength").asInt();
            if (value.length() != exact)
                errors.add(label + " must be exactly " + exact + " characters");
        }
        if (rules.hasNonNull("noLeadingTrailingSpaces") && rules.get("noLeadingTrailingSpaces").asBoolean()) {
            if (!rawValue.equals(rawValue.trim()))
                errors.add(label + " must not have leading or trailing spaces");
        }
        if (rules.hasNonNull("noConsecutiveSpaces") && rules.get("noConsecutiveSpaces").asBoolean()) {
            if (rawValue.contains("  "))
                errors.add(label + " must not contain consecutive spaces");
        }
        if (rules.hasNonNull("alphabetOnly") && rules.get("alphabetOnly").asBoolean()) {
            if (!value.matches("^[A-Za-z\\s]+$"))
                errors.add(label + " must contain only alphabetic characters");
        }
        if (rules.hasNonNull("alphanumericOnly") && rules.get("alphanumericOnly").asBoolean()) {
            if (!value.matches("^[A-Za-z0-9\\s]+$"))
                errors.add(label + " must contain only letters and numbers");
        }
        if (rules.hasNonNull("noSpecialCharacters") && rules.get("noSpecialCharacters").asBoolean()) {
            if (!value.matches("^[A-Za-z0-9\\s]+$"))
                errors.add(label + " must not contain special characters");
        }
        if (rules.hasNonNull("allowSpecificSpecialCharacters") && !rules.get("allowSpecificSpecialCharacters").asText().isEmpty()) {
            String allowed = rules.get("allowSpecificSpecialCharacters").asText();
            String escapedAllowed = allowed.replaceAll("([\\[\\-\\\\])", "\\\\$1");
            String pattern = "^[A-Za-z0-9\\s" + escapedAllowed + "]+$";
            try {
                if (!value.matches(pattern))
                    errors.add(label + " contains invalid characters. Allowed special chars: " + allowed);
            } catch (Exception e) {
                log.warn("Invalid allowSpecificSpecialCharacters pattern for field {}: {}", field.getFieldKey(),
                        pattern);
            }
        }
        if (rules.hasNonNull("restrictSpecificSpecialCharacters") && !rules.get("restrictSpecificSpecialCharacters").asText().isEmpty()) {
            String restricted = rules.get("restrictSpecificSpecialCharacters").asText();
            for (char c : restricted.toCharArray()) {
                if (rawValue.indexOf(c) >= 0) {
                    errors.add(label + " contains restricted character: " + c);
                    break;
                }
            }
        }
        if (rules.hasNonNull("emailFormat") && rules.get("emailFormat").asBoolean()) {
            if (!isValidEmail(value))
                errors.add(label + " must be a valid email address");
        }
        if (rules.hasNonNull("urlFormat") && rules.get("urlFormat").asBoolean()) {
            if (!isValidUrl(value))
                errors.add(label + " must be a valid URL");
        }
        if (rules.hasNonNull("passwordStrength") && rules.get("passwordStrength").asBoolean()) {
            if (!validatePasswordStrength(value).isEmpty())
                errors.add(label + " must contain uppercase, lowercase, digit, and special character");
        }
        if (rules.hasNonNull("customRegex")) {
            String regex = rules.get("customRegex").asText();
            String customMessage = rules.hasNonNull("message") ? rules.get("message").asText() : (label + " format is invalid");
            try {
                if (!Pattern.compile(regex).matcher(value).find())
                    errors.add(customMessage);
            } catch (Exception e) {
                log.warn("Invalid regex pattern: {}", regex, e);
            }
        }
        if (!rules.hasNonNull("customRegex") && field.getValidationRegex() != null && !field.getValidationRegex().isBlank()) {
            String customMessage = rules.hasNonNull("message") ? rules.get("message").asText() : (label + " format is invalid");
            try {
                if (!Pattern.compile(field.getValidationRegex()).matcher(value).find())
                    errors.add(customMessage);
            } catch (Exception e) {
                log.warn("Invalid validationRegex for field {}: {}", field.getFieldKey(), field.getValidationRegex());
            }
        }
        if (rules.hasNonNull("unique") && rules.get("unique").asBoolean()) {
            if (isDuplicate(tableName, field.getFieldKey(), value))
                errors.add(label + " must be unique. This value already exists");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NUMBER FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateNumberField(FormFieldEntity field, String value, JsonNode rules, List<String> errors,
            String tableName) {
        String label = field.getLabel();
        double numValue;
        try {
            numValue = Double.parseDouble(value);
        } catch (NumberFormatException e) {
            errors.add(label + " must be a valid number");
            return;
        }

        if (rules.hasNonNull("integerOnly") && rules.get("integerOnly").asBoolean()) {
            if (numValue != Math.floor(numValue))
                errors.add(label + " must be an integer");
        }
        if (rules.hasNonNull("decimalAllowed") && !rules.get("decimalAllowed").asBoolean()) {
            if (numValue != Math.floor(numValue))
                errors.add(label + " must not contain decimal places");
        }
        if (rules.hasNonNull("positiveOnly") && rules.get("positiveOnly").asBoolean()) {
            if (numValue <= 0)
                errors.add(label + " must be positive");
        }
        if (rules.hasNonNull("negativeAllowed") && !rules.get("negativeAllowed").asBoolean()) {
            if (numValue < 0)
                errors.add(label + " must not be negative");
        }
        if (rules.hasNonNull("zeroAllowed") && !rules.get("zeroAllowed").asBoolean()) {
            if (numValue == 0)
                errors.add(label + " cannot be zero");
        }

        // Range — support both "minValue"/"maxValue" (frontend) and "min"/"max"
        // (Postman/API)
        double min = Double.NaN;
        if (rules.hasNonNull("minValue"))
            min = rules.get("minValue").asDouble();
        else if (rules.hasNonNull("min"))
            min = rules.get("min").asDouble();
        if (!Double.isNaN(min) && numValue < min)
            errors.add(label + " must be at least " + formatNumber(min));

        double max = Double.NaN;
        if (rules.hasNonNull("maxValue"))
            max = rules.get("maxValue").asDouble();
        else if (rules.hasNonNull("max"))
            max = rules.get("max").asDouble();
        if (!Double.isNaN(max) && numValue > max)
            errors.add(label + " must not exceed " + formatNumber(max));

        if (rules.hasNonNull("maxDigits")) {
            int maxDigits = rules.get("maxDigits").asInt();
            String intPart = value.split("\\.")[0].replaceAll("-", "");
            if (intPart.length() > maxDigits)
                errors.add(label + " must not have more than " + maxDigits + " digits");
        }
        if (rules.hasNonNull("maxDecimalPlaces")) {
            int maxDecimals = rules.get("maxDecimalPlaces").asInt();
            if (value.contains(".") && value.split("\\.")[1].length() > maxDecimals)
                errors.add(label + " must not have more than " + maxDecimals + " decimal places");
        }
        if (rules.hasNonNull("noLeadingZero") && rules.get("noLeadingZero").asBoolean()) {
            if (value.matches("^0[0-9]+.*"))
                errors.add(label + " must not have leading zeros");
        }
        if (rules.hasNonNull("phoneNumberFormat") && rules.get("phoneNumberFormat").asBoolean()) {
            if (!value.matches("^[0-9]{10}$"))
                errors.add(label + " must be a valid 10-digit phone number");
        }
        if (rules.hasNonNull("otpFormat")) {
            int length = rules.get("otpFormat").asInt();
            if (!value.matches("^[0-9]{" + length + "}$"))
                errors.add(label + " must be a " + length + "-digit OTP");
        }
        if (rules.hasNonNull("ageValidation") && rules.get("ageValidation").asBoolean()) {
            if (numValue < 18)
                errors.add(label + " must be at least 18");
        }
        if (rules.hasNonNull("percentageRange") && rules.get("percentageRange").asBoolean()) {
            if (numValue < 0 || numValue > 100)
                errors.add(label + " must be between 0 and 100");
        }
        if (rules.hasNonNull("currencyFormat") && rules.get("currencyFormat").asBoolean()) {
            if (numValue < 0)
                errors.add(label + " must be a non-negative currency value");
            if (value.contains(".") && value.split("\\.")[1].length() > 2)
                errors.add(label + " must have at most 2 decimal places for currency");
        }
        if (rules.hasNonNull("uniqueNumber") && rules.get("uniqueNumber").asBoolean()) {
            if (isDuplicate(tableName, field.getFieldKey(), value))
                errors.add(label + " must be unique. This value already exists");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATE FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateDateField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();
        String customFormat = rules.hasNonNull("customFormat") ? rules.get("customFormat").asText("YYYY-MM-DD") : "YYYY-MM-DD";

        LocalDate date = null;
        if (value.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            try {
                date = LocalDate.parse(value);
            } catch (DateTimeParseException e) {
                errors.add(label + " must be a valid date");
                return;
            }
        } else if ("DD/MM/YYYY".equals(customFormat) && value.matches("^\\d{2}/\\d{2}/\\d{4}$")) {
            try {
                String[] p = value.split("/");
                date = LocalDate.of(Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]));
            } catch (Exception e) {
                errors.add(label + " must be a valid date in DD/MM/YYYY format");
                return;
            }
        } else if ("MM/DD/YYYY".equals(customFormat) && value.matches("^\\d{2}/\\d{2}/\\d{4}$")) {
            try {
                String[] p = value.split("/");
                date = LocalDate.of(Integer.parseInt(p[2]), Integer.parseInt(p[0]), Integer.parseInt(p[1]));
            } catch (Exception e) {
                errors.add(label + " must be a valid date in MM/DD/YYYY format");
                return;
            }
        } else {
            errors.add(label + " must be a valid date");
            return;
        }

        LocalDate today = LocalDate.now();

        if (rules.hasNonNull("minDate") && !rules.get("minDate").asText("").isEmpty()) {
            try {
                LocalDate minD = LocalDate.parse(rules.get("minDate").asText());
                if (date.isBefore(minD))
                    errors.add(label + " must be on or after " + formatDate(minD, customFormat));
            } catch (DateTimeParseException ignored) {
            }
        }
        if (rules.hasNonNull("maxDate") && !rules.get("maxDate").asText("").isEmpty()) {
            try {
                LocalDate maxD = LocalDate.parse(rules.get("maxDate").asText());
                if (date.isAfter(maxD))
                    errors.add(label + " must be on or before " + formatDate(maxD, customFormat));
            } catch (DateTimeParseException ignored) {
            }
        }
        if (rules.hasNonNull("pastOnly") && rules.get("pastOnly").asBoolean()) {
            if (!date.isBefore(today))
                errors.add(label + " must be a past date");
        }
        if (rules.hasNonNull("futureOnly") && rules.get("futureOnly").asBoolean()) {
            if (!date.isAfter(today))
                errors.add(label + " must be a future date");
        }
        if (rules.hasNonNull("noWeekend") && rules.get("noWeekend").asBoolean()) {
            if (date.getDayOfWeek().getValue() >= 6)
                errors.add(label + " cannot be a Saturday or Sunday");
        }
        if (rules.hasNonNull("age18Plus") && !rules.get("age18Plus").asText("").isEmpty()) {
            int minAge = rules.get("age18Plus").asInt();
            int age = Period.between(date, today).getYears();
            if (age < minAge)
                errors.add(label + " indicates age must be at least " + minAge + " years old");
        }
        if (rules.hasNonNull("notOlderThanXYears") && !rules.get("notOlderThanXYears").asText("").isEmpty()) {
            int maxYears = rules.get("notOlderThanXYears").asInt();
            int age = Period.between(date, today).getYears();
            if (age > maxYears)
                errors.add(label + " must not be older than " + maxYears + " years");
        }
    }

    private String formatDate(LocalDate date, String format) {
        if ("DD/MM/YYYY".equals(format))
            return String.format("%02d/%02d/%04d", date.getDayOfMonth(), date.getMonthValue(), date.getYear());
        if ("MM/DD/YYYY".equals(format))
            return String.format("%02d/%02d/%04d", date.getMonthValue(), date.getDayOfMonth(), date.getYear());
        return date.toString();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TIME FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateTimeField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        LocalTime time;
        try {
            time = LocalTime.parse(value);
        } catch (DateTimeParseException e) {
            errors.add(label + " must be a valid time (HH:mm or HH:mm:ss)");
            return;
        }

        if (rules.hasNonNull("minTime") && !rules.get("minTime").asText("").isBlank()) {
            try {
                LocalTime min = LocalTime.parse(rules.get("minTime").asText());
                if (time.isBefore(min)) {
                    errors.add(label + " must be at or after " + min.toString());
                }
            } catch (DateTimeParseException ignored) {
            }
        }

        if (rules.hasNonNull("maxTime") && !rules.get("maxTime").asText("").isBlank()) {
            try {
                LocalTime max = LocalTime.parse(rules.get("maxTime").asText());
                if (time.isAfter(max)) {
                    errors.add(label + " must be at or before " + max.toString());
                }
            } catch (DateTimeParseException ignored) {
            }
        }

        LocalTime now = LocalTime.now();
        if (rules.hasNonNull("pastOnly") && rules.get("pastOnly").asBoolean() && !time.isBefore(now)) {
            errors.add(label + " must be a past time");
        }
        if (rules.hasNonNull("futureOnly") && rules.get("futureOnly").asBoolean() && !time.isAfter(now)) {
            errors.add(label + " must be a future time");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATETIME FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateDateTimeField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        LocalDateTime dateTime;
        try {
            dateTime = LocalDateTime.parse(value.replace(" ", "T"));
        } catch (DateTimeParseException e) {
            errors.add(label + " must be a valid date-time");
            return;
        }

        if (rules.hasNonNull("minDateTime") && !rules.get("minDateTime").asText("").isBlank()) {
            try {
                LocalDateTime min = LocalDateTime.parse(rules.get("minDateTime").asText().replace(" ", "T"));
                if (dateTime.isBefore(min)) {
                    errors.add(label + " must be on or after " + min);
                }
            } catch (DateTimeParseException ignored) {
            }
        }

        if (rules.hasNonNull("maxDateTime") && !rules.get("maxDateTime").asText("").isBlank()) {
            try {
                LocalDateTime max = LocalDateTime.parse(rules.get("maxDateTime").asText().replace(" ", "T"));
                if (dateTime.isAfter(max)) {
                    errors.add(label + " must be on or before " + max);
                }
            } catch (DateTimeParseException ignored) {
            }
        }

        LocalDateTime now = LocalDateTime.now();
        if (rules.hasNonNull("pastOnly") && rules.get("pastOnly").asBoolean() && !dateTime.isBefore(now)) {
            errors.add(label + " must be a past date-time");
        }
        if (rules.hasNonNull("futureOnly") && rules.get("futureOnly").asBoolean() && !dateTime.isAfter(now)) {
            errors.add(label + " must be a future date-time");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BOOLEAN FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateBooleanField(FormFieldEntity field, Object value, JsonNode rules, List<String> errors) {
        boolean boolValue = value != null && Boolean.parseBoolean(value.toString());
        if (field.isRequired() && !boolValue) {
            errors.add(field.getLabel() + " must be accepted");
            return;
        }
        if (rules.hasNonNull("mustBeTrue") && rules.get("mustBeTrue").asBoolean() && !boolValue)
            errors.add(field.getLabel() + " must be accepted");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DROPDOWN FIELD VALIDATION
    // Rules (stored in validation_json):
    // optionExists boolean — default TRUE — reject values not in options list
    // defaultNotAllowed string — placeholder text to reject (e.g. "-- Select --")
    // Options resolved from shared_options via JDBC JOIN (field.getOptionsJson()).
    // ═══════════════════════════════════════════════════════════════════════

    private void validateDropdownField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();
        String optionsJson = field.getOptionsJson(); // resolved via JDBC JOIN

        log.debug("validateDropdown '{}' value='{}' hasOptions={}", field.getFieldKey(), value, optionsJson != null);

        // Parse selected values — support both JSON array and single string
        List<String> selected = new ArrayList<>();
        if (value != null && !value.isBlank()) {
            String trimmed = value.trim();
            if (trimmed.startsWith("[")) {
                // JSON array format: ["Option 1","Option 2"]
                try {
                    JsonNode arr = objectMapper.readTree(trimmed);
                    if (arr.isArray()) {
                        for (JsonNode n : arr) {
                            if (n.isTextual() && !n.asText().isBlank()) {
                                selected.add(n.asText().trim());
                            }
                        }
                    }
                } catch (JsonProcessingException e) {
                    log.warn("Failed to parse dropdown JSON value: {}", value);
                }
            } else {
                // Fallback: single string (legacy or single-select)
                // Remove quotes if it's stored as a JSON string "\"Option\""
                if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
                    try {
                        selected.add(objectMapper.readTree(trimmed).asText().trim());
                    } catch (Exception e) {
                        selected.add(trimmed);
                    }
                } else {
                    selected.add(trimmed);
                }
            }
        }

        // 1. Reject placeholder / default text FIRST (before option validation)
        if (rules.hasNonNull("defaultNotAllowed") && !rules.get("defaultNotAllowed").asText("").isBlank()) {
            String placeholder = rules.get("defaultNotAllowed").asText().trim();
            for (String sel : selected) {
                if (sel.equals(placeholder)) {
                    errors.add(label + " — please select a valid option");
                    return;
                }
            }
        }

        // 2. optionExists — default TRUE (validates value exists in options list)
        // Only skip validation when admin explicitly sets optionExists = false
        boolean optionExistsEnabled = !rules.hasNonNull("optionExists") || rules.get("optionExists").asBoolean();
        if (optionExistsEnabled && optionsJson != null && !optionsJson.isBlank()) {
            for (String sel : selected) {
                if (!isValidOption(optionsJson, sel)) {
                    errors.add(label + " has an invalid selection");
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RADIO FIELD VALIDATION
    // Rules (stored in validation_json):
    // validateSelectedOption boolean — default TRUE — reject values not in options
    // requireSelection boolean — enforce that a non-empty choice is made
    // Options resolved from shared_options via JDBC JOIN (field.getOptionsJson()).
    // ═══════════════════════════════════════════════════════════════════════

    private void validateRadioField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();
        String optionsJson = field.getOptionsJson(); // resolved via JDBC JOIN

        log.debug("validateRadio '{}' value='{}' hasOptions={}", field.getFieldKey(), value, optionsJson != null);

        // 1. requireSelection — must pick at least one option
        if (rules.hasNonNull("requireSelection") && rules.get("requireSelection").asBoolean()) {
            if (value == null || value.isBlank()) {
                errors.add(label + " — please select an option");
                return;
            }
        }

        // 2. validateSelectedOption — default TRUE — ensure value exists in options
        // list
        boolean validateEnabled = !rules.hasNonNull("validateSelectedOption")
                || rules.get("validateSelectedOption").asBoolean();
        if (validateEnabled && optionsJson != null && !optionsJson.isBlank()) {
            if (!isValidOption(optionsJson, value)) {
                errors.add(label + " has an invalid selection");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MULTIPLE CHOICE FIELD VALIDATION
    // Single-select like radio, but displayed as selectable list options (Google
    // Forms style).
    // Options resolved from shared_options via JDBC JOIN (field.getOptionsJson()).
    // Rules: requireSelection, validateSelectedOption (default true)
    // ═══════════════════════════════════════════════════════════════════════

    private void validateMultipleChoiceField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();
        String optionsJson = field.getOptionsJson();

        log.debug("validateMultipleChoice '{}' value='{}' hasOptions={}", field.getFieldKey(), value,
                optionsJson != null);

        // Parse selected values — support both JSON array and comma-separated string
        List<String> selected = new ArrayList<>();
        if (value != null && !value.isBlank()) {
            String trimmed = value.trim();
            if (trimmed.startsWith("[")) {
                // JSON array format: ["Option 1","Option 2"]
                try {
                    JsonNode arr = objectMapper.readTree(trimmed);
                    if (arr.isArray()) {
                        for (JsonNode n : arr) {
                            if (n.isTextual() && !n.asText().isBlank()) {
                                selected.add(n.asText().trim());
                            }
                        }
                    }
                } catch (JsonProcessingException e) {
                    log.warn("Failed to parse multiple_choice JSON value: {}", value);
                }
            } else {
                // Fallback: comma-separated string
                for (String s : trimmed.split(",")) {
                    if (!s.trim().isBlank())
                        selected.add(s.trim());
                }
            }
        }

        // 1. Required / requireSelection check
        boolean isRequired = field.isRequired()
                || (rules.hasNonNull("requireSelection") && rules.get("requireSelection").asBoolean());
        if (selected.isEmpty()) {
            if (isRequired)
                errors.add(label + " — please select at least one option");
            return;
        }

        // 2. validateSelectedOption — default TRUE — each selected value must exist in
        // options
        boolean validateEnabled = !rules.hasNonNull("validateSelectedOption")
                || rules.get("validateSelectedOption").asBoolean();
        if (validateEnabled && optionsJson != null && !optionsJson.isBlank()) {
            for (String sel : selected) {
                if (!isValidOption(optionsJson, sel)) {
                    errors.add(label + " has an invalid selection: \"" + sel + "\"");
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LINEAR SCALE FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateLinearScaleField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        log.debug("validateLinearScale '{}' value='{}'", field.getFieldKey(), value);

        // Parse value as integer
        int intValue;
        try {
            intValue = Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            errors.add(label + " must be a valid scale number");
            return;
        }

        // Read minScale / maxScale from validation_json rules
        // Also fall back to ui_config_json for min/max if not in validation_json
        int minScale = 1;
        int maxScale = 5;

        if (rules.hasNonNull("minScale")) {
            minScale = rules.get("minScale").asInt(1);
        } else if (field.getUiConfigJson() != null) {
            try {
                JsonNode uiConfig = objectMapper.readTree(field.getUiConfigJson());
                if (uiConfig.hasNonNull("scaleMin"))
                    minScale = uiConfig.get("scaleMin").asInt(1);
            } catch (JsonProcessingException ignored) {
            }
        }

        if (rules.hasNonNull("maxScale")) {
            maxScale = rules.get("maxScale").asInt(5);
        } else if (field.getUiConfigJson() != null) {
            try {
                JsonNode uiConfig = objectMapper.readTree(field.getUiConfigJson());
                if (uiConfig.hasNonNull("scaleMax"))
                    maxScale = uiConfig.get("scaleMax").asInt(5);
            } catch (JsonProcessingException ignored) {
            }
        }

        if (intValue < minScale) {
            errors.add(label + " must be at least " + minScale);
        }
        if (intValue > maxScale) {
            errors.add(label + " must be at most " + maxScale);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILE FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateFileField(FormFieldEntity field, Map<String, List<MultipartFile>> files, JsonNode rules,
            List<String> errors, String tableName) {
        String label = field.getLabel();
        List<MultipartFile> fileList = files != null ? files.get(field.getFieldKey()) : null;

        if (fileList == null || fileList.isEmpty() || fileList.stream().allMatch(MultipartFile::isEmpty)) {
            if (field.isRequired())
                errors.add(label + " is required");
            return;
        }

        // Check if multiple files are allowed
        boolean singleOnly = rules.hasNonNull("singleOrMultiple") && "single".equals(rules.get("singleOrMultiple").asText());
        if (singleOnly && fileList.size() > 1) {
            errors.add(label + " only allows a single file upload");
        }

        long totalSize = 0;

        for (MultipartFile file : fileList) {
            if (file.isEmpty()) continue;

            String filename = file.getOriginalFilename();
            long fileSize = file.getSize();
            String contentType = file.getContentType();
            
            totalSize += fileSize;

            if (rules.hasNonNull("allowedExtensions")) {
                String allowedText = rules.get("allowedExtensions").asText();
                if (!allowedText.isBlank()) {
                    String[] allowed = allowedText.split(",");
                    boolean validExt = Arrays.stream(allowed)
                            .anyMatch(ext -> filename != null && filename.toLowerCase().endsWith(ext.trim().toLowerCase()));
                    if (!validExt)
                        errors.add(label + ": '" + filename + "' must be one of: " + allowedText);
                }
            }
            if (rules.hasNonNull("mimeTypeValidation")) {
                String mimeText = rules.get("mimeTypeValidation").asText();
                if (!mimeText.isBlank()) {
                    String[] allowedMimes = mimeText.split(",");
                    boolean validMime = Arrays.stream(allowedMimes)
                            .anyMatch(mime -> contentType != null && contentType.equalsIgnoreCase(mime.trim()));
                    if (!validMime)
                        errors.add(label + ": '" + filename + "' has an invalid MIME type");
                }
            }
            if (rules.hasNonNull("maxFileSize")) {
                long maxSize = rules.get("maxFileSize").asLong() * 1024 * 1024;
                if (fileSize > maxSize)
                    errors.add(label + ": '" + filename + "' exceeds maximum size of " + rules.get("maxFileSize").asLong() + " MB");
            }
            if (rules.hasNonNull("minFileSize")) {
                long minSize = rules.get("minFileSize").asLong() * 1024;
                if (fileSize < minSize)
                    errors.add(label + ": '" + filename + "' is smaller than minimum size of " + rules.get("minFileSize").asLong() + " KB");
            }
            if (rules.hasNonNull("imageDimensionCheck")) {
                try {
                    BufferedImage image = ImageIO.read(file.getInputStream());
                    if (image != null) {
                        JsonNode dim = rules.get("imageDimensionCheck");
                        if (dim.hasNonNull("minWidth") && dim.get("minWidth").asInt() > 0 && image.getWidth() < dim.get("minWidth").asInt())
                            errors.add(label + ": '" + filename + "' width must be at least " + dim.get("minWidth").asInt() + " pixels");
                        if (dim.hasNonNull("maxWidth") && dim.get("maxWidth").asInt() > 0 && image.getWidth() > dim.get("maxWidth").asInt())
                            errors.add(label + ": '" + filename + "' width must not exceed " + dim.get("maxWidth").asInt() + " pixels");
                        if (dim.hasNonNull("minHeight") && dim.get("minHeight").asInt() > 0 && image.getHeight() < dim.get("minHeight").asInt())
                            errors.add(label + ": '" + filename + "' height must be at least " + dim.get("minHeight").asInt() + " pixels");
                        if (dim.hasNonNull("maxHeight") && dim.get("maxHeight").asInt() > 0 && image.getHeight() > dim.get("maxHeight").asInt())
                            errors.add(label + ": '" + filename + "' height must not exceed " + dim.get("maxHeight").asInt() + " pixels");
                    }
                } catch (IOException e) {
                    log.warn("Failed to read image dimensions for field {}", field.getFieldKey(), e);
                }
            }
            if (rules.hasNonNull("fileNameValidation") && rules.get("fileNameValidation").asBoolean()) {
                if (filename != null && !filename.matches("^[A-Za-z0-9._-]+$"))
                    errors.add(label + ": '" + filename + "' contains invalid characters");
            }
            if (rules.hasNonNull("duplicateFilePrevention") && rules.get("duplicateFilePrevention").asBoolean()) {
                if (filename != null && isDuplicate(tableName, field.getFieldKey(), filename))
                    errors.add(label + ": a file named '" + filename + "' already exists");
            }
        }

        // Aggregate rules
        if (rules.hasNonNull("totalSizeLimit")) {
            long maxTotal = rules.get("totalSizeLimit").asLong() * 1024 * 1024;
            if (totalSize > maxTotal)
                errors.add(label + " exceeds total maximum size of " + rules.get("totalSizeLimit").asLong() + " MB");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MULTIPLE CHOICE GRID FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Validates a multiple_choice_grid field.
     * Value is stored as JSON object: {"Service":"Good","Cleanliness":"Average"}
     *
     * Grid config comes from shared_options (same FK as dropdown/radio):
     * options_json =
     * {"rows":["Service","Cleanliness"],"columns":["Poor","Average","Good","Excellent"]}
     *
     * Rules:
     * required → at least one row must be answered
     * eachRowRequired → every row must have exactly one selection
     */
    private void validateMultipleChoiceGridField(FormFieldEntity field, String strValue,
            JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        // Parse submitted JSON object {"Row":"Column"}
        Map<String, String> selections = new LinkedHashMap<>();
        if (strValue != null && !strValue.isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(strValue);
                if (node.isObject()) {
                    node.fields().forEachRemaining(e -> selections.put(e.getKey(), e.getValue().asText()));
                }
            } catch (Exception e) {
                errors.add(label + " has an invalid format (expected JSON object)");
                return;
            }
        }

        // Parse rows and columns from optionsJson (stored in shared_options via FK)
        // Format: {"rows":[...],"columns":[...]}
        List<String> rows = List.of();
        List<String> columns = List.of();
        String optionsJson = field.getOptionsJson();
        if (optionsJson != null && !optionsJson.isBlank()) {
            try {
                JsonNode grid = objectMapper.readTree(optionsJson);
                if (grid.hasNonNull("rows"))
                    rows = parseJsonNodeArray(grid.get("rows"));
                if (grid.hasNonNull("columns"))
                    columns = parseJsonNodeArray(grid.get("columns"));
            } catch (Exception e) {
                log.warn("Failed to parse grid options_json for field '{}': {}", field.getFieldKey(), optionsJson);
            }
        }

        boolean required = field.isRequired() || (rules.hasNonNull("required") && rules.get("required").asBoolean());
        boolean eachRowRequired = rules.hasNonNull("eachRowRequired") && rules.get("eachRowRequired").asBoolean();

        if (selections.isEmpty()) {
            if (required)
                errors.add(label + " is required — please select at least one option");
            return;
        }

        // Validate each row's selection exists and is a valid column value
        for (String row : rows) {
            String selected = selections.get(row);
            if (selected == null || selected.isBlank()) {
                if (eachRowRequired)
                    errors.add(label + ": please select an option for \"" + row + "\"");
            } else if (!columns.isEmpty() && !columns.contains(selected)) {
                errors.add(label + ": \"" + selected + "\" is not a valid option for \"" + row + "\"");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STAR RATING FIELD VALIDATION
    // Fixed 5-star rating. Value stored as INTEGER (1-5).
    // ═══════════════════════════════════════════════════════════════════════

    private void validateStarRatingField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();
        log.debug("validateStarRating '{}' value='{}'", field.getFieldKey(), value);

        int intValue;
        try {
            intValue = Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            errors.add(label + " must be a valid star rating number");
            return;
        }

        if (intValue < 1 || intValue > 5) {
            errors.add(label + " must be between 1 and 5 stars");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHECKBOX GRID FIELD VALIDATION
    // Multi-select per row. Value stored as JSON: {"Row":["ColA","ColB"]}
    // Rules:
    // required → at least one row must have at least one selection
    // eachRowRequired → every row must have at least one selection
    // minPerRow → minimum selections per row
    // maxPerRow → maximum selections per row
    // ═══════════════════════════════════════════════════════════════════════

    private void validateCheckboxGridField(FormFieldEntity field, String strValue,
            JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        // Parse submitted JSON: {"Row1":["ColA","ColB"],"Row2":["ColC"]}
        Map<String, List<String>> selections = new LinkedHashMap<>();
        if (strValue != null && !strValue.isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(strValue);
                if (node.isObject()) {
                    node.fields().forEachRemaining(e -> {
                        List<String> rowSelections = new ArrayList<>();
                        JsonNode vals = e.getValue();
                        if (vals.isArray()) {
                            vals.forEach(v -> rowSelections.add(v.asText()));
                        } else if (vals.isTextual()) {
                            rowSelections.add(vals.asText());
                        }
                        selections.put(e.getKey(), rowSelections);
                    });
                }
            } catch (Exception e) {
                errors.add(label + " has an invalid format (expected JSON object with arrays)");
                return;
            }
        }

        // Parse rows and columns from optionsJson
        List<String> rows = List.of();
        List<String> columns = List.of();
        String optionsJson = field.getOptionsJson();
        if (optionsJson != null && !optionsJson.isBlank()) {
            try {
                JsonNode grid = objectMapper.readTree(optionsJson);
                if (grid.hasNonNull("rows"))
                    rows = parseJsonNodeArray(grid.get("rows"));
                if (grid.hasNonNull("columns"))
                    columns = parseJsonNodeArray(grid.get("columns"));
            } catch (Exception e) {
                log.warn("Failed to parse checkbox_grid options_json for '{}': {}", field.getFieldKey(), optionsJson);
            }
        }

        boolean required = field.isRequired() || (rules.hasNonNull("required") && rules.get("required").asBoolean());
        boolean eachRowRequired = rules.hasNonNull("eachRowRequired") && rules.get("eachRowRequired").asBoolean();
        int minPerRow = rules.hasNonNull("minPerRow") ? rules.get("minPerRow").asInt(0) : 0;
        int maxPerRow = rules.hasNonNull("maxPerRow") ? rules.get("maxPerRow").asInt(Integer.MAX_VALUE) : Integer.MAX_VALUE;

        boolean anySelected = selections.values().stream().anyMatch(list -> !list.isEmpty());

        if (!anySelected) {
            if (required)
                errors.add(label + " is required — please select at least one option");
            return;
        }

        // Per-row validation
        for (String row : rows) {
            List<String> rowSel = selections.getOrDefault(row, List.of());
            if (rowSel.isEmpty()) {
                if (eachRowRequired)
                    errors.add(label + ": please select at least one option for \"" + row + "\"");
                continue;
            }
            if (minPerRow > 0 && rowSel.size() < minPerRow)
                errors.add(label + ": select at least " + minPerRow + " option(s) for \"" + row + "\"");
            if (maxPerRow < Integer.MAX_VALUE && rowSel.size() > maxPerRow)
                errors.add(label + ": select at most " + maxPerRow + " option(s) for \"" + row + "\"");

            // Validate each selected value is a valid column
            if (!columns.isEmpty()) {
                for (String sel : rowSel) {
                    if (!columns.contains(sel))
                        errors.add(label + ": \"" + sel + "\" is not a valid option for \"" + row + "\"");
                }
            }
        }
    }

    /** Parse a JsonNode array into a List<String>. */
    private List<String> parseJsonNodeArray(JsonNode arrayNode) {
        if (arrayNode == null || !arrayNode.isArray())
            return List.of();
        List<String> result = new ArrayList<>();
        arrayNode.forEach(n -> result.add(n.asText()));
        return result;
    }

    /** Parse a JSON string array e.g. ["A","B","C"] into a List<String>. */
    private List<String> parseJsonStringArray(String json) {
        if (json == null || json.isBlank())
            return List.of();
        try {
            JsonNode node = objectMapper.readTree(json);
            return parseJsonNodeArray(node);
        } catch (Exception e) {
            log.warn("Failed to parse JSON string array: {}", json);
        }
        return List.of();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private JsonNode parseValidationJson(String json) {
        if (json == null || json.isBlank())
            return null;
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse validation JSON: {}", json, e);
            return null;
        }
    }

    private boolean isValidEmail(String email) {
        return email.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    }

    private boolean isValidUrl(String url) {
        return url.matches("^(https?://)?([\\w-]+\\.)+[\\w-]+(/[\\w-./?%&=]*)?$");
    }

    private List<String> validatePasswordStrength(String password) {
        List<String> errors = new ArrayList<>();
        if (!password.matches(".*[A-Z].*"))
            errors.add("uppercase");
        if (!password.matches(".*[a-z].*"))
            errors.add("lowercase");
        if (!password.matches(".*[0-9].*"))
            errors.add("digit");
        if (!password.matches(".*[!@#$%^&*(),.?\":{}|<>].*"))
            errors.add("special character");
        return errors;
    }

    /**
     * Checks if a submitted value exists in an options_json array.
     * Supports plain strings ["A","B"] and objects [{"label":"A","value":"A"}].
     */
    private boolean isValidOption(String optionsJson, String value) {
        if (optionsJson == null || optionsJson.isBlank())
            return true; // no options = allow any
        try {
            JsonNode options = objectMapper.readTree(optionsJson);
            if (options.isArray()) {
                for (JsonNode option : options) {
                    if (option.isTextual() && option.asText().equals(value))
                        return true;
                    if (option.isObject()) {
                        JsonNode valNode = option.get("value");
                        if (valNode != null && valNode.asText().equals(value))
                            return true;
                    }
                }
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse options JSON: {}", optionsJson, e);
            return true; // parse error — don't block submission
        }
        return false;
    }

    /**
     * Check if a value already exists in the submission table (uniqueness
     * validation).
     */
    private boolean isDuplicate(String tableName, String columnName, String value) {
        try {
            String sql = "SELECT COUNT(*) FROM \"" + tableName + "\" WHERE \"" + columnName + "\" = ?";
            Integer count = jdbc.queryForObject(sql, Integer.class, value);
            return count != null && count > 0;
        } catch (Exception e) {
            log.warn("Failed to check uniqueness for column {} in table {}", columnName, tableName, e);
            return false;
        }
    }

    /** Formats a double cleanly — removes trailing .0 for whole numbers */
    private String formatNumber(double d) {
        return d == Math.floor(d) && !Double.isInfinite(d) ? String.valueOf((long) d) : String.valueOf(d);
    }
}
