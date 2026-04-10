package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.dto.FormDTO;
import com.formbuilder.dto.FormFieldDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.entity.FormGroupEntity;
import com.formbuilder.entity.FormVersionEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.AuditLogService;
import com.formbuilder.service.FormRenderService;
import com.formbuilder.service.FormService;
import com.formbuilder.service.SubmissionService;
import com.formbuilder.workflow.entity.WorkflowInstance;
import com.formbuilder.workflow.entity.WorkflowInstanceStatus;
import com.formbuilder.workflow.service.WorkflowService;
import com.formbuilder.workflow.entity.WorkflowStep;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.*;
import java.util.stream.Collectors;

/**
 * REST Controller for Form CRUD operations.
 * Now uses role-based form visibility via UserRoleService.
 */
@RestController
@RequestMapping(AppConstants.API_FORMS)
@RequiredArgsConstructor
public class FormController {

    private final FormService formService;
    private final FormRenderService formRenderService;
    private final UserRoleService userRoleService;
    private final AuditLogService auditLogService;
    private final WorkflowService workflowService;
    private final SubmissionService submissionService;

    private static final String ROLE_ADMIN = "Admin";
    private static final String ROLE_ROLE_ADMIN = "Role Administrator";

    /** List only the forms that belong to the authenticated user. */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAll(Authentication auth) {
        String username = auth.getName();
        Set<String> roleNames = userRoleService.getUserRoleNames(username);
        List<FormEntity> forms = formService.getFormsForRole(username, roleNames);

        List<Map<String, Object>> responseList = forms.stream().map(f -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("formId", f.getId());
            map.put("id", f.getId());
            map.put("name", f.getName());
            map.put("code", f.getCode());
            map.put("description", f.getDescription());
            map.put("status", f.getStatus().name());
            map.put("activeVersion", f.getActiveVersion().map(FormVersionEntity::getVersionNumber).orElse(null));
            map.put("createdBy", f.getCreatedBy());
            map.put("createdAt", f.getCreatedAt());
            map.put("updatedAt", f.getUpdatedAt());
            map.put("isOwner", f.getCreatedBy().equals(username));

            // Workflow status
            WorkflowInstance wf = workflowService.getWorkflowForForm(f.getId());
            map.put("workflow", wf != null ? toWorkflowSummary(wf) : null);

            // Permissions for UI
            map.put("canEdit", formService.canEdit(f, username, roleNames));
            map.put("canDelete", formService.canDelete(f, username, roleNames));
            map.put("canPublish", formService.canPublish(f, username, roleNames));
            map.put("canViewSubmissions", formService.canViewSubmissions(f, username, roleNames));

            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(responseList);
    }

    @GetMapping(AppConstants.FORM_STATS)
    public ResponseEntity<Map<String, Object>> getDashboardStats(Authentication auth) {
        String username = auth.getName();
        Set<String> roleNames = userRoleService.getUserRoleNames(username);
        List<FormEntity> forms = formService.getFormsForRole(username, roleNames);

        long totalForms = forms.size();
        long publishedCount = forms.stream().filter(f -> f.getStatus() == FormEntity.FormStatus.PUBLISHED).count();
        long draftCount = forms.stream().filter(f -> f.getStatus() == FormEntity.FormStatus.DRAFT).count();

        long totalSubmissions = 0;
        for (FormEntity f : forms) {
            totalSubmissions += submissionService.getSubmissionCount(f.getId());
        }

        // Recently modified: top 5 unique modified dates
        List<Map<String, Object>> recentForms = forms.stream()
                .sorted(Comparator.comparing(FormEntity::getUpdatedAt).reversed())
                .limit(5)
                .map(f -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", f.getId());
                    m.put("name", f.getName());
                    m.put("status", f.getStatus().name());
                    m.put("updatedAt", f.getUpdatedAt());
                    m.put("createdAt", f.getCreatedAt()); // Also useful
                    return m;
                })
                .collect(Collectors.toList());

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalForms", totalForms);
        stats.put("publishedCount", publishedCount);
        stats.put("draftCount", draftCount);
        stats.put("totalSubmissions", totalSubmissions);
        stats.put("recentForms", recentForms);

        return ResponseEntity.ok(stats);
    }

    @GetMapping(AppConstants.FORM_CHECK_CODE)
    public ResponseEntity<Map<String, Boolean>> checkCodeUniqueness(@RequestParam String code) {
        boolean isUnique = formService.isCodeUnique(code);
        return ResponseEntity.ok(Map.of("isUnique", isUnique));
    }


    private Map<String, Object> toWorkflowSummary(WorkflowInstance wf) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", wf.getId());
        map.put("status", wf.getStatus().name());
        map.put("currentStepIndex", wf.getCurrentStepIndex());
        map.put("totalSteps", wf.getTotalSteps());

        List<WorkflowStep> ordered = wf.getSteps().stream()
                .sorted(Comparator.comparing(WorkflowStep::getStepIndex))
                .toList();

        List<String> flowChain = ordered.stream().map(step -> {
            String name = step.getApprover().getName();
            return (name != null && !name.isBlank()) ? name : step.getApprover().getUsername();
        }).toList();
        map.put("flowChain", flowChain);

        String currentFlowView = ordered.stream().map(step -> {
            String name = step.getApprover().getName();
            String label = (name != null && !name.isBlank()) ? name : step.getApprover().getUsername();
            if (wf.getStatus() == WorkflowInstanceStatus.ACTIVE
                    && Objects.equals(step.getStepIndex(), wf.getCurrentStepIndex())) {
                return "[" + label + "]";
            }
            return label;
        }).collect(Collectors.joining(" -> "));
        map.put("currentFlowView", currentFlowView);

        // Add currentApproverId for frontend redirection logic
        WorkflowStep currentStep = ordered.stream()
                .filter(s -> Objects.equals(s.getStepIndex(), wf.getCurrentStepIndex()))
                .findFirst()
                .orElse(null);
        if (currentStep != null) {
            map.put("currentApproverId", currentStep.getApprover().getId());
        }

        return map;
    }

    /** Update form — owner or Admin can edit. */
    @PutMapping(AppConstants.FORM_BY_ID)
    public ResponseEntity<FormEntity> updateForm(
            @PathVariable UUID id,
            @RequestParam(required = false) UUID versionId,
            @Valid @RequestBody FormDTO dto,
            Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (roles.contains(ROLE_ROLE_ADMIN)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (roles.contains("Viewer") && !roles.contains(ROLE_ADMIN)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        boolean isBuilder = roles.contains("Builder");
        String username = auth.getName();
        FormEntity updated = formService.updateForm(id, dto, username, isAdmin, isBuilder, versionId);
        auditLogService.logEvent(
                "UPDATE_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                username,
                "FORM",
                updated.getId().toString(),
                "User '" + username + "' updated form '" + updated.getName() + "'.",
                Map.of("formName", updated.getName()),
                null,
                null,
                null,
                null);
        return ResponseEntity.ok(updated);
    }
    /** Single form with static fields bundled — used by builder edit page. */
    @GetMapping(AppConstants.FORM_BY_ID)
    public ResponseEntity<Map<String, Object>> getById(
            @PathVariable UUID id,
            @RequestParam(required = false) UUID versionId,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        FormEntity form = formService.getFormForAction(id, auth.getName(), isAdmin);
        
        FormVersionEntity version;
        if (versionId != null) {
            version = form.getVersions().stream()
                    .filter(v -> v.getId().equals(versionId))
                    .findFirst()
                    .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));
        } else {
            version = form.getDraftVersion()
                    .orElseGet(() -> form.getPublishedVersion()
                            .orElseThrow(() -> new IllegalStateException("No version found for form: " + id)));
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("formId", form.getId());
        response.put("id", form.getId());
        response.put("code", form.getCode());
        response.put("activeVersionId", version.getId());
        response.put("versionNumber", version.getVersionNumber());

        String versionStatus = version.isActive() ? "PUBLISHED" : "DRAFT";
        response.put("versionStatus", versionStatus);
        response.put("isActive", version.isActive());
        // ... (rest of the fields)
        response.put("name", form.getName());
        response.put("description", form.getDescription());
        response.put("status", form.getStatus());
        response.put("allowedUsers", form.getAllowedUsers());
        response.put("createdBy", form.getCreatedBy());
        response.put("assignedBuilderId", form.getAssignedBuilderId());
        response.put("assignedBuilderUsername", form.getAssignedBuilderUsername());
        response.put("createdAt", form.getCreatedAt());
        response.put("updatedAt", form.getUpdatedAt());
        response.put("allowMultipleSubmissions", form.isAllowMultipleSubmissions());
        response.put("showTimestamp", form.isShowTimestamp());
        response.put("expiresAt", form.getExpiresAt());
        response.put("fields", version.getFields());

        // Statics from version
        List<StaticFormFieldEntity> statics = version.getStaticFields();
        List<Map<String, Object>> staticList = new ArrayList<>();
        for (StaticFormFieldEntity sf : statics) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", sf.getId());
            m.put("fieldType", sf.getFieldType());
            m.put("data", sf.getData());
            m.put("fieldOrder", sf.getFieldOrder());
            m.put("isStatic", true);
            staticList.add(m);
        }
        response.put("staticFields", staticList);

        // Groups from version
        List<FormGroupEntity> groups = version.getGroups();
        List<Map<String, Object>> groupList = new ArrayList<>();
        for (FormGroupEntity g : groups) {
            Map<String, Object> gm = new LinkedHashMap<>();
            gm.put("id", g.getId());
            gm.put("groupTitle", g.getGroupTitle());
            gm.put("groupDescription", g.getGroupDescription());
            gm.put("groupOrder", g.getGroupOrder());
            gm.put("rulesJson", g.getRulesJson());
            groupList.add(gm);
        }
        response.put("groups", groupList);

        return ResponseEntity.ok(response);
    }

    @GetMapping(AppConstants.FORM_VERSIONS)
    public ResponseEntity<List<Map<String, Object>>> getVersions(@PathVariable UUID id, Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        FormEntity form = formService.getFormForAction(id, auth.getName(), isAdmin);

        List<Map<String, Object>> versionList = form.getVersions().stream()
                .sorted((v1, v2) -> v2.getVersionNumber() - v1.getVersionNumber())
                .map(v -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", v.getId());
                    m.put("versionNumber", v.getVersionNumber());
                    m.put("isActive", v.isActive());
                    m.put("versionStatus", v.isActive() ? "PUBLISHED" : "DRAFT");
                    m.put("createdAt", v.getCreatedAt());
                    return m;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(versionList);
    }

    @GetMapping(AppConstants.FORM_VERSION_BY_ID)
    public ResponseEntity<Map<String, Object>> getVersionDefinition(
            @PathVariable UUID id,
            @PathVariable UUID versionId,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        FormEntity form = formService.getFormForAction(id, auth.getName(), isAdmin);

        FormVersionEntity version = form.getVersions().stream()
                .filter(v -> v.getId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("formVersionId", version.getId());
        response.put("versionNumber", version.getVersionNumber());
        response.put("definitionJson", version.getDefinitionJson());
        return ResponseEntity.ok(response);
    }

    @GetMapping(AppConstants.FORM_FIELDS)
    public ResponseEntity<List<Map<String, Object>>> listFields(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        FormEntity form = formService.getFormForAction(formId, auth.getName(), isAdmin);

        FormVersionEntity version = form.getVersions().stream()
                .filter(v -> v.getId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));

        List<Map<String, Object>> fields = version.getFields().stream()
                .sorted(Comparator.comparingInt(FormFieldEntity::getFieldOrder))
                .map(f -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("fieldId", f.getId());
                    row.put("fieldKey", f.getFieldKey());
                    row.put("label", f.getLabel());
                    row.put("fieldType", f.getFieldType());
                    row.put("isRequired", f.isRequired());
                    row.put("isReadOnly", f.isReadOnly());
                    row.put("displayOrder", f.getFieldOrder());
                    return row;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(fields);
    }

    /**
     * Public render — returns 403 if DRAFT.
     * No ownership check: anyone with the link can submit to a published form.
     */
    @GetMapping(AppConstants.FORM_RENDER)
    public ResponseEntity<?> render(@PathVariable UUID id, jakarta.servlet.http.HttpSession session) {
        FormEntity form = formService.getFormById(id);
        // Public render only works if there is a published version
        Optional<FormVersionEntity> published = form.getPublishedVersion();
        if (published.isEmpty()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "This form is not published yet.", "status", form.getStatus().name()));
        }

        if (!form.isAllowMultipleSubmissions()) {
            String sessionKey = "submitted_" + id;
            if (session.getAttribute(sessionKey) != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "You have already submitted this form.", "status", "CONFLICT"));
            }
        }

        return ResponseEntity.ok(formRenderService.render(id, published.get().getId()));
    }

    /**
     * Admin/Role Administrator render — always returns active form for preview.
     * Admin and Role Administrator can preview any non-deleted form;
     * other users can preview only forms they can act on.
     */
    @GetMapping(AppConstants.FORM_RENDER_ADMIN)
    public ResponseEntity<?> renderAdmin(
            @PathVariable UUID id,
            @RequestParam(required = false) UUID versionId,
            Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        boolean isRoleAdmin = roles.contains(ROLE_ROLE_ADMIN);

        FormEntity form = formService.getFormById(id);
        if (!(isAdmin || isRoleAdmin)) {
            // Non-admins (Manager, Approver, Builder, Viewer) can only preview forms they are involved in
            boolean isOwner = auth.getName().equalsIgnoreCase(form.getCreatedBy());
            boolean isAssignedBuilder = auth.getName().equalsIgnoreCase(form.getAssignedBuilderUsername());

            Integer userId = (Integer) session.getAttribute("USER_ID");
            boolean isInvolved = userId != null && workflowService.isUserInvolvedInActiveWorkflow(id, userId);

            if (!isOwner && !isAssignedBuilder && !isInvolved) {
                // Secondary check: Explicit granular access
                if (!formService.hasExplicitUserAccess(form, auth.getName(), userId)) {
                    throw new NoSuchElementException("Form not found or access denied: " + id);
                }
            }
        }

        return ResponseEntity.ok(formRenderService.render(id, versionId));
    }

    /** Create a form — owner is set to the authenticated user. */
    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody FormDTO dto, Authentication auth,
            HttpSession session) {
        FormEntity created = formService.createForm(dto, auth.getName());
        auditLogService.logEvent(
                "CREATE_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                created.getId().toString(),
                "User '" + auth.getName() + "' created form '" + created.getName() + "'.",
                Map.of("formName", created.getName()),
                null,
                null,
                null,
                null);
        
        // Match user's requested response format
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("formId", created.getId());
        response.put("status", created.getStatus());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Granular Field Update API (v1 Standard)
     */
    @PutMapping(AppConstants.FORM_FIELD_BY_KEY)
    public ResponseEntity<Map<String, Object>> updateField(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            @PathVariable String fieldKey,
            @Valid @RequestBody FormFieldDTO dto,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        
        FormFieldEntity updatedField = formService.updateField(formId, versionId, fieldKey, dto, auth.getName(), isAdmin);

        return ResponseEntity.ok(Map.of("fieldId", updatedField.getId()));
    }

    /**
     * Granular Validation Update API (v1 Standard)
     */
    @PutMapping(AppConstants.FORM_VALIDATION_BY_ID)
    public ResponseEntity<Map<String, Object>> updateValidation(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            @PathVariable UUID validationId,
            @RequestBody Map<String, Object> req,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        
        formService.updateValidation(formId, versionId, validationId, req, auth.getName(), isAdmin);
        
        return ResponseEntity.ok(Map.of("validationId", validationId));
    }

    @GetMapping(AppConstants.BY_ID_SUBMISSIONS)
    public ResponseEntity<Map<String, Object>> listSubmissions(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String filter,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        formService.getFormForAction(id, auth.getName(), isAdmin);
        return ResponseEntity.ok(submissionService.getSubmissionSummaries(id, page, size, sort, filter));
    }

    @PostMapping(AppConstants.BY_ID_SUBMISSIONS_BULK)
    public ResponseEntity<Map<String, Object>> bulkSubmissionOperation(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> req,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        formService.getFormForAction(id, auth.getName(), isAdmin);

        String operation = req.get("operation") != null ? req.get("operation").toString() : "";
        if (!"DELETE".equalsIgnoreCase(operation)) {
            throw new IllegalArgumentException("Unsupported bulk operation: " + operation);
        }

        Object idsObj = req.get("submissionIds");
        if (!(idsObj instanceof List<?> idsList)) {
            throw new IllegalArgumentException("submissionIds must be an array of UUIDs");
        }

        int processed = 0;
        for (Object rawId : idsList) {
            if (rawId == null) continue;
            try {
                submissionService.deleteSubmission(id, UUID.fromString(rawId.toString()));
                processed++;
            } catch (Exception ignored) {
                // Best-effort bulk behavior: continue processing remaining IDs.
            }
        }

        return ResponseEntity.ok(Map.of("processed", processed));
    }

    @GetMapping(value = AppConstants.BY_ID_SUBMISSIONS_EXPORT, produces = "text/csv")
    public ResponseEntity<String> exportSubmissionsCsv(@PathVariable UUID id, Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        formService.getFormForAction(id, auth.getName(), isAdmin);

        Map<String, Object> firstPage = submissionService.getSubmissionSummaries(id, 0, 200, "submittedAt,desc", null);
        long total = ((Number) firstPage.getOrDefault("total", 0)).longValue();

        List<Map<String, Object>> rows = new ArrayList<>();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> firstItems = (List<Map<String, Object>>) firstPage.getOrDefault("items", List.of());
        rows.addAll(firstItems);

        int page = 1;
        while (rows.size() < total) {
            Map<String, Object> nextPage = submissionService.getSubmissionSummaries(id, page++, 200, "submittedAt,desc", null);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> nextItems = (List<Map<String, Object>>) nextPage.getOrDefault("items", List.of());
            if (nextItems.isEmpty()) break;
            rows.addAll(nextItems);
        }

        StringBuilder csv = new StringBuilder();
        csv.append("submissionId,status,submittedBy,submittedAt\n");
        for (Map<String, Object> row : rows) {
            csv.append(csvCell(row.get("submissionId"))).append(',')
                    .append(csvCell(row.get("status"))).append(',')
                    .append(csvCell(row.get("submittedBy"))).append(',')
                    .append(csvCell(row.get("submittedAt")))
                    .append('\n');
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"submissions-" + id + ".csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv.toString());
    }

    private String csvCell(Object value) {
        if (value == null) return "";
        String raw = value.toString().replace("\"", "\"\"");
        return "\"" + raw + "\"";
    }

    /**
     * Assign/Reassign Builder before workflow starts. Viewer owner or Admin only.
     */
    @PatchMapping(AppConstants.FORM_ASSIGN_BUILDER)
    public ResponseEntity<Map<String, Object>> assignBuilder(@PathVariable UUID id,
            @Valid @RequestBody AssignBuilderRequest req,
            Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        boolean isViewer = roles.contains("Viewer");
        if (!(isAdmin || isViewer)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Viewer owner or Admin can assign Builder"));
        }

        if (req == null || req.builderId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "builderId is required"));
        }

        FormEntity form = workflowService.assignBuilder(id, req.builderId, auth.getName());

        auditLogService.logEvent(
                "ASSIGN_BUILDER",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                form.getId().toString(),
                "User '" + auth.getName() + "' assigned Builder '" + form.getAssignedBuilderUsername() + "' to form '"
                        + form.getName() + "'.",
                Map.of("assignedBuilderId", form.getAssignedBuilderId(), "assignedBuilderUsername",
                        form.getAssignedBuilderUsername()),
                null,
                null,
                null,
                null);

        return ResponseEntity.ok(Map.of(
                "formId", form.getId(),
                "status", form.getStatus().name(),
                "assignedBuilderId", form.getAssignedBuilderId(),
                "assignedBuilderUsername", form.getAssignedBuilderUsername(),
                "message", "Builder assigned successfully"));
    }


    /** Archive only. Owner or Admin. */
    @DeleteMapping(AppConstants.FORM_BY_ID)
    public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth, HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (roles.contains(ROLE_ROLE_ADMIN)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        FormEntity target = formService.getFormForAction(id, auth.getName(), isAdmin);
        formService.deleteForm(id, auth.getName(), isAdmin);
        auditLogService.logEvent(
                "DELETE_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                id.toString(),
                "User '" + auth.getName() + "' archived form '" + target.getName() + "'.",
                Map.of("formName", target.getName()),
                null,
                null,
                null,
                null);
        return ResponseEntity.noContent().build();
    }

    /** Soft-delete a specific form version. */
    @DeleteMapping(AppConstants.FORM_VERSION_BY_ID)
    public ResponseEntity<Void> deleteVersion(@PathVariable UUID id, @PathVariable UUID versionId, Authentication auth, HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        
        formService.deleteFormVersion(id, versionId, auth.getName(), isAdmin);
        
        auditLogService.logEvent(
                "DELETE_FORM_VERSION",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM_VERSION",
                versionId.toString(),
                "User '" + auth.getName() + "' soft-deleted form version.",
                Map.of("formId", id.toString()),
                null,
                null,
                null,
                null);
                
        return ResponseEntity.noContent().build();
    }

    /** Publish — owner or Admin can publish a form. */
    @PatchMapping(AppConstants.FORM_PUBLISH)
    public ResponseEntity<Map<String, Object>> publish(@PathVariable UUID id, Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        boolean isRoleAdmin = roles.contains(ROLE_ROLE_ADMIN);
        // Role Administrator users cannot publish unless they are also a full Admin
        if (isRoleAdmin && !isAdmin) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        boolean isBuilder = roles.contains("Builder");
        FormEntity form = formService.publishForm(id, auth.getName(), isAdmin, isBuilder);
        auditLogService.logEvent(
                "PUBLISH_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                id.toString(),
                "User '" + auth.getName() + "' published form '" + form.getName() + "'.",
                Map.of("formName", form.getName()),
                null,
                null,
                null,
                null);
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "PUBLISHED",
                "message", "Form published successfully"));
    }

    /** Publish a specific version — owner or Admin can activate a version. */
    @PatchMapping({AppConstants.FORM_VERSION_PUBLISH, AppConstants.FORM_VERSION_ACTIVATE})
    public ResponseEntity<Map<String, Object>> publishVersion(@PathVariable UUID id, @PathVariable UUID versionId, Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        boolean isRoleAdmin = roles.contains(ROLE_ROLE_ADMIN);
        if (isRoleAdmin && !isAdmin) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        boolean isBuilder = roles.contains("Builder");
        FormEntity form = formService.publishVersion(id, versionId, auth.getName(), isAdmin, isBuilder);
        auditLogService.logEvent(
                "PUBLISH_FORM_VERSION",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM_VERSION",
                versionId.toString(),
                "User '" + auth.getName() + "' activated version " + versionId + " for form '" + form.getName() + "'.",
                Map.of("formName", form.getName(), "versionId", versionId.toString()),
                null,
                null,
                null,
                null);
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "versionId", versionId.toString(),
                "status", "PUBLISHED",
                "message", "Version activated"));
    }


    /** Unpublish — owner or Admin can unpublish a form. */
    @PatchMapping(AppConstants.FORM_UNPUBLISH)
    public ResponseEntity<Map<String, Object>> unpublish(@PathVariable UUID id, Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (roles.contains(ROLE_ROLE_ADMIN)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        FormEntity form = formService.unpublishForm(id, auth.getName(), isAdmin);
        auditLogService.logEvent(
                "UNPUBLISH_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                id.toString(),
                "User '" + auth.getName() + "' unpublished form '" + form.getName() + "'.",
                Map.of("formName", form.getName()),
                null,
                null,
                null,
                null);
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "DRAFT",
                "message", "Form unpublished successfully"));
    }

    @GetMapping(AppConstants.FORM_TRASH)
    public ResponseEntity<List<Map<String, Object>>> getTrash(Authentication auth) {
        String username = auth.getName();
        Set<String> roleNames = userRoleService.getUserRoleNames(username);
        List<FormEntity> forms = formService.getDeletedForms(username, roleNames);

        List<Map<String, Object>> responseList = forms.stream().map(f -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", f.getId());
            map.put("name", f.getName());
            map.put("code", f.getCode());
            map.put("description", f.getDescription());
            map.put("status", f.getStatus().name());
            map.put("createdBy", f.getCreatedBy());
            map.put("createdAt", f.getCreatedAt());
            map.put("archivedAt", f.getUpdatedAt());
            map.put("isOwner", f.getCreatedBy().equals(username));
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(responseList);
    }

    @PostMapping(AppConstants.FORM_RESTORE)
    public ResponseEntity<Void> restore(@PathVariable UUID id, Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        formService.restoreForm(id, auth.getName(), isAdmin);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping(AppConstants.FORM_PERMANENT_DELETE)
    public ResponseEntity<Void> permanentlyDelete(@PathVariable UUID id, Authentication auth, HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN);
        
        // Permanent delete is a high-risk action, we log it carefully
        formService.permanentlyDeleteForm(id, auth.getName(), isAdmin);
        
        auditLogService.logEvent(
                "PERMANENT_DELETE_FORM",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                id.toString(),
                "User '" + auth.getName() + "' PERMANENTLY deleted form record and data table.",
                null,
                null,
                null,
                null,
                null);
                
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/visibility-candidates")
    public ResponseEntity<?> getVisibilityCandidates(Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Viewer") || roles.contains("Builder") || roles.contains(ROLE_ADMIN))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Viewer, Builder, or Admin can view visibility candidates"));
        }

        List<Map<String, Object>> users = userRoleService.getAllUsersLite().stream()
           .map(this::toVisibilityUserSummary)
           .toList();

        return ResponseEntity.ok(Map.of("users", users));
    }

    private Map<String, Object> toVisibilityUserSummary(User user) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", user.getId());
        map.put("username", user.getUsername());
        map.put("name", user.getName());
        return map;
    }

    public static class AssignBuilderRequest {
        @NotNull(message = "Builder ID is required")
        public Integer builderId;
    }
}
