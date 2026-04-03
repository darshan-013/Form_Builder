package com.formbuilder.dto;

import com.formbuilder.entity.CustomValidationRuleEntity.ValidationRuleScope;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomValidationRuleDTO {
    private UUID id;
    private ValidationRuleScope scope;
    private String fieldKey;
    private String expression;
    private String errorMessage;
    private int executionOrder;
}
