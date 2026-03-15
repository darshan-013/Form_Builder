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
public class BuilderReviewDTO {
    private Long workflowId;
    private String formName;
    private String creatorName;
    private Integer currentStep;
    private LocalDateTime submittedAt;
    private String status;
}

