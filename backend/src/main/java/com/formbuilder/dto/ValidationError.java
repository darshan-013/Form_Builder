package com.formbuilder.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a single field validation error.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ValidationError {
    private String field;
    private String message;
}

