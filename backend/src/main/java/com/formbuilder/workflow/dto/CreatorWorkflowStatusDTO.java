package com.formbuilder.workflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

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
    private List<StepInfo> steps;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StepInfo {
        private String approverName;
        private Integer stepIndex;
        private String status;
        private String comments;
        private LocalDateTime decidedAt;
    }
}

