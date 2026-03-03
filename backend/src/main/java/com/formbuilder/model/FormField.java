package com.formbuilder.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FormField {
    private UUID id;
    private UUID formId;
    private String fieldKey; // maps to column name in submission table
    private String label;
    private String fieldType; // text | number | date | boolean
    private boolean required;
    private String defaultValue;
    private String validationRegex;
    private int fieldOrder;
    private LocalDateTime createdAt;
}
