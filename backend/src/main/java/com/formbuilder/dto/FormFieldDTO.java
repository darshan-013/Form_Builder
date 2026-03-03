package com.formbuilder.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class FormFieldDTO {
    private UUID id;
    private String fieldKey;
    private String label;
    private String fieldType;
    private boolean required;
    private String defaultValue;
    private String validationRegex;
    private String validationJson;
    /**
     * FK → shared_options.id
     * Must be set for dropdown/radio fields.
     * Options are stored only in shared_options table, never inline.
     */
    private UUID sharedOptionsId;
    private int fieldOrder;
}
