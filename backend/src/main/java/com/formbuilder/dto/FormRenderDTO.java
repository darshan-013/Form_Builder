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
        /** Conditional Rule Engine config — passed through to frontend for live evaluation. */
        private String rulesJson;
        private String defaultValue;
        private int fieldOrder;
        /** Populated for dropdown/radio — from shared_options table */
        private List<OptionDTO> options;
    }

    @Data
    @Builder
    public static class OptionDTO {
        private String label;
        private String value;
    }
}
