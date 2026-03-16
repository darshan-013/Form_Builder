package com.formbuilder.workflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminWorkflowStatusDTO {
    private Long workflowId;
    private java.util.UUID formId;
    private String formName;
    private String creator;
    private String currentApprover;
    private Integer workflowStep;
    private Integer totalSteps;
    private String targetBuilderName;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

