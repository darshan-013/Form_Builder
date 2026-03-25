package com.formbuilder.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Response for GET /api/forms/{formId}/render — consumed directly by the
 * frontend renderer.
 */
@Data
@Builder
public class FormRenderDTO {
    private UUID formId;
    private UUID formVersionId;
    private int versionNumber;
    private String formName;
    private String formDescription;
    private List<RenderFieldDTO> fields;
    private List<RenderGroupDTO> groups;

    /** If false — only ONE submission per session is allowed. */
    private boolean allowMultipleSubmissions;

    /** If true — submission timestamp is shown in the submission list. */
    private boolean showTimestamp;

    /**
     * Optional expiry date-time (ISO-8601). Null = no expiry.
     * Frontend uses this to show an "Expired" screen instead of the form.
     */
    private LocalDateTime expiresAt;

    @Data
    @Builder
    public static class RenderFieldDTO {
        private String fieldKey;
        private String label;
        private String fieldType;
        private boolean required;
        private boolean disabled;
        private boolean readOnly;
        private String validationRegex;
        private String validationJson;
        /**
         * Conditional Rule Engine config — passed through to frontend for live
         * evaluation.
         */
        private String rulesJson;
        private String defaultValue;
        private int fieldOrder;
        /**
         * Populated for dropdown/radio/multiple_choice — flat options from
         * shared_options table
         */
        private List<OptionDTO> options;
        /**
         * Populated for multiple_choice_grid — raw JSON string from shared_options:
         * {"rows":["Service","Cleanliness"],"columns":["Poor","Average","Good","Excellent"]}
         * Frontend parses this to render the grid table.
         */
        private String gridJson;
        /**
         * UI config for field-type-specific settings (e.g. linear_scale min/max/labels)
         */
        private String uiConfigJson;
        /**
         * true = static UI element — no input collected, skip validation & submission
         */
        @JsonProperty("isStatic")
        private boolean isStatic;
        /**
         * Display content for static elements (section_header, label_text,
         * description_block)
         */
        private String staticData;

        // Calculated fields
        @JsonProperty("isCalculated")
        private boolean isCalculated;
        private String formulaExpression;
        private List<String> dependencies;
        private Integer precision;
        private boolean lockAfterCalculation;
        private String parentGroupKey;
        private UUID groupId;
    }

    @Data
    @Builder
    public static class OptionDTO {
        private String label;
        private String value;
    }

    @Data
    @Builder
    public static class RenderGroupDTO {
        private UUID id;
        private String groupTitle;
        private String groupDescription;
        private int groupOrder;
        private String rulesJson;
    }
}
