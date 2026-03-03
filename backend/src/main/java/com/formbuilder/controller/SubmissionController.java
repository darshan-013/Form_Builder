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
     * Public endpoint — no authentication required.
     * Validates and inserts into the form's dedicated table.
     * Supports both JSON and multipart/form-data for file uploads.
     */
    @PostMapping("/{id}/submit")
    public ResponseEntity<?> submit(
            @PathVariable UUID id,
            HttpServletRequest request) {

        Map<String, Object> data = new HashMap<>();
        Map<String, MultipartFile> files = new HashMap<>();

        try {
            // Check if this is a multipart request
            if (request.getContentType() != null && request.getContentType().contains("multipart/form-data")) {
                log.info("Handling multipart/form-data request");
                // Handle multipart form data
                if (request instanceof MultipartHttpServletRequest multipartRequest) {
                    // Get all regular form fields
                    Map<String, String[]> paramMap = multipartRequest.getParameterMap();
                    for (Map.Entry<String, String[]> entry : paramMap.entrySet()) {
                        if (entry.getValue() != null && entry.getValue().length > 0) {
                            data.put(entry.getKey(), entry.getValue()[0]);
                        }
                    }

                    // Handle file uploads - store files for validation
                    Map<String, MultipartFile> fileMap = multipartRequest.getFileMap();
                    for (Map.Entry<String, MultipartFile> entry : fileMap.entrySet()) {
                        MultipartFile file = entry.getValue();
                        if (file != null && !file.isEmpty()) {
                            files.put(entry.getKey(), file);
                        }
                    }
                }
            } else {
                // Handle JSON request body
                log.info("Handling JSON request");
                java.io.BufferedReader reader = request.getReader();
                StringBuilder jsonBuilder = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    jsonBuilder.append(line);
                }
                String json = jsonBuilder.toString();

                if (!json.isEmpty()) {
                    // Parse JSON manually
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    SubmissionRequest req = mapper.readValue(json, SubmissionRequest.class);
                    if (req != null && req.getData() != null) {
                        data = req.getData();
                    }
                }
            }

            if (data.isEmpty() && files.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "No form data provided"));
            }

            log.info("Submitting form {} with data: {} and {} files", id, data, files.size());

            // Save files after validation passes
            for (Map.Entry<String, MultipartFile> entry : files.entrySet()) {
                String savedFilename = saveFile(entry.getValue());
                data.put(entry.getKey(), savedFilename);
            }

            // Submit with both data and files for validation
            submissionService.submit(id, data, files);
            return ResponseEntity.ok(Map.of("message", "Form submitted successfully"));

        } catch (IOException e) {
            log.error("Error processing request", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to process request: " + e.getMessage()));
        }
    }

    private String saveFile(MultipartFile file) throws IOException {
        Path uploadPath = Paths.get(UPLOAD_DIR);
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }

        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        String uniqueFilename = UUID.randomUUID() + extension;

        Path filePath = uploadPath.resolve(uniqueFilename);
        Files.copy(file.getInputStream(), filePath);

        log.info("File saved: {} (original: {})", uniqueFilename, originalFilename);
        return uniqueFilename;
    }

    /**
     * GET /api/forms/{id}/submissions
     * Admin only — returns all rows from the form's dedicated table.
     */
    @GetMapping("/{id}/submissions")
    public ResponseEntity<List<Map<String, Object>>> getSubmissions(@PathVariable UUID id) {
        return ResponseEntity.ok(submissionService.getSubmissions(id));
    }
}
