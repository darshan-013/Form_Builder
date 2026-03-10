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
    private boolean disabled;
    private boolean readOnly;
    private String defaultValue;
    private String validationRegex;
    private String validationJson;
    /**
     * Conditional Rule Engine config JSON — stored and returned, never evaluated by
     * backend.
     */
    private String rulesJson;
    /**
     * UI configuration JSON — field-type-specific settings.
     * linear_scale:
     * {"scaleMin":1,"scaleMax":5,"labelLeft":"Poor","labelRight":"Excellent"}
     */
    private String uiConfigJson;
    /**
     * FK → shared_options.id
     * dropdown/radio/multiple_choice → flat array: [{"label":"A","value":"A"},...]
     * multiple_choice_grid → grid object: {"rows":[...],"columns":[...]}
     */
    private UUID sharedOptionsId;
    private int fieldOrder;

    // Calculated fields
    private Boolean isCalculated;
    private String formulaExpression;
    private java.util.List<String> dependencies;
    private Integer precision;
    private Boolean lockAfterCalculation;
    private String parentGroupKey;
}
