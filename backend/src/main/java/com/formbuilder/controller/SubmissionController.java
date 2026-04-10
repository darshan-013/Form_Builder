package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormVersionEntity;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.AuditLogService;
import com.formbuilder.service.FormService;
import com.formbuilder.service.SubmissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.*;



@Slf4j
@RestController
@RequestMapping(AppConstants.API_RUNTIME)
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;
    private final FormService formService;
    private final UserRoleService userRoleService;
    private final AuditLogService auditLogService;

    private static final String UPLOAD_DIR = "uploads";

    /**
     * Check form is PUBLISHED, not expired, and enforce single-submission if configured.
     * Throws typed exceptions to be handled by GlobalExceptionHandler for structured JSON.
     */
    private void validateFormAccess(UUID id, HttpSession session) {
        FormEntity form = formService.getFormById(id);
        
        
        if (form.getStatus() != FormEntity.FormStatus.PUBLISHED) {
            throw new IllegalStateException("This form is not accepting submissions right now.");
        }
        
        // Expiry check
        if (form.getExpiresAt() != null && LocalDateTime.now().isAfter(form.getExpiresAt())) {
            throw new IllegalStateException("This form has expired and is no longer accepting submissions.");
        }
        
        if (!form.isAllowMultipleSubmissions()) {
            String sessionKey = "submitted_" + id;
            if (session.getAttribute(sessionKey) != null) {
                throw new IllegalStateException("You have already submitted this form. Only one submission is allowed.");
            }
        }
    }

    /**
     * POST /api/v1/runtime/forms/{idOrCode}/submit — JSON body
     */
    @PostMapping(value = {AppConstants.RUNTIME_SUBMIT, AppConstants.RUNTIME_SUBMIT_V2}, consumes = { "application/json", "application/json;charset=UTF-8" })
    public ResponseEntity<?> submitJson(
            @PathVariable(name = "idOrCode") String idOrCode,
            @RequestBody(required = false) Map<String, Object> rawBody,
            HttpSession session,
            Authentication auth) {

        UUID id = resolveId(idOrCode);
        validateFormAccess(id, session);
        Map<String, Object> data = new HashMap<>();
        if (rawBody != null) {
            Object inner = rawBody.get("data");
            if (inner instanceof Map) {
                // Flatten the 'data' block sent by the frontend
                @SuppressWarnings("unchecked")
                Map<String, Object> wrapped = (Map<String, Object>) inner;
                data.putAll(wrapped);
                // Merge in any other top-level keys (like formVersionId)
                rawBody.forEach((k, v) -> {
                    if (!"data".equals(k)) data.put(k, v);
                });
            } else {
                data.putAll(rawBody);
            }
        }

        log.info("JSON submit — form={} keys={}", id, data.keySet());
        log.debug("JSON submit data: {}", data);

        // Metadata extraction
        UUID submissionId = getUuid(data, "submissionId", "id");
        data.remove("submissionId");
        data.remove("id");
        
        // FormVersionId tracking if provided (currently ignored; server resolves active version)
        data.remove("formVersionId");

        if (submissionId == null) {
            // Path A: New submission. Version is resolved authoritatively in saveDraft
            submissionId = submissionService.saveDraft(id, auth != null ? auth.getName() : null, data, null);
        }

        submissionService.validate(id, data, null);
        submissionService.finalizeSubmission(submissionId, auth != null ? auth.getName() : null, data);

        FormEntity form = formService.getFormById(id);
        String username = auth != null ? auth.getName() : "anonymous";
        auditLogService.logEvent(
                "SUBMIT_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                username,
                "FORM",
                id.toString(),
                "User '" + username + "' submitted form '" + form.getName() + "'.",
                Map.of("formName", form.getName()),
                null,
                null,
                null,
                null
        );

        return ResponseEntity.ok(Map.of(
                "submissionId", submissionId,
                "status", "SUBMITTED"));
    }

    /**
     * GET /api/v1/runtime/forms/{idOrCode}/draft
     */
    @GetMapping({AppConstants.RUNTIME_DRAFT, AppConstants.RUNTIME_DRAFT_V2})
    public ResponseEntity<?> getDraft(@PathVariable(name = "idOrCode") String idOrCode, Authentication auth) {
        if (auth == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        UUID id = resolveId(idOrCode);
        Map<String, Object> draft = submissionService.findDraft(id, auth.getName());
        return ResponseEntity.ok(draft != null ? draft : Map.of());
    }

    /**
     * POST /api/v1/runtime/forms/{id}/draft
     */
    @PostMapping({AppConstants.RUNTIME_DRAFT, AppConstants.RUNTIME_DRAFT_V2})
    public ResponseEntity<?> saveDraft(
            @PathVariable(name = "idOrCode") String idOrCode,
            @RequestBody Map<String, Object> rawBody,
            Authentication auth) {
        if (auth == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Map<String, Object> data = new HashMap<>();
        if (rawBody != null) {
            Object inner = rawBody.get("data");
            if (rawBody.size() == 1 && inner instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> wrapped = (Map<String, Object>) inner;
                data.putAll(wrapped);
            } else {
                data.putAll(rawBody);
            }
        }

        UUID submissionId = getUuid(data, "id", "submissionId");
        data.remove("id");
        data.remove("submissionId");

        UUID id = resolveId(idOrCode);
        UUID savedId = submissionService.saveDraft(id, auth.getName(), data, submissionId);
        return ResponseEntity.ok(Map.of(
                "submissionId", savedId,
                "status", "DRAFT"));
    }

    /**
     * POST /api/v1/runtime/forms/{idOrCode}/submit — multipart/form-data (file uploads)
     */
    @PostMapping(value = {AppConstants.RUNTIME_SUBMIT, AppConstants.RUNTIME_SUBMIT_V2}, consumes = "multipart/form-data")
    public ResponseEntity<?> submitMultipart(
            @PathVariable(name = "idOrCode") String idOrCode,
            MultipartHttpServletRequest multipart,
            HttpSession session,
            Authentication auth) {

        UUID id = resolveId(idOrCode);
        validateFormAccess(id, session);

        Map<String, Object> data = new HashMap<>();
        Map<String, List<MultipartFile>> files = new HashMap<>();

        try {
            multipart.getParameterMap().forEach((key, values) -> {
                if (values != null && values.length > 0)
                    data.put(key, values[0]);
            });
            multipart.getMultiFileMap().forEach((key, fileList) -> {
                if (fileList != null && !fileList.isEmpty()) {
                    files.put(key, fileList);
                    data.put("__files__" + key, fileList);
                }
            });

            log.info("Multipart submit — form={} fields={} files={}", id, data.size(), files.size());

            submissionService.validate(id, data, files);

            Set<String> savedKeys = new HashSet<>();
            for (Map.Entry<String, Object> entry : new HashMap<>(data).entrySet()) {
                String key = entry.getKey();
                if (!key.startsWith("__files__"))
                    continue;
                String fieldKey = key.substring("__files__".length());
                savedKeys.add(fieldKey);
                @SuppressWarnings("unchecked")
                List<MultipartFile> fileList = (List<MultipartFile>) entry.getValue();
                List<String> savedNames = new ArrayList<>();
                for (MultipartFile f : fileList) {
                    if (f != null && !f.isEmpty())
                        savedNames.add(saveFile(f));
                }
                if (!savedNames.isEmpty())
                    data.put(fieldKey, String.join(",", savedNames));
                data.remove(key);
            }
            for (Map.Entry<String, List<MultipartFile>> e : files.entrySet()) {
                if (!savedKeys.contains(e.getKey())) {
                    List<String> savedNames = new ArrayList<>();
                    for (MultipartFile f : e.getValue()) {
                        if (f != null && !f.isEmpty())
                            savedNames.add(saveFile(f));
                    }
                    if (!savedNames.isEmpty())
                        data.put(e.getKey(), String.join(",", savedNames));
                }
            }

            // Metadata extraction
            UUID submissionId = getUuid(data, "submissionId", "id");
            data.remove("submissionId");
            data.remove("id");
            
            if (submissionId == null) {
                submissionId = submissionService.saveDraft(id, auth != null ? auth.getName() : null, data, null);
            }

            submissionService.finalizeSubmission(submissionId, auth != null ? auth.getName() : null, data);

            FormEntity form = formService.getFormById(id);
            String username = auth != null ? auth.getName() : "anonymous";
            auditLogService.logEvent(
                    "SUBMIT_FORM",
                    auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                    username,
                    "FORM",
                    id.toString(),
                    "User '" + username + "' submitted form '" + form.getName() + "'.",
                    Map.of("formName", form.getName()),
                    null,
                    null,
                    null,
                    null
            );

            return ResponseEntity.ok(Map.of(
                    "submissionId", submissionId,
                    "status", "SUBMITTED"));

        } catch (IOException e) {
            log.error("File save error for form {}", id, e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save file: " + e.getMessage()));
        }
    }

    private String saveFile(MultipartFile file) throws IOException {
        Path uploadPath = Paths.get(UPLOAD_DIR);
        if (!Files.exists(uploadPath))
            Files.createDirectories(uploadPath);
        String original = file.getOriginalFilename();
        String extension = (original != null && original.contains("."))
                ? original.substring(original.lastIndexOf('.'))
                : "";
        String unique = UUID.randomUUID() + extension;
        Files.copy(file.getInputStream(), uploadPath.resolve(unique));
        log.info("Saved file: {} (original: {})", unique, original);
        return unique;
    }

    /** Check if the authenticated user has Admin role or Role Administrator role. */
    private boolean isAdmin(Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        return roles.contains("Admin") || roles.contains("Role Administrator");
    }

    @GetMapping(AppConstants.BY_ID_SUBMISSIONS)
    public ResponseEntity<List<Map<String, Object>>> getSubmissions(
            @PathVariable UUID id,
            @RequestParam(required = false, defaultValue = "true") boolean activeOnly,
            @RequestParam(required = false) UUID versionId,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        return ResponseEntity.ok(submissionService.getSubmissions(id, activeOnly, versionId));
    }

    @GetMapping(AppConstants.RUNTIME_SUBMISSIONS_TRASH)
    public ResponseEntity<List<Map<String, Object>>> getDeletedSubmissions(
            @PathVariable UUID id,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        return ResponseEntity.ok(submissionService.getDeletedSubmissions(id));
    }

    @PostMapping(AppConstants.RUNTIME_SUBMISSION_RESTORE)
    public ResponseEntity<?> restoreSubmission(
            @PathVariable UUID id,
            @PathVariable UUID submissionId,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        try {
            submissionService.restoreSubmission(id, submissionId);
            return ResponseEntity.ok(Map.of("message", "Submission restored successfully"));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping(AppConstants.RUNTIME_SUBMISSIONS_TRASH)
    public ResponseEntity<Void> purgeDeletedSubmissions(
            @PathVariable UUID id,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        submissionService.purgeDeletedSubmissions(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping(AppConstants.BY_ID_SUBMISSION_BY_ID)
    public ResponseEntity<?> getSubmission(
            @PathVariable UUID id,
            @PathVariable UUID submissionId,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        try {
            return ResponseEntity.ok(submissionService.getSubmission(id, submissionId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping(AppConstants.BY_ID_SUBMISSION_BY_ID)
    public ResponseEntity<?> deleteSubmission(
            @PathVariable UUID id,
            @PathVariable UUID submissionId,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        try {
            submissionService.deleteSubmission(id, submissionId);
            return ResponseEntity.ok(Map.of("message", "Submission deleted successfully"));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping(AppConstants.BY_ID_SUBMISSION_BY_ID)
    public ResponseEntity<?> updateSubmission(
            @PathVariable UUID id,
            @PathVariable UUID submissionId,
            @RequestBody Map<String, Object> data,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        submissionService.validateUpdate(id, data);
        try {
            Map<String, Object> updated = submissionService.updateSubmission(id, submissionId, data);
            return ResponseEntity.ok(updated);
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Runtime form fetch (v1 standard)
     */
    @GetMapping(AppConstants.RUNTIME_FORM_RENDER)
    public ResponseEntity<?> getRuntimeForm(@PathVariable String idOrCode) {
        UUID id = resolveId(idOrCode);
        FormEntity form = formService.getFormById(id);
        FormVersionEntity version = form.getPublishedVersion()
                .orElseThrow(() -> new IllegalStateException("Form not published"));
        
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("formId", form.getId());
        response.put("formVersionId", version.getId());
        response.put("definitionJson", version.getDefinitionJson());
        response.put("fields", version.getFields());
        response.put("validations", version.getCustomValidationRules().stream().map(rule -> {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("validationId", rule.getId());
            v.put("fieldKey", rule.getFieldKey());
            v.put("scope", rule.getScope());
            v.put("validationType", rule.getValidationType());
            v.put("expression", rule.getExpression());
            v.put("errorMessage", rule.getErrorMessage());
            v.put("executionOrder", rule.getExecutionOrder());
            return v;
        }).toList());

        return ResponseEntity.ok(response);
    }

    private UUID getUuid(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object val = map.get(key);
            if (val != null && !val.toString().isBlank() && !"null".equalsIgnoreCase(val.toString())) {
                try {
                    return UUID.fromString(val.toString());
                } catch (IllegalArgumentException e) {
                    log.warn("Invalid UUID format for key {}: {}", key, val);
                }
            }
        }
        return null;
    }

    private UUID resolveId(String idOrCode) {
        try {
            return UUID.fromString(idOrCode);
        } catch (IllegalArgumentException e) {
            return formService.getFormByCode(idOrCode).getId();
        }
    }
}
