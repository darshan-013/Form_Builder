package com.formbuilder.dto;

import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class FormDTO {
    private String name;
    private String description;
    private List<FormFieldDTO> fields;
    /** Static UI-only elements (section_header, label_text, description_block) */
    private List<StaticFieldDTO> staticFields;

    @Data
    public static class StaticFieldDTO {
        private UUID   id;          // null on create, populated on edit/update
        private String fieldType;   // section_header | label_text | description_block
        private String data;        // display text content
        private int    fieldOrder;
    }
}
