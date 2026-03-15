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
    private String formName;
    private String creator;
    private String currentApprover;
    private Integer workflowStep;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

