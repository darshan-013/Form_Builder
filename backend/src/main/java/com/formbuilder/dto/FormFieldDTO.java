package com.formbuilder.dto;

import lombok.Data;
import java.util.UUID;
import jakarta.validation.constraints.NotBlank;

@Data
public class FormFieldDTO {
    private UUID id;
    @NotBlank(message = "Field key cannot be blank")
    private String fieldKey;

    @NotBlank(message = "Label cannot be blank")
    private String label;

    @NotBlank(message = "Field type cannot be blank")
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
    private UUID groupId;
    private String validationMessage;
    private String gridJson;
    private String tableRefJson;

    // Manual getters and setters as fallback for Lombok issues
    public String getGridJson() {
        return gridJson;
    }

    public void setGridJson(String gridJson) {
        this.gridJson = gridJson;
    }

    public String getTableRefJson() {
        return tableRefJson;
    }

    public void setTableRefJson(String tableRefJson) {
        this.tableRefJson = tableRefJson;
    }
}
