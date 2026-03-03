package com.formbuilder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;

/**
 * Thrown when form submission fails validation.
 * Carries a map of { fieldKey → List<errorMessage> } so the frontend
 * can highlight the exact field that failed.
 */
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class ValidationException extends RuntimeException {

    /** fieldKey → list of error messages for that field */
    private final Map<String, List<String>> fieldErrors;

    /** Legacy: flat list of error strings (kept for backward compat) */
    private final List<String> errors;

    /** Primary constructor — field-keyed errors */
    public ValidationException(Map<String, List<String>> fieldErrors) {
        super("Validation failed: " + fieldErrors);
        this.fieldErrors = fieldErrors;
        // Flatten for getErrors() callers
        this.errors = fieldErrors.values().stream()
                .flatMap(List::stream)
                .toList();
    }

    /** Legacy flat-list constructor */
    public ValidationException(List<String> errors) {
        super("Validation failed: " + errors);
        this.errors = errors;
        this.fieldErrors = new LinkedHashMap<>();
        // Put all under a "general" key so the frontend shows them as a banner
        if (!errors.isEmpty()) {
            this.fieldErrors.put("__general__", errors);
        }
    }

    public Map<String, List<String>> getFieldErrors() {
        return fieldErrors;
    }

    public List<String> getErrors() {
        return errors;
    }
}
