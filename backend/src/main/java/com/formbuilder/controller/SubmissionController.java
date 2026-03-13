package com.formbuilder.controller;

import com.formbuilder.entity.FormEntity;
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
@RequestMapping("/api/forms")
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;
    private final FormService formService;
    private final UserRoleService userRoleService;
    private final AuditLogService auditLogService;

    private static final String UPLOAD_DIR = "uploads";

    /**
     * Check form is PUBLISHED, not expired, and enforce single-submission if
     * configured
     */
    private ResponseEntity<?> checkPublishedAndSession(UUID id, HttpSession session) {
        FormEntity form = formService.getFormById(id);
        if (form.getStatus() != FormEntity.FormStatus.PUBLISHED) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "This form is not accepting submissions right now.", "status", form.getStatus().name()));
        }
        // Expiry check
        if (form.getExpiresAt() != null && LocalDateTime.now().isAfter(form.getExpiresAt())) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(Map.of("error", "This form has expired and is no longer accepting submissions."));
        }
        if (!form.isAllowMultipleSubmissions()) {
            String sessionKey = "submitted_" + id;
            if (session.getAttribute(sessionKey) != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "You have already submitted this form. Only one submission is allowed."));
            }
            session.setAttribute(sessionKey, Boolean.TRUE);
        }
        return null;
    }

    /**
     * POST /api/forms/{id}/submit — JSON body
     */
    @PostMapping(value = "/{id}/submit", consumes = { "application/json", "application/json;charset=UTF-8" })
    public ResponseEntity<?> submitJson(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> rawBody,
            HttpSession session,
            Authentication auth) {

        ResponseEntity<?> guard = checkPublishedAndSession(id, session);
        if (guard != null)
            return guard;

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

        log.info("JSON submit — form={} keys={}", id, data.keySet());
        log.debug("JSON submit data: {}", data);

        submissionService.validate(id, data, null);
        submissionService.finalizeSubmission(id, auth != null ? auth.getName() : null, data);

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

        return ResponseEntity.ok(Map.of("message", "Form submitted successfully"));
    }

    /**
     * GET /api/forms/{id}/draft
     */
    @GetMapping("/{id}/draft")
    public ResponseEntity<?> getDraft(@PathVariable UUID id, Authentication auth) {
        if (auth == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Map<String, Object> draft = submissionService.findDraft(id, auth.getName());
        return ResponseEntity.ok(draft != null ? draft : Map.of());
    }

    /**
     * POST /api/forms/{id}/draft
     */
    @PostMapping("/{id}/draft")
    public ResponseEntity<?> saveDraft(
            @PathVariable UUID id,
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

        submissionService.saveDraft(id, auth.getName(), data);
        return ResponseEntity.ok(Map.of("message", "Draft saved successfully", "timestamp", LocalDateTime.now()));
    }

    /**
     * POST /api/forms/{id}/submit — multipart/form-data (file uploads)
     */
    @PostMapping(value = "/{id}/submit", consumes = "multipart/form-data")
    public ResponseEntity<?> submitMultipart(
            @PathVariable UUID id,
            MultipartHttpServletRequest multipart,
            HttpSession session,
            Authentication auth) {

        ResponseEntity<?> guard = checkPublishedAndSession(id, session);
        if (guard != null)
            return guard;

        Map<String, Object> data = new HashMap<>();
        Map<String, MultipartFile> files = new HashMap<>();

        try {
            multipart.getParameterMap().forEach((key, values) -> {
                if (values != null && values.length > 0)
                    data.put(key, values[0]);
            });
            multipart.getMultiFileMap().forEach((key, fileList) -> {
                if (fileList != null && !fileList.isEmpty()) {
                    MultipartFile first = fileList.get(0);
                    if (first != null && !first.isEmpty())
                        files.put(key, first);
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
            for (Map.Entry<String, MultipartFile> e : files.entrySet()) {
                if (!savedKeys.contains(e.getKey()))
                    data.put(e.getKey(), saveFile(e.getValue()));
            }

            submissionService.finalizeSubmission(id, auth != null ? auth.getName() : null, data);

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

            return ResponseEntity.ok(Map.of("message", "Form submitted successfully"));

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

    /** Check if the authenticated user has Admin role. */
    private boolean isAdmin(Authentication auth) {
        return userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
    }

    @GetMapping("/{id}/submissions")
    public ResponseEntity<List<Map<String, Object>>> getSubmissions(
            @PathVariable UUID id, Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        return ResponseEntity.ok(submissionService.getSubmissions(id));
    }

    @GetMapping("/{id}/submissions/{submissionId}")
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

    @DeleteMapping("/{id}/submissions/{submissionId}")
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

    @PutMapping("/{id}/submissions/{submissionId}")
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

    // ── Trash Bin Endpoints ────────────────────────────────────────────────

    /** List all soft-deleted submissions for a form (the trash). */
    @GetMapping("/{id}/submissions/trash")
    public ResponseEntity<?> getTrashSubmissions(
            @PathVariable UUID id,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        return ResponseEntity.ok(submissionService.getTrashSubmissions(id));
    }

    /** Restore a submission from trash back to active. */
    @PostMapping("/{id}/submissions/{submissionId}/restore")
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

    /** Permanently delete a submission that is in trash. */
    @DeleteMapping("/{id}/submissions/{submissionId}/permanent")
    public ResponseEntity<?> permanentDeleteSubmission(
            @PathVariable UUID id,
            @PathVariable UUID submissionId,
            Authentication auth) {
        formService.getFormForAction(id, auth.getName(), isAdmin(auth));
        try {
            submissionService.permanentDeleteSubmission(id, submissionId);
            return ResponseEntity.ok(Map.of("message", "Submission permanently deleted"));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
