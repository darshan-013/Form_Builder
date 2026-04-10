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

    private final ObjectMapper objectMapper;
    private final CalculationEngine calculationEngine;

    /**
     * Evaluates if a field or group is visible based on its rules and current form data.
     */
    public boolean isVisible(String rulesJson, Map<String, Object> data) {
        if (rulesJson == null || rulesJson.isBlank()) return true;

        try {
            // 1. Detect if it's a JSON structured rule or a plain expression
            String trimmed = rulesJson.trim();
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                JsonNode root = objectMapper.readTree(rulesJson);
                // If it has conditions, it's a structured JSON rule
                if (root.has("conditions") || root.has("combinator")) {
                    return evaluateNode(root, data);
                }
            }

            // 2. Fallback to CalculationEngine for plain expressions (e.g. from Custom Validations)
            Object result = calculationEngine.evaluateFormula(rulesJson, data);
            
            if (result instanceof Boolean b) return b;
            if (result instanceof Number n) return n.doubleValue() != 0;
            if (result instanceof String s) return !s.isBlank();
            return result != null;

        } catch (Exception e) {
            log.error("RuleEvaluator Failure: rulesJson='{}' error='{}'", rulesJson, e.getMessage());
            // Default to visible on failure to preserve data during submission/migration
            return true; 
        }
    }

    private boolean evaluateNode(JsonNode node, Map<String, Object> data) {
        if (node.has("conditions") && node.get("conditions").isArray()) {
            String combinator = node.has("combinator") ? node.get("combinator").asText() : "AND";
            JsonNode conditions = node.get("conditions");
            
            if ("OR".equalsIgnoreCase(combinator)) {
                for (JsonNode child : conditions) {
                    if (evaluateNode(child, data)) return true;
                }
                return conditions.isEmpty(); // Empty OR is usually treated as true or false? Front-end defaults and/every to true if empty.
            } else { // AND
                for (JsonNode child : conditions) {
                    if (!evaluateNode(child, data)) return false;
                }
                return true;
            }
        }
        
        // Leaf condition
        return evaluateLeafCondition(node, data);
    }

    private boolean evaluateLeafCondition(JsonNode cond, Map<String, Object> data) {
        String fieldKey = cond.has("fieldKey") ? cond.get("fieldKey").asText() : null;
        String operator = cond.has("operator") ? cond.get("operator").asText() : null;
        String targetValue = cond.has("value") ? cond.get("value").asText() : "";
        
        if (fieldKey == null || operator == null) return true;

        Object rawValue = data.get(fieldKey);
        String fieldValue = (rawValue == null) ? "" : String.valueOf(rawValue);

        return switch (operator) {
            case "equals", "=" -> fieldValue.equalsIgnoreCase(targetValue);
            case "not equals", "!=" -> !fieldValue.equalsIgnoreCase(targetValue);
            case "contains" -> fieldValue.toLowerCase().contains(targetValue.toLowerCase());
            case "not contains" -> !fieldValue.toLowerCase().contains(targetValue.toLowerCase());
            case "starts with" -> fieldValue.toLowerCase().startsWith(targetValue.toLowerCase());
            case "ends with" -> fieldValue.toLowerCase().endsWith(targetValue.toLowerCase());
            case "is empty" -> fieldValue.trim().isEmpty();
            case "is not empty" -> !fieldValue.trim().isEmpty();
            case "is true" -> isTruthy(fieldValue);
            case "is false" -> !isTruthy(fieldValue);
            
            case ">", "length >" -> {
                double n1 = toDouble(fieldValue);
                double n2 = toDouble(targetValue);
                if (operator.equals("length >")) yield fieldValue.length() > n2;
                yield n1 > n2;
            }
            case ">=" -> toDouble(fieldValue) >= toDouble(targetValue);
            case "<", "length <" -> {
                double n1 = toDouble(fieldValue);
                double n2 = toDouble(targetValue);
                if (operator.equals("length <")) yield fieldValue.length() < n2;
                yield n1 < n2;
            }
            case "<=" -> toDouble(fieldValue) <= toDouble(targetValue);
            case "length =" -> fieldValue.length() == (int)toDouble(targetValue);

            case "between" -> {
                String[] parts = targetValue.split(",");
                if (parts.length < 2) yield false;
                double val = toDouble(fieldValue);
                double v1 = toDouble(parts[0].trim());
                double v2 = toDouble(parts[1].trim());
                yield val >= v1 && val <= v2;
            }
            case "in list" -> {
                List<String> list = Arrays.stream(targetValue.split(","))
                        .map(s -> s.trim().toLowerCase())
                        .toList();
                yield list.contains(fieldValue.toLowerCase());
            }
            case "is uploaded" -> !fieldValue.trim().isEmpty() && !fieldValue.equals("[]");
            case "is not uploaded" -> fieldValue.trim().isEmpty() || fieldValue.equals("[]");
            
            case "before" -> fieldValue.compareTo(targetValue) < 0;
            case "after" -> fieldValue.compareTo(targetValue) > 0;
            
            default -> true;
        };
    }

    private boolean isTruthy(String v) {
        String s = v.toLowerCase();
        return s.equals("true") || s.equals("1") || s.equals("yes");
    }

    private double toDouble(String v) {
        try { return Double.parseDouble(v); } catch (Exception e) { return 0; }
    }
    
    // Legacy JSON evaluation methods removed as per Decision 2.1
}
