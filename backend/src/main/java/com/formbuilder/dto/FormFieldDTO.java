package com.formbuilder.dto;

import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class FormFieldDTO {
    private UUID id; // null for new fields; present for existing ones
    private String fieldKey;
    private String label;
    private String fieldType; // text | number | date | boolean | dropdown | radio | file
    private boolean required;
    private String defaultValue;
    private String validationRegex;
    private String optionsJson; // JSON array for dropdown/radio (backward compatibility)
    private String validationJson; // JSON object for advanced validation rules
    private List<FieldOptionDTO> options; // Normalized options (alternative to optionsJson)
    private int fieldOrder;
}
