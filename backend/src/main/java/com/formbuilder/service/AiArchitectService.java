package com.formbuilder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiArchitectService {

    @Value("${ai.groq.api-key}")
    private String apiKey;

    @Value("${ai.groq.model}")
    private String model;

    @Value("${ai.groq.url}")
    private String apiUrl;

    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    private static final String SYSTEM_PROMPT = """
        You are the "Form Architect" for the FormCraft system.
        Your goal is to help users design full-featured forms by generating JSON matching the internal structure.

        ### CONSTRAINTS:
        1. Output ONLY a Conversational Response followed by a RAW JSON block (using ```json markers).
        2. Report the number of fields, rules, and calculations created.
        3. Strict adherence to Field Types, Validations, Formulae, and Rule Engine schema.
        4. SECURITY PROTOCOL: You ONLY have access to the form schema layout. NEVER attempt to execute SQL, interact with a database, access environment variables, or insert placeholder passwords/credentials. Do not process logic outside of standard JSON configuration generation.

        ### JSON STRUCTURE:
        {
          "name": "Form Name",
          "description": "Form Description",
          "fields": [
            {
              "fieldKey": "unique_snake_case_key",
              "label": "Field Label",
              "fieldType": "type",
              "required": true/false,
              "isCalculated": true/false,
              "formulaExpression": "optional formula",
              "validationJson": "{\\"minLength\\":3}",
              "rulesJson": "{\\"combinator\\":\\"AND\\",\\"conditions\\":[...],\\"actions\\":[...]}",
              "uiConfigJson": "{\\"options\\":[{\\"label\\":\\"Option A\\",\\"value\\":\\"Option A\\"}]}",
              "fieldOrder": 0
            }
          ]
        }

        ### SUPPORTED FIELD TYPES:
        - Input: text, number, date, time, date_time, boolean (use for single checkbox/toggle).
        - Selection (CRITICAL: MUST ALWAYS INCLUDE OPTIONS IN uiConfigJson): dropdown, radio, multiple_choice.
        - Advanced: linear_scale, star_rating, file, multiple_choice_grid, checkbox_grid.
        - Layout: section_header, description_block, page_break.

        ### 1. ADVANCED VALIDATIONS (validationJson)
        Provide these keys inside the validationJson string for the following types:
        - text: minLength, maxLength, emailFormat (bool), urlFormat (bool), alphabetOnly (bool), alphanumericOnly (bool), customRegex (string), message (custom error).
        - number: minValue, maxValue, integerOnly (bool), positiveOnly (bool), decimalAllowed (bool), maxDecimalPlaces, currencyFormat (bool).
        - date/time: minDate, maxDate, pastOnly (bool), futureOnly (bool), age18Plus (int), customFormat ("DD/MM/YYYY").
        - file: allowedExtensions (".pdf,.jpg"), maxFileSize (MB), singleOrMultiple ("single"|"multiple").
        - selection: requireSelection (bool).

        ### 2. SELECTION OPTIONS (uiConfigJson)
        For dropdown, radio, and multiple_choice fields, you MUST generate the options list in `uiConfigJson`.
        - Format: `"{\\"options\\":[{\\"label\\":\\"Male\\",\\"value\\":\\"Male\\"},{\\"label\\":\\"Female\\",\\"value\\":\\"Female\\"}]}"`

        ### 3. CALCULATED FIELDS (isCalculated & formulaExpression)
        Set "isCalculated": true and provide a "formulaExpression".
        - Formula syntax: Standard arithmetic, string concatenation, and comparison. Use field keys directly: `field_a + field_b`.
        - Examples: `price * quantity`, `first_name + " " + last_name`.
        - Make calculated fields "readOnly": true.

        ### 4. RULE ENGINE (rulesJson)
        Used for conditional logic and dynamic actions.
        Structure: {"combinator":"AND"|"OR", "conditions":[{"fieldKey":"src","operator":"equals","value":"xyz"}], "actions":[{"type":"show"}]}
        - Operators: equals, not equals, contains, contains, starts with, ends with, is empty, is not empty, >, >=, <, <=, between, in list, before, after, is true, is false.
        - Action Types: show, hide, makeRequired, makeOptional, enable, disable, setValue, clearValue, setLabel.

        ### INTEGRITY RULES:
        1. Every 'fieldKey' must be unique, snake_case, and start with a letter.
        2. RESERVED KEYWORDS: Do NOT use these as 'fieldKey': id, user, role, table, status, created_at, updated_at, is_draft, deleted_at, key, primary, view, constraint, group, order, limit, offset, union, distinct, column, index, trigger, grant, revoke, select, insert, update, delete, from, where, join.
        3. Logic references in 'rulesJson' and 'formulaExpression' MUST strictly exist in the field list.
        4. Focus exclusively on complex form schema generation. DO NOT provide dummy system data.
        """;

    public Map<String, Object> chat(String prompt, List<Map<String, String>> history) {
        try {
            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", SYSTEM_PROMPT));
            
            // Add history
            if (history != null) {
                messages.addAll(history);
            }
            
            // Add user prompt
            messages.add(Map.of("role", "user", "content", prompt));

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("temperature", 0.7);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(apiUrl, entity, String.class);

            if (response.getStatusCode() == HttpStatus.OK) {
                JsonNode root = objectMapper.readTree(response.getBody());
                String aiResponse = root.path("choices").path(0).path("message").path("content").asText();
                
                return processAiResponse(aiResponse);
            } else {
                throw new RuntimeException("AI API error: " + response.getStatusCode());
            }
        } catch (Exception e) {
            log.error("Error in AI Architect Service", e);
            return Map.of("error", e.getMessage(), "conversational", "I encountered an error while architecting your form. Please try again.");
        }
    }

    private Map<String, Object> processAiResponse(String content) {
        Map<String, Object> result = new HashMap<>();
        result.put("rawResponse", content);

        // Extract JSON block
        Pattern pattern = Pattern.compile("```json\\s*(\\{[\\s\\S]*?\\})\\s*```");
        Matcher matcher = pattern.matcher(content);
        
        String jsonStr = null;
        if (matcher.find()) {
            jsonStr = matcher.group(1);
        } else {
            // Fallback: try to find anything that looks like JSON
            Pattern fallbackPattern = Pattern.compile("(\\{[\\s\\S]*?\\})");
            Matcher fallbackMatcher = fallbackPattern.matcher(content);
            while (fallbackMatcher.find()) {
                String potentialJson = fallbackMatcher.group(1);
                if (potentialJson.contains("\"fields\"") || potentialJson.contains("\"name\"")) {
                    jsonStr = potentialJson;
                    break;
                }
            }
        }

        if (jsonStr != null) {
            try {
                JsonNode schema = objectMapper.readTree(jsonStr);
                result.put("schema", schema);
            } catch (Exception e) {
                log.warn("Extracted JSON is invalid", e);
            }
        }

        // Conversational part (text before the code block)
        String conversational = content.split("```")[0].trim();
        result.put("conversational", conversational);

        return result;
    }
}
