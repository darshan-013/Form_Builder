package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.service.AiArchitectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping(AppConstants.API_BASE + "/ai")
@RequiredArgsConstructor
public class AiArchitectController {

    private final AiArchitectService aiArchitectService;

    /**
     * Chat with the Form Architect LLM.
     * Request body: { prompt: string, history: [ { role: 'user'|'assistant', content: string } ] }
     */
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, Object> request) {
        String prompt = (String) request.get("prompt");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> history = (List<Map<String, String>>) request.get("history");

        if (prompt == null || prompt.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Prompt is required."));
        }

        log.info("AI Architect request: {}", prompt);
        Map<String, Object> result = aiArchitectService.chat(prompt, history);
        
        return ResponseEntity.ok(result);
    }
}
