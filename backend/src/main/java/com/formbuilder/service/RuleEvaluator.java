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

    private final ObjectMapper mapper;

    /**
     * Evaluates if a field or group is visible based on its rules and current form
     * data.
     */
    public boolean isVisible(String rulesJson, Map<String, Object> data) {
        if (rulesJson == null || rulesJson.isBlank())
            return true;

        try {
            JsonNode root = mapper.readTree(rulesJson);
            if (!root.has("conditions") || !root.get("conditions").isArray())
                return true;

            String combinator = root.has("combinator") ? root.get("combinator").asText() : "AND";
            JsonNode conditions = root.get("conditions");

            boolean result = "AND".equalsIgnoreCase(combinator);

            for (JsonNode condition : conditions) {
                boolean condResult = evaluateCondition(condition, data);
                if ("AND".equalsIgnoreCase(combinator)) {
                    result &= condResult;
                    if (!result)
                        break;
                } else {
                    result |= condResult;
                    if (result)
                        break;
                }
            }

            // Check actions for 'hide'
            if (result && root.has("actions")) {
                for (JsonNode action : root.get("actions")) {
                    if ("hide".equalsIgnoreCase(action.get("type").asText())) {
                        return false;
                    }
                }
            }

            // If the rule matched and had 'show' action, it's visible.
            // If it matched and had 'hide', we returned false above.
            // If it didn't match, we return the inverse of the action.
            // Simplification: Default behavior is visible unless a rule explicitly hides
            // it.
            // In our system, usually rules are "If X then Hide" or "If X then Show".

            if (root.has("actions")) {
                for (JsonNode action : root.get("actions")) {
                    String type = action.get("type").asText();
                    if ("show".equalsIgnoreCase(type))
                        return result;
                    if ("hide".equalsIgnoreCase(type))
                        return !result;
                }
            }

            return true;
        } catch (Exception e) {
            log.warn("Failed to evaluate rules: {}", rulesJson, e);
            return true;
        }
    }

    private boolean evaluateCondition(JsonNode node, Map<String, Object> data) {
        if (node.has("conditions")) {
            // Nested group
            String combinator = node.has("combinator") ? node.get("combinator").asText() : "AND";
            boolean result = "AND".equalsIgnoreCase(combinator);
            for (JsonNode sub : node.get("conditions")) {
                boolean subRes = evaluateCondition(sub, data);
                if ("AND".equalsIgnoreCase(combinator))
                    result &= subRes;
                else
                    result |= subRes;
            }
            return result;
        }

        String fieldKey = node.get("fieldKey").asText();
        String operator = node.get("operator").asText();
        JsonNode ruleValueNode = node.get("value");
        String ruleValue = (ruleValueNode != null && !ruleValueNode.isNull()) ? ruleValueNode.asText() : "";

        Object rawActual = data.get(fieldKey);
        String actual = rawActual == null ? "" : String.valueOf(rawActual).trim();

        return switch (operator) {
            case "equals" -> actual.equalsIgnoreCase(ruleValue);
            case "not equals" -> !actual.equalsIgnoreCase(ruleValue);
            case "contains" -> actual.toLowerCase().contains(ruleValue.toLowerCase());
            case "not contains" -> !actual.toLowerCase().contains(ruleValue.toLowerCase());
            case "is empty" -> actual.isEmpty();
            case "is not empty" -> !actual.isEmpty();
            case "greater than" -> compareNumeric(actual, ruleValue) > 0;
            case "less than" -> compareNumeric(actual, ruleValue) < 0;
            case "is true" -> "true".equalsIgnoreCase(actual);
            case "is false" -> "false".equalsIgnoreCase(actual);
            default -> {
                log.warn("Unsupported operator: {}", operator);
                yield true;
            }
        };
    }

    private int compareNumeric(String actual, String expected) {
        try {
            double a = Double.parseDouble(actual);
            double e = Double.parseDouble(expected);
            return Double.compare(a, e);
        } catch (Exception e) {
            return actual.compareToIgnoreCase(expected);
        }
    }
}
