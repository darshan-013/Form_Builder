package com.formbuilder.workflow;

import com.formbuilder.entity.FormEntity;
import com.formbuilder.repository.FormJpaRepository;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.UserRepository;
import com.formbuilder.workflow.dto.AdminWorkflowStatusDTO;
import com.formbuilder.workflow.dto.BuilderReviewDTO;
import com.formbuilder.workflow.dto.CreatorWorkflowStatusDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowService {

    private final WorkflowInstanceRepository instanceRepo;
    private final WorkflowStepRepository stepRepo;
    private final FormJpaRepository formRepo;
    private final UserRepository userRepo;

    @Transactional
    public WorkflowInstance initiate(UUID formId,
                                     Integer targetBuilderId,
                                     List<Integer> intermediateAuthorityIds,
                                     String actorUsername) {
        if (targetBuilderId == null) {
            throw new IllegalArgumentException("Target builder is required");
        }

        Set<String> actorRoles = getRoleNames(actorUsername);
        boolean isAdmin = actorRoles.contains("Admin");
        boolean isBuilder = actorRoles.contains("Builder");
        if (!(isAdmin || isBuilder)) {
            throw new IllegalStateException("Only Builder or Admin can initiate workflow");
        }

        FormEntity form = formRepo.findById(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));

        if (!isAdmin) {
            if (!Objects.equals(form.getAssignedBuilderUsername(), actorUsername)) {
                throw new IllegalStateException("Only the assigned Builder can start this workflow");
            }
            if (!Objects.equals(form.getAssignedBuilderId(), targetBuilderId)) {
                throw new IllegalStateException("Assigned Builder must be the workflow target");
            }
        }

        if (form.isSoftDeleted()) {
            throw new IllegalStateException("Cannot start workflow for a deleted form");
        }

        if (form.getStatus() == FormEntity.FormStatus.PUBLISHED) {
            throw new IllegalStateException("Form is already published");
        }

        instanceRepo.findByForm_IdAndStatus(formId, WorkflowInstanceStatus.ACTIVE)
                .ifPresent(existing -> {
                    throw new IllegalStateException("An active workflow already exists for this form");
                });

        List<Integer> intermediates = sanitizeIntermediates(intermediateAuthorityIds);

        User targetBuilder = userRepo.findById(targetBuilderId)
                .orElseThrow(() -> new NoSuchElementException("Target builder not found: " + targetBuilderId));
        if (!targetBuilder.hasRole("Builder")) {
            throw new IllegalArgumentException("Target user must have Builder role");
        }

        Set<Integer> dedupe = new LinkedHashSet<>(intermediates);
        if (dedupe.size() != intermediates.size()) {
            throw new IllegalArgumentException("Intermediate authorities must be unique");
        }
        if (dedupe.contains(targetBuilderId)) {
            throw new IllegalArgumentException("Target builder cannot be an intermediate approver");
        }

        List<User> intermediateUsers = new ArrayList<>();
        for (Integer id : intermediates) {
            User approver = userRepo.findById(id)
                    .orElseThrow(() -> new NoSuchElementException("Authority user not found: " + id));
            if (!(approver.hasRole("Manager") || approver.hasRole("Approver"))) {
                throw new IllegalArgumentException("Intermediate authority must have Manager or Approver role");
            }
            intermediateUsers.add(approver);
        }

        User creator = resolveCreator(form, actorUsername);

        WorkflowInstance instance = WorkflowInstance.builder()
                .form(form)
                .creator(creator)
                .targetBuilder(targetBuilder)
                .currentStepIndex(1)
                .totalSteps(intermediateUsers.size() + 1)
                .status(WorkflowInstanceStatus.ACTIVE)
                .build();

        List<WorkflowStep> steps = new ArrayList<>();
        int idx = 1;
        for (User authority : intermediateUsers) {
            steps.add(WorkflowStep.builder()
                    .instance(instance)
                    .approver(authority)
                    .stepIndex(idx++)
                    .status(WorkflowStepStatus.PENDING)
                    .build());
        }

        steps.add(WorkflowStep.builder()
                .instance(instance)
                .approver(targetBuilder)
                .stepIndex(idx)
                .status(WorkflowStepStatus.PENDING)
                .build());

        instance.setSteps(steps);
        WorkflowInstance saved = instanceRepo.save(instance);

        form.setStatus(FormEntity.FormStatus.PENDING_APPROVAL);
        formRepo.save(form);

        log.info("Workflow {} initiated for form {} by '{}' (steps={})",
                saved.getId(), formId, actorUsername, saved.getTotalSteps());
        return saved;
    }

    @Transactional
    public FormEntity assignBuilder(UUID formId, Integer builderId, String actorUsername) {
        if (builderId == null) {
            throw new IllegalArgumentException("Builder is required");
        }

        Set<String> actorRoles = getRoleNames(actorUsername);
        boolean isAdmin = actorRoles.contains("Admin");
        boolean isViewer = actorRoles.contains("Viewer");

        FormEntity form = formRepo.findById(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));

        if (!(isAdmin || (isViewer && Objects.equals(form.getCreatedBy(), actorUsername)))) {
            throw new IllegalStateException("Only form owner Viewer or Admin can assign a Builder");
        }

        // Viewer can assign only once; reassignment is Admin-only.
        if (!isAdmin && form.getAssignedBuilderId() != null) {
            throw new IllegalStateException("Viewer cannot change Builder after first assignment. Contact Admin.");
        }

        if (form.isSoftDeleted()) {
            throw new IllegalStateException("Cannot assign Builder for a deleted form");
        }

        if (form.getStatus() == FormEntity.FormStatus.PENDING_APPROVAL || form.getStatus() == FormEntity.FormStatus.PUBLISHED) {
            throw new IllegalStateException("Builder assignment is allowed only before workflow starts");
        }

        instanceRepo.findByForm_IdAndStatus(formId, WorkflowInstanceStatus.ACTIVE)
                .ifPresent(existing -> {
                    throw new IllegalStateException("Cannot reassign while an active workflow exists");
                });

        User builder = userRepo.findById(builderId)
                .orElseThrow(() -> new NoSuchElementException("Builder not found: " + builderId));
        if (!builder.hasRole("Builder") || !builder.isEnabled()) {
            throw new IllegalArgumentException("Target user must be an enabled Builder");
        }

        form.setAssignedBuilderId(builder.getId());
        form.setAssignedBuilderUsername(builder.getUsername());
        form.setStatus(FormEntity.FormStatus.ASSIGNED);
        return formRepo.save(form);
    }

    @Transactional
    public WorkflowStep approveStep(Long stepId, Integer actorUserId, String comments) {
        WorkflowStep step = getActionableStep(stepId, actorUserId);

        step.setStatus(WorkflowStepStatus.APPROVED);
        step.setComments(trimComments(comments));
        step.setDecidedAt(LocalDateTime.now());

        WorkflowInstance instance = step.getInstance();
        if (instance.getCurrentStepIndex().equals(instance.getTotalSteps())) {
            completeWorkflow(instance);
        } else {
            instance.setCurrentStepIndex(instance.getCurrentStepIndex() + 1);
            instanceRepo.save(instance);
        }

        return stepRepo.save(step);
    }

    @Transactional
    public WorkflowStep rejectStep(Long stepId, Integer actorUserId, String comments) {
        WorkflowStep step = getActionableStep(stepId, actorUserId);

        step.setStatus(WorkflowStepStatus.REJECTED);
        step.setComments(trimComments(comments));
        step.setDecidedAt(LocalDateTime.now());

        WorkflowInstance instance = step.getInstance();
        instance.setStatus(WorkflowInstanceStatus.REJECTED);
        instanceRepo.save(instance);

        FormEntity form = instance.getForm();
        form.setStatus(FormEntity.FormStatus.REJECTED);
        formRepo.save(form);

        return stepRepo.save(step);
    }

    @Transactional(readOnly = true)
    public List<WorkflowStep> getMyPending(Integer approverId) {
        return stepRepo.findMyPendingSteps(approverId);
    }

    @Transactional(readOnly = true)
    public List<WorkflowInstance> getMyInvolvedStatuses(String username, Integer userId) {
        return instanceRepo.findByCreatorOrApproverWithSteps(username, userId);
    }

    @Transactional(readOnly = true)
    public boolean isUserInvolvedInActiveWorkflow(UUID formId, Integer userId) {
        return instanceRepo.findByForm_IdAndStatus(formId, WorkflowInstanceStatus.ACTIVE)
                .map(instance -> {
                    if (Objects.equals(instance.getCreator().getId(), userId)) return true;
                    if (Objects.equals(instance.getTargetBuilder().getId(), userId)) return true;
                    return instance.getSteps().stream()
                            .anyMatch(step -> Objects.equals(step.getApprover().getId(), userId));
                })
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public Map<String, List<User>> getWorkflowCandidates() {
        List<User> users = userRepo.findAllWithRolesAndPermissions();

        List<User> builders = users.stream()
                .filter(User::isEnabled)
                .filter(u -> u.hasRole("Builder"))
                .sorted(Comparator.comparing(User::getUsername, String.CASE_INSENSITIVE_ORDER))
                .toList();

        List<User> authorities = users.stream()
                .filter(User::isEnabled)
                .filter(u -> u.hasRole("Manager") || u.hasRole("Approver"))
                .sorted(Comparator.comparing(User::getUsername, String.CASE_INSENSITIVE_ORDER))
                .toList();

        return Map.of("builders", builders, "authorities", authorities);
    }

    @Transactional(readOnly = true)
    public List<WorkflowInstance> getAllStatuses() {
        return instanceRepo.findAllWithSteps();
    }

    @Transactional(readOnly = true)
    public Map<UUID, WorkflowInstance> getLatestWorkflowsByFormIds(Collection<UUID> formIds) {
        if (formIds == null || formIds.isEmpty()) {
            return Map.of();
        }

        List<WorkflowInstance> rows = instanceRepo.findByFormIdsWithSteps(new ArrayList<>(formIds));
        Map<UUID, WorkflowInstance> out = new LinkedHashMap<>();
        for (WorkflowInstance wi : rows) {
            UUID formId = wi.getForm().getId();
            out.putIfAbsent(formId, wi);
        }
        return out;
    }

    @Transactional
    public int rejectActiveWorkflowsForUser(Integer userId, String reason) {
        List<WorkflowInstance> instances = instanceRepo.findActiveInvolvingUser(userId);
        if (instances.isEmpty()) {
            return 0;
        }

        int rejected = 0;
        for (WorkflowInstance instance : instances) {
            if (instance.getStatus() != WorkflowInstanceStatus.ACTIVE) {
                continue;
            }

            Optional<WorkflowStep> current = instance.getSteps().stream()
                    .filter(s -> s.getStepIndex().equals(instance.getCurrentStepIndex()))
                    .findFirst();

            current.ifPresent(step -> {
                if (step.getStatus() == WorkflowStepStatus.PENDING) {
                    step.setStatus(WorkflowStepStatus.REJECTED);
                    step.setComments(reason);
                    step.setDecidedAt(LocalDateTime.now());
                }
            });

            instance.setStatus(WorkflowInstanceStatus.REJECTED);
            instance.getForm().setStatus(FormEntity.FormStatus.REJECTED);
            rejected++;
        }

        return rejected;
    }

    @Transactional(readOnly = true)
    public long countWorkflowInstanceReferences(Integer userId) {
        if (userId == null) {
            return 0;
        }
        return instanceRepo.countByCreator_IdOrTargetBuilder_Id(userId, userId);
    }

    @Transactional(readOnly = true)
    public long countWorkflowStepReferences(Integer userId) {
        if (userId == null) {
            return 0;
        }
        return stepRepo.countByApprover_Id(userId);
    }

    @Transactional
    public long purgeWorkflowStepReferences(Integer userId) {
        if (userId == null) {
            return 0;
        }
        return stepRepo.deleteByApprover_Id(userId);
    }

    private WorkflowStep getActionableStep(Long stepId, Integer actorUserId) {
        WorkflowStep step = stepRepo.findByIdWithInstanceAndApprover(stepId)
                .orElseThrow(() -> new NoSuchElementException("Workflow step not found: " + stepId));

        if (!Objects.equals(step.getApprover().getId(), actorUserId)) {
            throw new IllegalStateException("Only the assigned approver can act on this step");
        }

        WorkflowInstance instance = step.getInstance();
        if (instance.getStatus() != WorkflowInstanceStatus.ACTIVE) {
            throw new IllegalStateException("Workflow is no longer active");
        }

        if (step.getStatus() != WorkflowStepStatus.PENDING) {
            throw new IllegalStateException("This workflow step is already decided");
        }

        if (!Objects.equals(step.getStepIndex(), instance.getCurrentStepIndex())) {
            throw new IllegalStateException("This workflow step is not active yet");
        }

        return step;
    }

    private void completeWorkflow(WorkflowInstance instance) {
        instance.setStatus(WorkflowInstanceStatus.COMPLETED);

        FormEntity form = instance.getForm();
        form.setCreatedBy(instance.getTargetBuilder().getUsername());
        form.setStatus(FormEntity.FormStatus.PUBLISHED);
        formRepo.save(form);

        instanceRepo.save(instance);
    }

    private User resolveCreator(FormEntity form, String actorUsername) {
        if (form.getCreatedBy() != null && !form.getCreatedBy().isBlank()) {
            Optional<User> creator = userRepo.findByUsername(form.getCreatedBy());
            if (creator.isPresent()) {
                return creator.get();
            }
        }
        return userRepo.findByUsername(actorUsername)
                .orElseThrow(() -> new NoSuchElementException("Actor user not found: " + actorUsername));
    }

    private Set<String> getRoleNames(String username) {
        return userRepo.findByUsernameWithRolesAndPermissions(username)
                .map(user -> user.getRoles().stream().map(r -> r.getRoleName()).collect(Collectors.toSet()))
                .orElse(Set.of());
    }


    private List<Integer> sanitizeIntermediates(List<Integer> input) {
        if (input == null) {
            return List.of();
        }
        return input.stream().filter(Objects::nonNull).collect(Collectors.toList());
    }

    private String trimComments(String comments) {
        if (comments == null) {
            return null;
        }
        String trimmed = comments.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Transactional(readOnly = true)
    public List<CreatorWorkflowStatusDTO> getCreatorStatuses(String username, Integer userId) {
        return instanceRepo.findByCreatorOrApproverWithSteps(username, userId).stream()
                .map(this::toCreatorStatusDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BuilderReviewDTO> getBuilderOverallReviews(Integer userId) {
        // Find all instances where user is target builder OR is an approver in any step
        return instanceRepo.findByInvolvedUserWithSteps(userId).stream()
                .map(wi -> toBuilderReviewDtoFromInstance(wi, userId))
                .toList();
    }

    public List<BuilderReviewDTO> getPendingReviews(Integer builderUserId) {
        return stepRepo.findMyPendingSteps(builderUserId).stream()
                .map(this::toBuilderReviewDto)
                .toList();
    }

    @Transactional
    public WorkflowStep approveWorkflow(Long workflowId, Integer actorUserId, String comments) {
        WorkflowStep current = getCurrentPendingStepForApprover(workflowId, actorUserId);
        return approveStep(current.getId(), actorUserId, comments);
    }

    @Transactional
    public WorkflowStep rejectWorkflow(Long workflowId, Integer actorUserId, String comments) {
        WorkflowStep current = getCurrentPendingStepForApprover(workflowId, actorUserId);
        return rejectStep(current.getId(), actorUserId, comments);
    }

    @Transactional(readOnly = true)
    public List<AdminWorkflowStatusDTO> getAdminStatuses(String creator,
                                                         String status,
                                                         Integer workflowStep,
                                                         LocalDateTime fromDate,
                                                         LocalDateTime toDate) {
        return instanceRepo.findAllWithSteps().stream()
                .filter(wi -> creator == null || creator.isBlank() ||
                        wi.getCreator().getUsername().equalsIgnoreCase(creator) ||
                        (wi.getCreator().getName() != null && wi.getCreator().getName().equalsIgnoreCase(creator)))
                .filter(wi -> {
                    if (status == null || status.isBlank()) return true;
                    return mapDecisionStatus(wi).equalsIgnoreCase(status);
                })
                .filter(wi -> workflowStep == null || Objects.equals(wi.getCurrentStepIndex(), workflowStep))
                .filter(wi -> fromDate == null || !wi.getCreatedAt().isBefore(fromDate))
                .filter(wi -> toDate == null || !wi.getCreatedAt().isAfter(toDate))
                .map(this::toAdminStatusDto)
                .toList();
    }

    private WorkflowStep getCurrentPendingStepForApprover(Long workflowId, Integer approverId) {
        WorkflowInstance instance = instanceRepo.findById(workflowId)
                .orElseThrow(() -> new NoSuchElementException("Workflow not found: " + workflowId));

        if (instance.getStatus() != WorkflowInstanceStatus.ACTIVE) {
            throw new IllegalStateException("Workflow is not active");
        }

        WorkflowStep current = instance.getSteps().stream()
                .filter(s -> Objects.equals(s.getStepIndex(), instance.getCurrentStepIndex()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Current workflow step not found"));

        if (!Objects.equals(current.getApprover().getId(), approverId)) {
            throw new IllegalStateException("You are not the current approver for this workflow");
        }
        if (current.getStatus() != WorkflowStepStatus.PENDING) {
            throw new IllegalStateException("Current workflow step is already decided");
        }
        return current;
    }

    private CreatorWorkflowStatusDTO toCreatorStatusDto(WorkflowInstance wi) {
        String targetBuilderName = wi.getTargetBuilder().getName();
        if (targetBuilderName == null || targetBuilderName.isBlank()) targetBuilderName = wi.getTargetBuilder().getUsername();

        return CreatorWorkflowStatusDTO.builder()
                .workflowId(wi.getId())
                .formId(wi.getForm().getId())
                .formName(wi.getForm().getName())
                .currentStep(wi.getCurrentStepIndex())
                .totalSteps(wi.getTotalSteps())
                .targetBuilderName(targetBuilderName)
                .status(mapDecisionStatus(wi))
                .submittedAt(wi.getCreatedAt())
                .lastUpdatedAt(wi.getUpdatedAt())
                .build();
    }

    private BuilderReviewDTO toBuilderReviewDto(WorkflowStep step) {
        return toBuilderReviewDtoFromInstance(step.getInstance(), step.getApprover().getId());
    }

    private BuilderReviewDTO toBuilderReviewDtoFromInstance(WorkflowInstance wi, Integer actorUserId) {
        String creatorName = wi.getCreator().getName();
        if (creatorName == null || creatorName.isBlank()) {
            creatorName = wi.getCreator().getUsername();
        }

        String targetBuilderName = wi.getTargetBuilder().getName();
        if (targetBuilderName == null || targetBuilderName.isBlank()) targetBuilderName = wi.getTargetBuilder().getUsername();

        return BuilderReviewDTO.builder()
                .workflowId(wi.getId())
                .formId(wi.getForm().getId())
                .formName(wi.getForm().getName())
                .creatorName(creatorName)
                .currentStep(wi.getCurrentStepIndex())
                .totalSteps(wi.getTotalSteps())
                .targetBuilderName(targetBuilderName)
                .submittedAt(wi.getCreatedAt())
                .status(mapDecisionStatus(wi))
                .canAction(isCurrentApprover(wi, actorUserId))
                .build();
    }

    private boolean isCurrentApprover(WorkflowInstance wi, Integer userId) {
        if (wi.getStatus() != WorkflowInstanceStatus.ACTIVE) return false;
        return wi.getSteps().stream()
                .anyMatch(s -> Objects.equals(s.getStepIndex(), wi.getCurrentStepIndex())
                        && Objects.equals(s.getApprover().getId(), userId)
                        && s.getStatus() == WorkflowStepStatus.PENDING);
    }

    private AdminWorkflowStatusDTO toAdminStatusDto(WorkflowInstance wi) {
        WorkflowStep current = wi.getSteps().stream()
                .filter(s -> Objects.equals(s.getStepIndex(), wi.getCurrentStepIndex()))
                .findFirst()
                .orElse(null);

        String creatorName = wi.getCreator().getName();
        if (creatorName == null || creatorName.isBlank()) creatorName = wi.getCreator().getUsername();

        String currentApprover = null;
        if (current != null && current.getApprover() != null) {
            currentApprover = current.getApprover().getName();
            if (currentApprover == null || currentApprover.isBlank()) {
                currentApprover = current.getApprover().getUsername();
            }
        }

        String targetBuilderName = wi.getTargetBuilder().getName();
        if (targetBuilderName == null || targetBuilderName.isBlank()) targetBuilderName = wi.getTargetBuilder().getUsername();

        return AdminWorkflowStatusDTO.builder()
                .workflowId(wi.getId())
                .formId(wi.getForm().getId())
                .formName(wi.getForm().getName())
                .creator(creatorName)
                .currentApprover(currentApprover)
                .workflowStep(wi.getCurrentStepIndex())
                .totalSteps(wi.getTotalSteps())
                .targetBuilderName(targetBuilderName)
                .status(mapDecisionStatus(wi))
                .createdAt(wi.getCreatedAt())
                .updatedAt(wi.getUpdatedAt())
                .build();
    }

    private String mapDecisionStatus(WorkflowInstance status) {
        if (status.getStatus() == WorkflowInstanceStatus.COMPLETED) return "APPROVED";
        if (status.getStatus() == WorkflowInstanceStatus.REJECTED) return "REJECTED";
        if (status.getStatus() == WorkflowInstanceStatus.ACTIVE) return "PENDING";
        return "PENDING";
    }
}
