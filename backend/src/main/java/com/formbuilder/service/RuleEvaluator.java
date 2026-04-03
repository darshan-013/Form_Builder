package com.formbuilder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/**
 * RuleEvaluator — Backend implementation of RuleEngine.js logic.
 * Evaluates conditional rules to determine if a field or group should be
 * visible/required.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEvaluator {

    private final CalculationEngine calculationEngine;

    /**
     * Evaluates if a field or group is visible based on its rules and current form data.
     */
    public boolean isVisible(String rulesExpression, Map<String, Object> data) {
        if (rulesExpression == null || rulesExpression.isBlank()) return true;

        try {
            // Attempt to evaluate as a text expression using the CalculationEngine
            Object result = calculationEngine.evaluateFormula(rulesExpression, data);
            
            if (result instanceof Boolean b) return b;
            
            // Fallback: If it's a numeric result, 0 is false, others true
            if (result instanceof Number n) return n.doubleValue() != 0;

            // If it's a string, empty is false, non-empty true
            if (result instanceof String s) return !s.isBlank();

            return result != null;
        } catch (Exception e) {
            log.error("RuleEvaluator Failure: expression='{}' error='{}'", rulesExpression, e.getMessage());
            // Decision 2.3: Throw explicit error would be better, but for visibility 
            // we default to true to avoid hiding fields incorrectly during migration.
            return true; 
        }
    }
    
    // Legacy JSON evaluation methods removed as per Decision 2.1
}
