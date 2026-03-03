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
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Advanced field validation service.
 * Validates form submissions based on validation_json metadata.
 */
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
            Map<String, MultipartFile> files) {
        List<String> errors = new ArrayList<>();

        // Parse validation rules
        JsonNode rules = parseValidationJson(field.getValidationJson());
        if (rules == null) {
            rules = objectMapper.createObjectNode(); // Empty rules if not configured
        }

        String strValue = (value != null) ? value.toString().trim() : "";
        boolean isEmpty = strValue.isEmpty();

        // Required check (universal)
        if (field.isRequired() && isEmpty && !"boolean".equals(field.getFieldType())) {
            errors.add(field.getLabel() + " is required");
            return errors; // Skip further validation on empty required field
        }

        // Skip validation on empty optional fields
        if (isEmpty && !field.isRequired()) {
            return errors;
        }

        // Type-specific validation
        switch (field.getFieldType().toLowerCase()) {
            case "text":
                validateTextField(field, strValue, rules, errors, tableName);
                break;
            case "number":
                validateNumberField(field, strValue, rules, errors, tableName);
                break;
            case "date":
                validateDateField(field, strValue, rules, errors);
                break;
            case "boolean":
                validateBooleanField(field, value, rules, errors);
                break;
            case "dropdown":
                validateDropdownField(field, strValue, rules, errors);
                break;
            case "radio":
                validateRadioField(field, strValue, rules, errors);
                break;
            case "file":
                validateFileField(field, files, rules, errors, tableName);
                break;
        }

        return errors;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXT FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateTextField(FormFieldEntity field, String value, JsonNode rules, List<String> errors,
            String tableName) {
        String label = field.getLabel();

        // Basic length validations
        if (rules.has("minLength")) {
            int min = rules.get("minLength").asInt();
            if (value.length() < min) {
                errors.add(label + " must be at least " + min + " characters");
            }
        }

        if (rules.has("maxLength")) {
            int max = rules.get("maxLength").asInt();
            if (value.length() > max) {
                errors.add(label + " must not exceed " + max + " characters");
            }
        }

        if (rules.has("exactLength")) {
            int exact = rules.get("exactLength").asInt();
            if (value.length() != exact) {
                errors.add(label + " must be exactly " + exact + " characters");
            }
        }

        // Whitespace validations
        if (rules.has("noLeadingTrailingSpaces") && rules.get("noLeadingTrailingSpaces").asBoolean()) {
            if (!value.equals(value.trim())) {
                errors.add(label + " must not have leading or trailing spaces");
            }
        }

        if (rules.has("noConsecutiveSpaces") && rules.get("noConsecutiveSpaces").asBoolean()) {
            if (value.contains("  ")) {
                errors.add(label + " must not contain consecutive spaces");
            }
        }

        // Format validations
        if (rules.has("alphabetOnly") && rules.get("alphabetOnly").asBoolean()) {
            if (!value.matches("^[A-Za-z]+$")) {
                errors.add(label + " must contain only alphabetic characters");
            }
        }

        if (rules.has("alphanumericOnly") && rules.get("alphanumericOnly").asBoolean()) {
            if (!value.matches("^[A-Za-z0-9]+$")) {
                errors.add(label + " must contain only letters and numbers");
            }
        }

        if (rules.has("noSpecialCharacters") && rules.get("noSpecialCharacters").asBoolean()) {
            if (!value.matches("^[A-Za-z0-9\\s]+$")) {
                errors.add(label + " must not contain special characters");
            }
        }

        if (rules.has("allowSpecificSpecialCharacters")) {
            String allowed = rules.get("allowSpecificSpecialCharacters").asText();
            String pattern = "^[A-Za-z0-9\\s" + Pattern.quote(allowed) + "]+$";
            if (!value.matches(pattern)) {
                errors.add(label + " contains invalid characters. Allowed: " + allowed);
            }
        }

        // Content validations
        if (rules.has("emailFormat") && rules.get("emailFormat").asBoolean()) {
            if (!isValidEmail(value)) {
                errors.add(label + " must be a valid email address");
            }
        }

        if (rules.has("urlFormat") && rules.get("urlFormat").asBoolean()) {
            if (!isValidUrl(value)) {
                errors.add(label + " must be a valid URL");
            }
        }

        if (rules.has("passwordStrength") && rules.get("passwordStrength").asBoolean()) {
            List<String> pwdErrors = validatePasswordStrength(value);
            if (!pwdErrors.isEmpty()) {
                errors.add(label + " must contain uppercase, lowercase, digit, and special character");
            }
        }

        // Custom regex
        if (rules.has("customRegex")) {
            String regex = rules.get("customRegex").asText();
            try {
                if (!Pattern.compile(regex).matcher(value).find()) {
                    errors.add(label + " format is invalid");
                }
            } catch (Exception e) {
                log.warn("Invalid regex pattern: {}", regex, e);
            }
        }

        // Uniqueness check
        if (rules.has("unique") && rules.get("unique").asBoolean()) {
            if (isDuplicate(tableName, field.getFieldKey(), value)) {
                errors.add(label + " must be unique. This value already exists");
            }
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

        // Basic type validations
        if (rules.has("integerOnly") && rules.get("integerOnly").asBoolean()) {
            if (numValue != Math.floor(numValue)) {
                errors.add(label + " must be an integer");
            }
        }

        if (rules.has("positiveOnly") && rules.get("positiveOnly").asBoolean()) {
            if (numValue <= 0) {
                errors.add(label + " must be positive");
            }
        }

        if (rules.has("zeroAllowed") && !rules.get("zeroAllowed").asBoolean()) {
            if (numValue == 0) {
                errors.add(label + " cannot be zero");
            }
        }

        // Range validations
        if (rules.has("minValue")) {
            double min = rules.get("minValue").asDouble();
            if (numValue < min) {
                errors.add(label + " must be at least " + min);
            }
        }

        if (rules.has("maxValue")) {
            double max = rules.get("maxValue").asDouble();
            if (numValue > max) {
                errors.add(label + " must not exceed " + max);
            }
        }

        // Format validations
        if (rules.has("maxDigits")) {
            int maxDigits = rules.get("maxDigits").asInt();
            String intPart = value.split("\\.")[0].replaceAll("-", "");
            if (intPart.length() > maxDigits) {
                errors.add(label + " must not have more than " + maxDigits + " digits");
            }
        }

        if (rules.has("maxDecimalPlaces")) {
            int maxDecimals = rules.get("maxDecimalPlaces").asInt();
            if (value.contains(".")) {
                String decimalPart = value.split("\\.")[1];
                if (decimalPart.length() > maxDecimals) {
                    errors.add(label + " must not have more than " + maxDecimals + " decimal places");
                }
            }
        }

        if (rules.has("noLeadingZero") && rules.get("noLeadingZero").asBoolean()) {
            if (value.matches("^0[0-9]+.*")) {
                errors.add(label + " must not have leading zeros");
            }
        }

        // Business validations
        if (rules.has("phoneNumberFormat") && rules.get("phoneNumberFormat").asBoolean()) {
            if (!value.matches("^[0-9]{10}$")) {
                errors.add(label + " must be a valid 10-digit phone number");
            }
        }

        if (rules.has("otpFormat")) {
            int length = rules.get("otpFormat").asInt();
            if (!value.matches("^[0-9]{" + length + "}$")) {
                errors.add(label + " must be a " + length + "-digit OTP");
            }
        }

        if (rules.has("ageValidation") && rules.get("ageValidation").asBoolean()) {
            if (numValue < 18) {
                errors.add(label + " must be at least 18");
            }
        }

        if (rules.has("percentageRange") && rules.get("percentageRange").asBoolean()) {
            if (numValue < 0 || numValue > 100) {
                errors.add(label + " must be between 0 and 100");
            }
        }

        // Uniqueness check
        if (rules.has("uniqueNumber") && rules.get("uniqueNumber").asBoolean()) {
            if (isDuplicate(tableName, field.getFieldKey(), value)) {
                errors.add(label + " must be unique. This value already exists");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DATE FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateDateField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();
        LocalDate date;

        try {
            date = LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            errors.add(label + " must be a valid date");
            return;
        }

        LocalDate today = LocalDate.now();

        // Range validations
        if (rules.has("minDate")) {
            LocalDate min = LocalDate.parse(rules.get("minDate").asText());
            if (date.isBefore(min)) {
                errors.add(label + " must be on or after " + min);
            }
        }

        if (rules.has("maxDate")) {
            LocalDate max = LocalDate.parse(rules.get("maxDate").asText());
            if (date.isAfter(max)) {
                errors.add(label + " must be on or before " + max);
            }
        }

        // Logical validations
        if (rules.has("pastOnly") && rules.get("pastOnly").asBoolean()) {
            if (date.isAfter(today)) {
                errors.add(label + " must be in the past");
            }
        }

        if (rules.has("futureOnly") && rules.get("futureOnly").asBoolean()) {
            if (date.isBefore(today)) {
                errors.add(label + " must be in the future");
            }
        }

        if (rules.has("age18Plus") && rules.get("age18Plus").asBoolean()) {
            int age = Period.between(date, today).getYears();
            if (age < 18) {
                errors.add(label + " indicates age must be at least 18 years");
            }
        }

        if (rules.has("notOlderThanXYears")) {
            int maxYears = rules.get("notOlderThanXYears").asInt();
            int age = Period.between(date, today).getYears();
            if (age > maxYears) {
                errors.add(label + " must not be older than " + maxYears + " years");
            }
        }

        if (rules.has("noWeekend") && rules.get("noWeekend").asBoolean()) {
            if (date.getDayOfWeek().getValue() >= 6) {
                errors.add(label + " cannot be a weekend");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BOOLEAN FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateBooleanField(FormFieldEntity field, Object value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        if (rules.has("mustBeTrue") && rules.get("mustBeTrue").asBoolean()) {
            boolean boolValue = Boolean.parseBoolean(value.toString());
            if (!boolValue) {
                errors.add(label + " must be accepted");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DROPDOWN FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateDropdownField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        // Validate option exists
        if (!isValidOption(field.getOptionsJson(), value)) {
            errors.add(label + " has an invalid selection");
            return;
        }

        if (rules.has("defaultNotAllowed")) {
            String defaultValue = rules.get("defaultNotAllowed").asText();
            if (value.equals(defaultValue)) {
                errors.add(label + " default option is not allowed");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RADIO FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateRadioField(FormFieldEntity field, String value, JsonNode rules, List<String> errors) {
        String label = field.getLabel();

        // Validate option exists
        if (!isValidOption(field.getOptionsJson(), value)) {
            errors.add(label + " has an invalid selection");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILE FIELD VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    private void validateFileField(FormFieldEntity field, Map<String, MultipartFile> files, JsonNode rules,
            List<String> errors, String tableName) {
        String label = field.getLabel();
        MultipartFile file = files != null ? files.get(field.getFieldKey()) : null;

        if (file == null || file.isEmpty()) {
            if (field.isRequired()) {
                errors.add(label + " is required");
            }
            return;
        }

        String filename = file.getOriginalFilename();
        long fileSize = file.getSize();
        String contentType = file.getContentType();

        // File extension validation
        if (rules.has("allowedExtensions")) {
            String[] allowed = rules.get("allowedExtensions").asText().split(",");
            boolean validExt = false;
            for (String ext : allowed) {
                if (filename != null && filename.toLowerCase().endsWith(ext.trim().toLowerCase())) {
                    validExt = true;
                    break;
                }
            }
            if (!validExt) {
                errors.add(label + " must be one of: " + rules.get("allowedExtensions").asText());
            }
        }

        // MIME type validation
        if (rules.has("mimeTypeValidation")) {
            String[] allowedMimes = rules.get("mimeTypeValidation").asText().split(",");
            boolean validMime = false;
            for (String mime : allowedMimes) {
                if (contentType != null && contentType.equals(mime.trim())) {
                    validMime = true;
                    break;
                }
            }
            if (!validMime) {
                errors.add(label + " has invalid file type");
            }
        }

        // File size validations
        if (rules.has("maxFileSize")) {
            long maxSize = rules.get("maxFileSize").asLong() * 1024 * 1024; // Convert MB to bytes
            if (fileSize > maxSize) {
                errors.add(label + " exceeds maximum size of " + rules.get("maxFileSize").asLong() + " MB");
            }
        }

        if (rules.has("minFileSize")) {
            long minSize = rules.get("minFileSize").asLong() * 1024; // Convert KB to bytes
            if (fileSize < minSize) {
                errors.add(label + " is smaller than minimum size of " + rules.get("minFileSize").asLong() + " KB");
            }
        }

        // Image dimension validation
        if (rules.has("imageDimensionCheck")) {
            try {
                BufferedImage image = ImageIO.read(file.getInputStream());
                if (image != null) {
                    JsonNode dimensions = rules.get("imageDimensionCheck");
                    if (dimensions.has("minWidth") && image.getWidth() < dimensions.get("minWidth").asInt()) {
                        errors.add(label + " width must be at least " + dimensions.get("minWidth").asInt() + " pixels");
                    }
                    if (dimensions.has("maxWidth") && image.getWidth() > dimensions.get("maxWidth").asInt()) {
                        errors.add(label + " width must not exceed " + dimensions.get("maxWidth").asInt() + " pixels");
                    }
                    if (dimensions.has("minHeight") && image.getHeight() < dimensions.get("minHeight").asInt()) {
                        errors.add(label + " height must be at least " + dimensions.get("minHeight").asInt() + " pixels");
                    }
                    if (dimensions.has("maxHeight") && image.getHeight() > dimensions.get("maxHeight").asInt()) {
                        errors.add(label + " height must not exceed " + dimensions.get("maxHeight").asInt() + " pixels");
                    }
                }
            } catch (IOException e) {
                log.warn("Failed to read image dimensions for field {}", field.getFieldKey(), e);
            }
        }

        // Filename validation
        if (rules.has("fileNameValidation") && rules.get("fileNameValidation").asBoolean()) {
            if (filename != null && !filename.matches("^[A-Za-z0-9._-]+$")) {
                errors.add(label + " filename contains invalid characters");
            }
        }

        // Duplicate file prevention
        if (rules.has("duplicateFilePrevention") && rules.get("duplicateFilePrevention").asBoolean()) {
            if (filename != null && isDuplicate(tableName, field.getFieldKey(), filename)) {
                errors.add(label + " with this filename already exists");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════

    private JsonNode parseValidationJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
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
        if (!password.matches(".*[A-Z].*")) {
            errors.add("uppercase");
        }
        if (!password.matches(".*[a-z].*")) {
            errors.add("lowercase");
        }
        if (!password.matches(".*[0-9].*")) {
            errors.add("digit");
        }
        if (!password.matches(".*[!@#$%^&*(),.?\":{}|<>].*")) {
            errors.add("special character");
        }
        return errors;
    }

    private boolean isValidOption(String optionsJson, String value) {
        if (optionsJson == null || optionsJson.isBlank()) {
            return true; // No options configured
        }
        try {
            JsonNode options = objectMapper.readTree(optionsJson);
            if (options.isArray()) {
                for (JsonNode option : options) {
                    if (option.asText().equals(value)) {
                        return true;
                    }
                }
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse options JSON: {}", optionsJson, e);
        }
        return false;
    }

    /**
     * Check if a value already exists in the submission table (for uniqueness validation).
     */
    private boolean isDuplicate(String tableName, String columnName, String value) {
        try {
            String sql = "SELECT COUNT(*) FROM \"" + tableName + "\" WHERE \"" + columnName + "\" = ?";
            Integer count = jdbc.queryForObject(sql, Integer.class, value);
            return count != null && count > 0;
        } catch (Exception e) {
            log.warn("Failed to check uniqueness for column {} in table {}", columnName, tableName, e);
            return false; // On error, assume not duplicate
        }
    }
}


