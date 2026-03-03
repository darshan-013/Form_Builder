package com.formbuilder.controller;

import com.formbuilder.dto.SubmissionRequest;
import com.formbuilder.service.SubmissionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/forms")
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;

    private static final String UPLOAD_DIR = "uploads";

    /**
     * POST /api/forms/{id}/submit
     *
     * Flow:
     *  1. Parse multipart or JSON body into data map + files map.
     *  2. Run full validation (throws 400 with fieldKey→message if fails).
     *  3. Save uploaded files to disk (only if validation passed).
     *  4. Replace file field values with saved filenames.
     *  5. INSERT validated data into the form's dynamic table.
     */
    @PostMapping("/{id}/submit")
    public ResponseEntity<?> submit(
            @PathVariable UUID id,
            HttpServletRequest request) {

        Map<String, Object> data  = new HashMap<>();
        Map<String, MultipartFile> files = new HashMap<>();

        try {
            // ── 1. Parse request body ──────────────────────────────────────
            String contentType = request.getContentType();
            if (contentType != null && contentType.contains("multipart/form-data")) {
                if (request instanceof MultipartHttpServletRequest multipart) {
                    multipart.getParameterMap().forEach((key, values) -> {
                        if (values != null && values.length > 0) data.put(key, values[0]);
                    });
                    multipart.getFileMap().forEach((key, file) -> {
                        if (file != null && !file.isEmpty()) files.put(key, file);
                    });
                }
            } else {
                // JSON body: { "data": { fieldKey: value, ... } }
                StringBuilder sb = new StringBuilder();
                String line;
                try (var reader = request.getReader()) {
                    while ((line = reader.readLine()) != null) sb.append(line);
                }
                if (!sb.isEmpty()) {
                    com.fasterxml.jackson.databind.ObjectMapper mapper =
                            new com.fasterxml.jackson.databind.ObjectMapper();
                    SubmissionRequest req = mapper.readValue(sb.toString(), SubmissionRequest.class);
                    if (req != null && req.getData() != null) data.putAll(req.getData());
                }
            }

            log.info("Submitting form {} — {} data fields, {} files", id, data.size(), files.size());

            // ── 2. Validate (throws ValidationException on failure) ────────
            // Files are passed as MultipartFile so ValidationService can check
            // extension, mime, size, and dimensions BEFORE writing to disk.
            submissionService.validate(id, data, files);

            // ── 3. Save files to disk (validation passed) ──────────────────
            for (Map.Entry<String, MultipartFile> entry : files.entrySet()) {
                String savedName = saveFile(entry.getValue());
                data.put(entry.getKey(), savedName);   // replace value with filename
            }

            // ── 4. INSERT into dynamic table ───────────────────────────────
            submissionService.insert(id, data);

            return ResponseEntity.ok(Map.of("message", "Form submitted successfully"));

        } catch (IOException e) {
            log.error("Error processing submission request", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to process request: " + e.getMessage()));
        }
        // ValidationException (RuntimeException) propagates naturally to GlobalExceptionHandler
    }

    private String saveFile(MultipartFile file) throws IOException {
        Path uploadPath = Paths.get(UPLOAD_DIR);
        if (!Files.exists(uploadPath)) Files.createDirectories(uploadPath);

        String original  = file.getOriginalFilename();
        String extension = (original != null && original.contains("."))
                ? original.substring(original.lastIndexOf('.')) : "";
        String unique    = UUID.randomUUID() + extension;

        Files.copy(file.getInputStream(), uploadPath.resolve(unique));
        log.info("Saved file: {} (original: {})", unique, original);
        return unique;
    }

    /**
     * GET /api/forms/{id}/submissions  — admin only
     */
    @GetMapping("/{id}/submissions")
    public ResponseEntity<List<Map<String, Object>>> getSubmissions(@PathVariable UUID id) {
        return ResponseEntity.ok(submissionService.getSubmissions(id));
    }
}
