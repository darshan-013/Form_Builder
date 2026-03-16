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
public class CreatorWorkflowStatusDTO {
    private Long workflowId;
    private java.util.UUID formId;
    private String formName;
    private Integer currentStep;
    private Integer totalSteps;
    private String targetBuilderName;
    private String status;
    private LocalDateTime submittedAt;
    private LocalDateTime lastUpdatedAt;
}

