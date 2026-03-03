package com.formbuilder.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/** Response for GET /api/forms/{formId}/render — consumed directly by the frontend renderer. */
@Data
@Builder
public class FormRenderDTO {
    private UUID formId;
    private String formName;
    private String formDescription;
    private List<RenderFieldDTO> fields;

    @Data
    @Builder
    public static class RenderFieldDTO {
        private String fieldKey;
        private String label;
        private String fieldType;
        private boolean required;
        private String validationRegex;
        private String validationJson;
        private String defaultValue;
        private int fieldOrder;
        /** Populated for dropdown/radio — from dropdown_schema or options_json */
        private List<OptionDTO> options;
    }

    @Data
    @Builder
    public static class OptionDTO {
        private String label;
        private String value;
    }
}
