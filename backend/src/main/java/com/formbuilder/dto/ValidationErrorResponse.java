package com.formbuilder.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Response structure for validation errors.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ValidationErrorResponse {
    private List<ValidationError> errors = new ArrayList<>();

    public ValidationErrorResponse(String field, String message) {
        this.errors.add(new ValidationError(field, message));
    }

    public void addError(String field, String message) {
        this.errors.add(new ValidationError(field, message));
    }
}

