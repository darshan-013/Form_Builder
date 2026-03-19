package com.formbuilder.workflow;

import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.AuditLogService;
import com.formbuilder.workflow.dto.BuilderReviewDTO;
import com.formbuilder.workflow.dto.CreatorWorkflowStatusDTO;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;
    private final UserRoleService userRoleService;
    private final AuditLogService auditLogService;

    @PostMapping("/initiate")
    public ResponseEntity<?> initiate(@RequestBody InitiateWorkflowRequest req,
            Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Builder") || roles.contains("Admin"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Builder or Admin can initiate a workflow"));
        }

        WorkflowInstance instance = workflowService.initiate(
                req.formId,
                req.targetBuilderId,
                req.intermediateAuthorityIds,
                auth.getName());

        auditLogService.logEvent(
                "INIT_WORKFLOW",
                auditLogService.getSessionUserId(session.getAttribute("USER_ID")),
                auth.getName(),
                "FORM",
                req.formId.toString(),
                "User '" + auth.getName() + "' initiated workflow for form '" + req.formId + "'.",
                Map.of("workflowId", instance.getId(), "totalSteps", instance.getTotalSteps()),
                null,
                null,
                null,
                null);

        return ResponseEntity.status(HttpStatus.CREATED).body(toInstanceSummary(instance));
    }

    @GetMapping("/my-pending")
    public ResponseEntity<?> myPending(HttpSession session) {
        Integer userId = requireSessionUserId(session);
        List<WorkflowStep> pending = workflowService.getMyPending(userId);

        List<Map<String, Object>> rows = pending.stream().map(this::toPendingRow).toList();
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/steps/{stepId}/approve")
    public ResponseEntity<?> approve(@PathVariable Long stepId,
            @RequestBody(required = false) DecideRequest req,
            Authentication auth,
            HttpSession session) {
        Integer userId = requireSessionUserId(session);
        WorkflowStep step = workflowService.approveStep(stepId, userId, req != null ? req.comments : null);

        auditLogService.logEvent(
                "WORKFLOW_APPROVE",
                userId,
                auth.getName(),
                "FORM",
                step.getInstance().getForm().getId().toString(),
                "User '" + auth.getName() + "' approved workflow step " + stepId + ".",
                Map.of("workflowId", step.getInstance().getId(), "stepIndex", step.getStepIndex()),
                null,
                null,
                null,
                null);

        return ResponseEntity.ok(toPendingRow(step));
    }

    @PostMapping("/steps/{stepId}/reject")
    public ResponseEntity<?> reject(@PathVariable Long stepId,
            @RequestBody(required = false) DecideRequest req,
            Authentication auth,
            HttpSession session) {
        Integer userId = requireSessionUserId(session);
        WorkflowStep step = workflowService.rejectStep(stepId, userId, req != null ? req.comments : null);

        auditLogService.logEvent(
                "WORKFLOW_REJECT",
                userId,
                auth.getName(),
                "FORM",
                step.getInstance().getForm().getId().toString(),
                "User '" + auth.getName() + "' rejected workflow step " + stepId + ".",
                Map.of("workflowId", step.getInstance().getId(), "stepIndex", step.getStepIndex()),
                null,
                null,
                null,
                null);

        return ResponseEntity.ok(toPendingRow(step));
    }

    @GetMapping("/my-status")
    public ResponseEntity<?> myStatus(Authentication auth, HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAuthorized = roles.stream().anyMatch(r -> 
            List.of("Creator", "Viewer", "Admin", "Builder", "Approver", "Manager", "Role Administrator").contains(r));
            
        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "You do not have permission to view workflow status."));
        }

        Integer userId = requireSessionUserId(session);
        List<CreatorWorkflowStatusDTO> rows = workflowService.getCreatorStatuses(auth.getName(), userId);
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/pending-reviews")
    public ResponseEntity<?> pendingReviews(Authentication auth, HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Builder") || roles.contains("Admin") || roles.contains("Approver") || roles.contains("Manager"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied. Builder or Authority role required."));
        }

        Integer userId = requireSessionUserId(session);
        List<BuilderReviewDTO> rows = workflowService.getPendingReviews(userId);
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/overall-reviews")
    public ResponseEntity<?> overallReviews(Authentication auth, HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Builder") || roles.contains("Admin") || roles.contains("Approver") || roles.contains("Manager"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied. Builder or Authority role required."));
        }

        Integer userId = requireSessionUserId(session);
        List<BuilderReviewDTO> rows = workflowService.getBuilderOverallReviews(userId);
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/candidates")
    public ResponseEntity<?> getCandidates(Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Admin") || roles.contains("Builder") || roles.contains("Viewer"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied"));
        }

        Map<String, List<User>> candidates = workflowService.getWorkflowCandidates();
        return ResponseEntity.ok(Map.of(
                "builders", candidates.get("builders").stream().map(this::toUserSummary).toList(),
                "authorities", candidates.get("authorities").stream().map(this::toUserSummary).toList()));
    }

    @PostMapping("/{workflowId}/approve")
    public ResponseEntity<?> approveWorkflow(@PathVariable Long workflowId,
            @RequestBody(required = false) DecideRequest req,
            Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Builder") || roles.contains("Admin"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Builder access required"));
        }

        Integer userId = requireSessionUserId(session);
        WorkflowStep step = workflowService.approveWorkflow(workflowId, userId, req != null ? req.comments : null);
        return ResponseEntity.ok(toPendingRow(step));
    }

    @PostMapping("/{workflowId}/reject")
    public ResponseEntity<?> rejectWorkflow(@PathVariable Long workflowId,
            @RequestBody(required = false) DecideRequest req,
            Authentication auth,
            HttpSession session) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!(roles.contains("Builder") || roles.contains("Admin"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Builder access required"));
        }

        Integer userId = requireSessionUserId(session);
        WorkflowStep step = workflowService.rejectWorkflow(workflowId, userId, req != null ? req.comments : null);
        return ResponseEntity.ok(toPendingRow(step));
    }

    private Integer requireSessionUserId(HttpSession session) {
        Object value = session.getAttribute("USER_ID");
        if (value instanceof Integer userId) {
            return userId;
        }
        throw new IllegalStateException("Authentication required. Please log in again.");
    }

    private Map<String, Object> toPendingRow(WorkflowStep step) {
        WorkflowInstance instance = step.getInstance();
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("stepId", step.getId());
        map.put("workflowId", instance.getId());
        map.put("formId", instance.getForm().getId());
        map.put("formName", instance.getForm().getName());
        map.put("status", instance.getStatus());
        map.put("currentStepIndex", instance.getCurrentStepIndex());
        map.put("totalSteps", instance.getTotalSteps());
        map.put("stepIndex", step.getStepIndex());
        map.put("stepStatus", step.getStatus());
        map.put("comments", step.getComments());
        map.put("targetBuilder", toUserSummary(instance.getTargetBuilder()));
        map.put("canAction", Objects.equals(step.getStepIndex(), instance.getCurrentStepIndex()));
        return map;
    }

    private Map<String, Object> toCreatorStatusRow(WorkflowInstance instance) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("workflowId", instance.getId());
        map.put("formId", instance.getForm().getId());
        map.put("formName", instance.getForm().getName());
        map.put("status", instance.getStatus());
        map.put("currentStepIndex", instance.getCurrentStepIndex());
        map.put("totalSteps", instance.getTotalSteps());

        WorkflowStep currentStep = instance.getSteps().stream()
                .filter(s -> Objects.equals(s.getStepIndex(), instance.getCurrentStepIndex()))
                .findFirst()
                .orElse(null);

        map.put("currentApprover", currentStep != null ? toUserSummary(currentStep.getApprover()) : null);

        List<WorkflowStep> orderedSteps = instance.getSteps().stream()
                .sorted(Comparator.comparing(WorkflowStep::getStepIndex))
                .toList();

        List<String> flowChain = orderedSteps.stream()
                .map(s -> {
                    User u = s.getApprover();
                    return (u.getName() != null && !u.getName().isBlank()) ? u.getName() : u.getUsername();
                })
                .toList();

        String currentFlowView = orderedSteps.stream()
                .map(s -> {
                    User u = s.getApprover();
                    String label = (u.getName() != null && !u.getName().isBlank()) ? u.getName() : u.getUsername();
                    if (Objects.equals(s.getStepIndex(), instance.getCurrentStepIndex())
                            && instance.getStatus() == WorkflowInstanceStatus.ACTIVE) {
                        return "[" + label + "]";
                    }
                    return label;
                })
                .collect(Collectors.joining(" -> "));

        map.put("flowChain", flowChain);
        map.put("currentFlowView", currentFlowView);

        Optional<WorkflowStep> rejected = instance.getSteps().stream()
                .filter(s -> s.getStatus() == WorkflowStepStatus.REJECTED)
                .findFirst();

        map.put("finalDecision", instance.getStatus() == WorkflowInstanceStatus.COMPLETED
                ? "APPROVED"
                : instance.getStatus() == WorkflowInstanceStatus.REJECTED ? "REJECTED" : "PENDING");
        map.put("finalComments", rejected.map(WorkflowStep::getComments).orElse(null));

        return map;
    }

    private Map<String, Object> toInstanceSummary(WorkflowInstance instance) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", instance.getId());
        map.put("formId", instance.getForm().getId());
        map.put("status", instance.getStatus());
        map.put("currentStepIndex", instance.getCurrentStepIndex());
        map.put("totalSteps", instance.getTotalSteps());
        map.put("targetBuilder", toUserSummary(instance.getTargetBuilder()));
        map.put("steps", instance.getSteps().stream().map(step -> Map.of(
                "id", step.getId(),
                "stepIndex", step.getStepIndex(),
                "status", step.getStatus(),
                "approver", toUserSummary(step.getApprover()))).collect(Collectors.toList()));
        return map;
    }

    private Map<String, Object> toUserSummary(User user) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", user.getId());
        map.put("username", user.getUsername());
        map.put("name", user.getName());
        map.put("email", user.getEmail());
        return map;
    }

    public static class InitiateWorkflowRequest {
        public UUID formId;
        public Integer targetBuilderId;
        public List<Integer> intermediateAuthorityIds;
    }

    public static class DecideRequest {
        public String comments;
    }
}
