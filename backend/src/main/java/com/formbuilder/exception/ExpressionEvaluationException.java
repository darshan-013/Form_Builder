package com.formbuilder.exception;

import lombok.Getter;

import java.util.Map;

/**
 * Thrown when an expression (formula or rule) fails to parse or evaluate.
 * Aligns with Decision 2.3 of the Validation & Expression Engine spec.
 */
@Getter
public class ExpressionEvaluationException extends RuntimeException {
    
    private final String reason;
    private final String expression;
    private final String fieldKey;
    private final Map<String, Object> context;

    public ExpressionEvaluationException(String reason, String expression, String fieldKey, Map<String, Object> context) {
        super(String.format("Expression evaluation failed for field '%s': %s", fieldKey, reason));
        this.reason = reason;
        this.expression = expression;
        this.fieldKey = fieldKey;
        this.context = context;
    }
}
