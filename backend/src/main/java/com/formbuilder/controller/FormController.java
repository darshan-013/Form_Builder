package com.formbuilder.controller;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormGroupEntity;
import com.formbuilder.entity.FormVersionEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.AuditLogService;
import com.formbuilder.service.FormRenderService;
import com.formbuilder.service.FormService;
import com.formbuilder.workflow.entity.WorkflowInstance;
import com.formbuilder.workflow.entity.WorkflowInstanceStatus;
import com.formbuilder.workflow.service.WorkflowService;
import com.formbuilder.workflow.entity.WorkflowStep;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/forms")
@RequiredArgsConstructor
public class FormController {

    private final FormService formService;
    private final FormRenderService formRenderService;
    private final UserRoleService userRoleService;
    private final AuditLogService auditLogService;
    private final WorkflowService workflowService;

    private static final String ROLE_ADMIN = "Admin";
    private static final String ROLE_ROLE_ADMIN = "Role Administrator";

    /** List only the forms that belong to the authenticated user. */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAll(Authentication auth) {
        String username = auth.getName();
        Set<String> roleNames = userRoleService.getUserRoleNames(username);

        List<FormEntity> forms = formService.getFormsForRole(username, roleNames);
        Map<UUID, WorkflowInstance> workflowByFormId = workflowService.getLatestWorkflowsByFormIds(
                forms.stream().map(FormEntity::getId).toList());
        Map<String, Boolean> creatorIsBuilderCache = new HashMap<>();

        // Annotate each form with ownership flag and effective permissions
        List<Map<String, Object>> response = forms.stream().map(form -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", form.getId());
            map.put("name", form.getName());
            map.put("description", form.getDescription());
            map.put("tableName", form.getTableName());
            map.put("status", form.getStatus());
            map.put("allowedUsers", form.getAllowedUsers());
            map.put("createdBy", form.getCreatedBy());
            map.put("assignedBuilderId", form.getAssignedBuilderId());
            map.put("assignedBuilderUsername", form.getAssignedBuilderUsername());
            map.put("createdAt", form.getCreatedAt());
            map.put("updatedAt", form.getUpdatedAt());
            map.put("allowMultipleSubmissions", form.isAllowMultipleSubmissions());
            map.put("showTimestamp", form.isShowTimestamp());
            map.put("expiresAt", form.getExpiresAt());
            // fields moved to version, not shown in list view

            WorkflowInstance wf = workflowByFormId.get(form.getId());
            map.put("workflow", wf != null ? toWorkflowSummary(wf) : null);

            // Ownership flag — frontend uses this to show/hide edit/delete buttons
            boolean isOwner = username.equals(form.getCreatedBy());
            map.put("isOwner", isOwner);

            // Effective actions: what can this user do with this form?
            boolean isAdmin = roleNames.contains(ROLE_ADMIN);
            boolean isRoleAdmin = roleNames.contains(ROLE_ROLE_ADMIN);
            boolean isBuilder = roleNames.contains("Builder");
            boolean isViewer = roleNames.contains("Viewer");
            boolean isAssignedBuilder = username.equals(form.getAssignedBuilderUsername());
            boolean isDraft = form.getStatus() == FormEntity.FormStatus.DRAFT;
            boolean isBuilderCreated = form.getCreatedBy() != null
                    && creatorIsBuilderCache.computeIfAbsent(form.getCreatedBy(), creator -> {
                        try {
                            Set<String> creatorRoles = userRoleService.getUserRoleNames(creator);
                            return creatorRoles.contains("Builder") || creatorRoles.contains(ROLE_ADMIN);
                        } catch (Exception ex) {
                            return false;
                        }
                    });
            boolean hasActiveWorkflow = wf != null && wf.getStatus() == WorkflowInstanceStatus.ACTIVE;
            boolean viewerCanAssign = isViewer && isOwner && form.getAssignedBuilderId() == null;

            // Forms created by Admin or Builder don't need "approval of builder" or
            // workflow.
            // They can be published directly if the user is an Admin or (Builder owner).
            boolean canPublish = !isRoleAdmin && isDraft && (isAdmin || (isBuilderCreated && isBuilder && isOwner));

            boolean canAssignBuilder = !isRoleAdmin
                    && !isBuilderCreated // Bypass workflow for privileged creators
                    && !hasActiveWorkflow
                    && form.getStatus() != FormEntity.FormStatus.PENDING_APPROVAL
                    && form.getStatus() != FormEntity.FormStatus.PUBLISHED
                    && (isAdmin || viewerCanAssign);

            boolean canStartWorkflow = !isRoleAdmin
                    && !isBuilderCreated // Bypass workflow for privileged creators
                    && !hasActiveWorkflow
                    && form.getStatus() != FormEntity.FormStatus.PENDING_APPROVAL
                    && form.getStatus() != FormEntity.FormStatus.PUBLISHED
                    && (isAdmin || (isBuilder && isAssignedBuilder));

            map.put("canEdit", !isRoleAdmin && !isViewer && (isOwner || isAdmin));
            map.put("canDelete", !isRoleAdmin && (isOwner || isAdmin));
            map.put("canPublish", canPublish);
            map.put("canAssignBuilder", canAssignBuilder);
            map.put("canStartWorkflow", canStartWorkflow);
            map.put("canRequestWorkflow", canStartWorkflow);
            map.put("canViewSubmissions", isOwner || isAdmin || isBuilder || roleNames.contains("Manager"));

            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
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

    /** Update form — owner or Admin can edit. Supports optional versionId for targeted version editing. */
    @PutMapping("/{id}")
    public ResponseEntity<FormEntity> updateForm(
            @PathVariable UUID id,
            @RequestParam(required = false) UUID versionId,
            @RequestBody FormDTO dto,
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
    @GetMapping("/{id}")
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
        response.put("id", form.getId());
        response.put("activeVersionId", version.getId());
        response.put("versionNumber", version.getVersionNumber());
        
        String status = "DRAFT";
        if (version.isActive()) {
            status = "PUBLISHED";
        } else if (version.getPublishedAt() != null) {
            status = "DRAFT";
        }
        response.put("versionStatus", status);
        // ... (rest of the fields)
        response.put("name", form.getName());
        response.put("description", form.getDescription());
        response.put("tableName", form.getTableName());
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

    @GetMapping("/{id}/versions")
    public ResponseEntity<List<Map<String, Object>>> getVersions(@PathVariable UUID id, Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains(ROLE_ADMIN) || roles.contains(ROLE_ROLE_ADMIN);
        FormEntity form = formService.getFormForAction(id, auth.getName(), isAdmin);

        List<Map<String, Object>> versionList = form.getVersions().stream()
                .filter(v -> !v.isSoftDeleted())
                .sorted((v1, v2) -> v2.getVersionNumber() - v1.getVersionNumber())
                .map(v -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", v.getId());
                    m.put("versionNumber", v.getVersionNumber());
                    m.put("status", v.getStatus().name());
                    m.put("createdAt", v.getCreatedAt());
                    return m;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(versionList);
    }

    /**
     * Public render — returns 403 if DRAFT.
     * No ownership check: anyone with the link can submit to a published form.
     */
    @GetMapping("/{id}/render")
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
    @GetMapping("/{id}/render/admin")
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
    public ResponseEntity<FormEntity> create(@Valid @RequestBody FormDTO dto, Authentication auth,
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
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Assign/Reassign Builder before workflow starts. Viewer owner or Admin only.
     */
    @PatchMapping("/{id}/assign-builder")
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


    /** Soft-delete only. Owner or Admin. */
    @DeleteMapping("/{id}")
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
                "User '" + auth.getName() + "' deleted form '" + target.getName() + "'.",
                Map.of("formName", target.getName()),
                null,
                null,
                null,
                null);
        return ResponseEntity.noContent().build();
    }

    /** Soft-delete a specific form version. */
    @DeleteMapping("/{id}/versions/{versionId}")
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
    @PatchMapping("/{id}/publish")
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
    @PatchMapping("/{id}/versions/{versionId}/publish")
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
                "message", "Form version activated successfully"));
    }


    /** Unpublish — owner or Admin can unpublish a form. */
    @PatchMapping("/{id}/unpublish")
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
