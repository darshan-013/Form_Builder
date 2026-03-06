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
        /** Populated for dropdown/radio/multiple_choice — flat options from shared_options table */
        private List<OptionDTO> options;
        /**
         * Populated for multiple_choice_grid — raw JSON string from shared_options:
         * {"rows":["Service","Cleanliness"],"columns":["Poor","Average","Good","Excellent"]}
         * Frontend parses this to render the grid table.
         */
        private String gridJson;
        /** UI config for field-type-specific settings (e.g. linear_scale min/max/labels) */
        private String uiConfigJson;
        /** true = static UI element — no input collected, skip validation & submission */
        private boolean isStatic;
        /** Display content for static elements (section_header, label_text, description_block) */
        private String staticData;
    }

    @Data
    @Builder
    public static class OptionDTO {
        private String label;
        private String value;
    }
}
