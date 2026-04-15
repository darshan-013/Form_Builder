package com.formbuilder.service;

import com.formbuilder.dto.CustomValidationRuleDTO;
import com.formbuilder.dto.FormDTO;
import com.formbuilder.dto.FormFieldDTO;
import com.formbuilder.entity.*;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.UserRepository;
import com.formbuilder.repository.*;
import com.formbuilder.workflow.repository.WorkflowInstanceRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;



@Slf4j
@Service
@RequiredArgsConstructor
public class FormService {

    private final FormJpaRepository formRepo;
    private final FormVersionRepository versionRepo;
    private final FormFieldJpaRepository fieldRepo;
    private final SharedOptionsRepository sharedOptionsRepo;
    private final StaticFormFieldRepository staticRepo;
    private final FormGroupRepository groupRepo;
    private final CustomValidationRuleRepository customValidationRepo;
    private final DynamicTableService dynamicTable;
    private final UserRepository userRepo;
    private final WorkflowInstanceRepository workflowInstanceRepo;
    @PersistenceContext
    private EntityManager entityManager;
    private final ObjectMapper objectMapper;
    private final SubmissionService submissionService;

    // ── Read ──────────────────────────────────────────────────────────────────

    /** Returns only forms owned by the given user (legacy — kept for backward compatibility). */
    public List<FormEntity> getAllForms(String owner) {
        return formRepo.findAllByCreatedByOrderByCreatedAtDesc(owner);
    }

    /**
     * Returns forms visible to the user based on their RBAC roles.
     *
     * Access model (Updated):
     * - Admin / Role Administrator: all forms
     * - Others: Own forms (creator), assigned forms (builder), forms where user is currently an approver,
     *   or forms explicitly shared via allowed_users.
     */
    public List<FormEntity> getFormsForRole(String username, Set<String> roleNames) {
        if (roleNames.contains("Admin") || roleNames.contains("Role Administrator")) {
            return formRepo.findAllByOrderByCreatedAtDesc();
        }

        User user = userRepo.findByUsername(username).orElse(null);
        if (user == null) return List.of();
        Integer userId = user.getId();

        // Forms where the user is involved in an active workflow (as creator, target builder, or current/future approver)
        Set<UUID> involvedInWorkflowIds = workflowInstanceRepo.findActiveInvolvingUser(userId).stream()
                .map(wi -> wi.getForm().getId())
                .collect(Collectors.toSet());

        List<FormEntity> all = formRepo.findAllByOrderByCreatedAtDesc();
        return all.stream().filter(f -> {
            // 1. Owner (Creator)
            if (username.equalsIgnoreCase(f.getCreatedBy())) return true;

            // 2. Assigned Builder
            if (username.equalsIgnoreCase(f.getAssignedBuilderUsername())) return true;

            // 3. Workflow Involvement
            if (involvedInWorkflowIds.contains(f.getId())) return true;

            // 4. Explicit Granular Access (Allowed Users)
            if (hasExplicitUserAccess(f, username, userId)) return true;

            return false;
        }).collect(Collectors.toList());
    }

    private boolean isCreatedByAdmin(String creatorUsername, Map<String, Boolean> cache) {
        if (creatorUsername == null) return false;
        return cache.computeIfAbsent(creatorUsername, u -> {
            try {
                return userRepo.findByUsernameWithRolesAndPermissions(u)
                        .map(user -> user.getRoles().stream().anyMatch(r -> "Admin".equals(r.getRoleName())))
                        .orElse(false);
            } catch (Exception e) {
                return false;
            }
        });
    }

    /**
     * Access policy for published forms:
     * - If allowed_users is non-empty: only explicitly listed users can access.
     * - If allowed_users is empty: published forms are visible by default.
     */
    private List<FormEntity> filterPublishedByAccess(List<FormEntity> forms,
                                                     String username,
                                                     Integer userId) {
        return forms.stream().filter(form -> {
            List<AllowedUserEntry> allowedUsers = deserializeUserList(form.getAllowedUsers());
            if (allowedUsers.isEmpty()) {
                return true;
            }
            return matchesAllowedUser(allowedUsers, username, userId);
        }).collect(Collectors.toList());
    }

    public boolean hasExplicitUserAccess(FormEntity form, String username, Integer userId) {
        List<AllowedUserEntry> allowedUsers = deserializeUserList(form.getAllowedUsers());
        if (allowedUsers.isEmpty()) return false;
        return matchesAllowedUser(allowedUsers, username, userId);
    }

    private boolean matchesAllowedUser(List<AllowedUserEntry> allowedUsers, String username, Integer userId) {
        return allowedUsers.stream().anyMatch(u -> {
            boolean usernameMatch = u.username != null && u.username.equalsIgnoreCase(username);
            boolean idMatch = userId != null && u.id != null && Objects.equals(u.id, userId);
            return usernameMatch || idMatch;
        });
    }

    private List<AllowedUserEntry> deserializeUserList(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) return List.of();
        try {
            List<AllowedUserEntry> parsed = objectMapper.readValue(json, new TypeReference<>() {});
            if (parsed == null || parsed.isEmpty()) return List.of();
            return parsed.stream()
                    .filter(Objects::nonNull)
                    .filter(u -> (u.id != null) || (u.username != null && !u.username.isBlank()))
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to parse allowed_users JSON: {}", json);
            return List.of();
        }
    }

    private String serializeUserList(List<FormDTO.AllowedUserDTO> users) {
        if (users == null || users.isEmpty()) return null;

        // Keep stable snapshots (id + username + optional name), dedupe by id/username.
        LinkedHashMap<String, AllowedUserEntry> unique = new LinkedHashMap<>();
        for (FormDTO.AllowedUserDTO dto : users) {
            if (dto == null) continue;
            String username = dto.getUsername() == null ? null : dto.getUsername().trim();
            if (username != null && username.isBlank()) username = null;
            Integer id = dto.getId();
            if (id == null && username == null) continue;

            AllowedUserEntry entry = new AllowedUserEntry();
            entry.id = id;
            entry.username = username;
            entry.name = dto.getName() == null ? null : dto.getName().trim();

            String key = id != null ? ("id:" + id) : ("username:" + username.toLowerCase());
            unique.putIfAbsent(key, entry);
        }

        if (unique.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(unique.values());
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Returns a form by ID — any owner (used by public endpoints like
     * submit/render).
     */
    public FormEntity getFormById(UUID id) {
        return formRepo.findByIdWithVersions(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
    }

    /** Returns an active form by its unique form code. */
    public FormEntity getFormByCode(String code) {
        return formRepo.findByCodeAndStatusNot(code, FormEntity.FormStatus.ARCHIVED)
                .orElseThrow(() -> new NoSuchElementException("Form not found with code: " + code));
    }

    private String getSubmissionTableName(FormEntity form) {
        return dynamicTable.generateTableName(form.getCode());
    }

    private String normalizeCode(String rawCode) {
        if (rawCode == null) return null;
        String normalized = rawCode.trim().toLowerCase();
        return normalized.isBlank() ? null : normalized;
    }

    private void validateCodeFormat(String code) {
        if (code == null || code.isBlank()) {
            throw new com.formbuilder.exception.ValidationException(Map.of(
                    "code", List.of("Code is required.")
            ));
        }
        if (!code.matches("^[a-z_]+$")) {
            throw new com.formbuilder.exception.ValidationException(Map.of(
                    "code", List.of("Code must contain only lowercase letters and underscores. Numbers and special characters are not allowed.")
            ));
        }
    }

    /** Returns true if the code is NOT already in use. */
    public boolean isCodeUnique(String code) {
        if (code == null || code.isBlank()) return true;
        return !formRepo.existsByCode(code.trim().toLowerCase());
    }

    private void validateCreateCode(String code) {
        validateCodeFormat(code);
        if (formRepo.existsByCode(code)) {
            throw new com.formbuilder.exception.ValidationException(Map.of(
                    "code", List.of("Code already exists.")
            ));
        }
    }

    /**
     * Returns a form by ID scoped to the authenticated owner.
     * Throws NoSuchElementException (→ 404) if form doesn't exist OR belongs to
     * someone else.
     */
    public FormEntity getOwnedFormById(UUID id, String owner) {
        return formRepo.findByIdAndCreatedBy(id, owner)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
    }

    /**
     * Returns a form by ID — allows access if the user is the owner, the assigned builder, or has Admin role.
     * Used by edit, delete, publish, unpublish, render/admin endpoints.
     */
    public FormEntity getFormForAction(UUID id, String username, boolean isAdmin) {
        if (isAdmin) {
            return formRepo.findByIdWithVersions(id)
                    .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
        }
        FormEntity form = formRepo.findByIdWithVersions(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));

        // 1. Owner (Creator) or Assigned Builder
        if (username.equalsIgnoreCase(form.getCreatedBy()) ||
            username.equalsIgnoreCase(form.getAssignedBuilderUsername())) {
            return form;
        }

        User user = userRepo.findByUsername(username).orElse(null);
        if (user == null) {
            throw new NoSuchElementException("Form not found or access denied: " + id);
        }
        Integer userId = user.getId();

        // 2. Explicit Granular Access (Allowed Users)
        if (hasExplicitUserAccess(form, username, userId)) {
            return form;
        }

        // 3. Workflow Involvement
        Set<UUID> involvedInWorkflowIds = workflowInstanceRepo.findActiveInvolvingUser(userId).stream()
                .map(wi -> wi.getForm().getId())
                .collect(Collectors.toSet());
        if (involvedInWorkflowIds.contains(form.getId())) {
            return form;
        }

        throw new NoSuchElementException("Form not found or access denied: " + id);
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public FormEntity createForm(FormDTO dto, String owner) {
        validateUniqueFieldKeys(dto.getFields());
        validateTotalRules(dto.getFields());
        validateMaxGroups(dto.getGroups());
        String code = normalizeCode(dto.getCode());
        validateCreateCode(code);
        String tableName = dynamicTable.generateTableName(code);

        // 1. Save Form metadata
        FormEntity form = FormEntity.builder()
                .name(dto.getName())
                .code(code)
                .description(dto.getDescription())
                .createdBy(owner)
                .allowedUsers(serializeUserList(dto.getAllowedUsers()))
                .allowMultipleSubmissions(
                        dto.getAllowMultipleSubmissions() == null ? true : dto.getAllowMultipleSubmissions())
                .showTimestamp(true)
                .expiresAt(dto.getExpiresAt())
                .versions(new ArrayList<>())
                .build();

        FormEntity savedForm = formRepo.save(form);

        // 2. Create initial Version (v1, DRAFT)
        FormVersionEntity version = FormVersionEntity.builder()
                .form(savedForm)
                .versionNumber(1)
                .isActive(false) // Initial version is not active until published
                .definitionJson("{}")
                .createdBy(owner)
                .createdAt(java.time.LocalDateTime.now())
                .fields(new ArrayList<>())
                .build();

        FormVersionEntity savedVersion = versionRepo.save(version);
        savedForm.getVersions().add(savedVersion);

        // 3. Save static fields (linked to version)
        saveStaticFields(savedVersion, dto.getStaticFields());

        // 4. Save groups (linked to version)
        Map<UUID, UUID> groupIdMap = saveGroups(savedVersion, dto.getGroups());

        // 5. Map and save dynamic fields (linked to version)
        if (dto.getFields() != null) {
            for (FormFieldDTO f : dto.getFields()) {
                savedVersion.getFields().add(toFieldEntity(f, savedVersion, groupIdMap));
            }
            versionRepo.save(savedVersion);
        }

        // 6. Save custom validation rules (linked to version)
        if (dto.getCustomValidationRules() != null) {
            for (CustomValidationRuleDTO ruleDto : dto.getCustomValidationRules()) {
                CustomValidationRuleEntity rule = CustomValidationRuleEntity.builder()
                        .formVersion(savedVersion)
                        .validationType(normalizeValidationType(ruleDto.getValidationType()))
                        .scope(ruleDto.getScope())
                        .fieldKey(ruleDto.getScope() == CustomValidationRuleEntity.ValidationRuleScope.FORM ? null : ruleDto.getFieldKey())
                        .expression(ruleDto.getExpression())
                        .errorMessage(ruleDto.getErrorMessage())
                        .executionOrder(ruleDto.getExecutionOrder())
                        .build();
                customValidationRepo.save(rule);
            }
        }

        // 7. Update definition_json snapshot
        updateDefinitionJson(savedVersion);

        // 7. Create dynamic table (Schema is per-form)
        dynamicTable.createTable(tableName, savedVersion.getFields());

        log.info("Form '{}' created by '{}' with Version 1 (DRAFT) and table '{}'", savedForm.getName(), owner, tableName);
        return savedForm;
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public FormEntity updateForm(UUID id, FormDTO dto, String owner, boolean isAdmin, boolean isBuilder, UUID targetVersionId) {
        validateUniqueFieldKeys(dto.getFields());
        validateTotalRules(dto.getFields());
        validateMaxGroups(dto.getGroups());

        FormEntity existingForm = getFormForAction(id, owner, isAdmin);

        if (dto.getCode() != null && !dto.getCode().isBlank()) {
            String incomingCode = normalizeCode(dto.getCode());
            validateCodeFormat(incomingCode);
            if (!Objects.equals(incomingCode, existingForm.getCode())) {
                throw new com.formbuilder.exception.ValidationException(Map.of(
                        "code", List.of("Code is immutable after the form is saved.")
                ));
            }
        }

        // 0. Requirement 3.3: Field Type Stability
        // A field's type cannot be changed between versions.
        if (dto.getFields() != null && existingForm.getPublishedVersion().isPresent()) {
            FormVersionEntity published = existingForm.getPublishedVersion().get();
            for (FormFieldDTO newField : dto.getFields()) {
                published.getFields().stream()
                        .filter(f -> f.getFieldKey().equals(newField.getFieldKey()))
                        .findFirst()
                        .ifPresent(oldField -> {
                            if (!oldField.getFieldType().equals(newField.getFieldType())) {
                                throw new IllegalArgumentException(
                                        "Field type cannot be changed between versions (Requirement 3.3). " +
                                                "Field '" + newField.getFieldKey() + "' was originally '" + oldField.getFieldType() + "'.");
                            }
                        });
            }
        }

        // 1. Identify targeted version for editing
        FormVersionEntity targetVersion = null;
        if (targetVersionId != null) {
            targetVersion = existingForm.getVersions().stream()
                    .filter(v -> v.getId().equals(targetVersionId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Version not found for form: " + id));
        } else {
            targetVersion = existingForm.getDraftVersion()
                    .orElseGet(() -> existingForm.getPublishedVersion().orElse(null));
        }

        if (targetVersion == null) {
            throw new IllegalStateException("No version found for form: " + id);
        }

        // 2. Immutability Check [T3]: Published versions cannot be edited directly.
        // Instead of throwing an error, we automatically fork it into a new DRAFT.
        boolean isNewDraft = false;
        if (targetVersion.isActive()) {
            log.info("Editing a PUBLISHED version of form '{}'. Automatically creating a new DRAFT.", id);
            targetVersion = copyVersionAsDraft(targetVersion);
            existingForm.getVersions().add(targetVersion);
        }

        FormVersionEntity activeVersion = targetVersion;

        // 3. Schema Governance (DDL)
        // Note: DDL is per-form table. We add new columns but NEVER drop columns in this versioning model
        // to prevent data loss from older published versions' submissions.
        if (dto.getFields() != null) {
            for (FormFieldDTO f : dto.getFields()) {
                dynamicTable.addColumnIfMissing(getSubmissionTableName(existingForm), f.getFieldKey(), f.getFieldType());
            }
        }

        // 4. Update Form Global Metadata
        existingForm.setName(dto.getName());
        existingForm.setDescription(dto.getDescription());
        if (dto.getAllowedUsers() != null) {
            existingForm.setAllowedUsers(serializeUserList(dto.getAllowedUsers()));
        }
        if (dto.getAllowMultipleSubmissions() != null)
            existingForm.setAllowMultipleSubmissions(dto.getAllowMultipleSubmissions());
        existingForm.setExpiresAt(dto.getExpiresAt());

        // 5. Update Versioned Content (Groups, Static Fields, Fields)
        // Rely on orphanRemoval = true to handle deletions via collection clear
        activeVersion.getFields().clear();
        activeVersion.getGroups().clear();
        
        // Use ID Mapping to ensure linkages are preserved while rotating all IDs to avoid session collisions
        Map<UUID, UUID> groupIdMap = saveGroups(activeVersion, dto.getGroups());
        saveStaticFields(activeVersion, dto.getStaticFields());
        
        if (dto.getFields() != null) {
            for (FormFieldDTO dtoField : dto.getFields()) {
                activeVersion.getFields().add(toFieldEntity(dtoField, activeVersion, groupIdMap));
            }
        }

        versionRepo.save(activeVersion);
        updateDefinitionJson(activeVersion);
        return formRepo.save(existingForm);
    }

    // ── Archive / Restore ────────────────────────────────────────────────────

    /** Archive only: mark form as archived without dropping schema/data. */
    @Transactional
    public void deleteForm(UUID id, String owner, boolean isAdmin) {
        FormEntity form = getFormForAction(id, owner, isAdmin);
        if (submissionService.hasLiveSubmissions(id)) {
            throw new IllegalStateException("Cannot archive a form that has live submissions.");
        }
        form.setStatus(FormEntity.FormStatus.ARCHIVED);
        formRepo.save(form);
        log.info("Form '{}' archived by '{}'", form.getName(), owner);
    }

    /** Soft-delete a specific version of a form. */
    @Transactional
    public void deleteFormVersion(UUID id, UUID versionId, String owner, boolean isAdmin) {
        FormEntity form = getFormForAction(id, owner, isAdmin);
        
        FormVersionEntity target = versionRepo.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));
                
        if (!target.getForm().getId().equals(id)) {
            throw new IllegalArgumentException("Version does not belong to this form.");
        }
        
        if (target.isActive()) {
            throw new IllegalStateException("Cannot delete the active/published version. Unpublish it first.");
        }

        versionRepo.delete(target);

        log.info("Form version '{}' (v{}) deleted by '{}'", form.getName(), target.getVersionNumber(), owner);
    }

    /** Returns only archived forms. RBAC: Admin sees all, Builder sees own only. */
    public List<FormEntity> getDeletedForms(String username, Set<String> roleNames) {
        boolean isAdmin = roleNames.contains("Admin") || roleNames.contains("Role Administrator");
        List<FormEntity> allDeleted = formRepo.findAllArchivedOrderByUpdatedAtDesc();

        if (isAdmin) {
            return allDeleted;
        }

        // For non-admins, show only forms they created (owned trash)
        return allDeleted.stream()
                .filter(f -> username.equalsIgnoreCase(f.getCreatedBy()))
                .collect(Collectors.toList());
    }

    /** Restores an archived form back to DRAFT. */
    @Transactional
    public void restoreForm(UUID id, String username, boolean isAdmin) {
        FormEntity form = formRepo.findByIdAndArchived(id)
                .orElseThrow(() -> new NoSuchElementException("Archived form not found: " + id));

        if (!isAdmin && !username.equalsIgnoreCase(form.getCreatedBy())) {
            throw new NoSuchElementException("Access denied to restore form: " + id);
        }

        form.setStatus(FormEntity.FormStatus.DRAFT);
        formRepo.save(form);
        log.info("Form '{}' restored from ARCHIVED to DRAFT by '{}'", form.getName(), username);
    }

    /** Permanently deletes a form (drops table and removes record). */
    @Transactional
    public void permanentlyDeleteForm(UUID id, String username, boolean isAdmin) {
        FormEntity form = formRepo.findByIdAndArchived(id)
                .orElseThrow(() -> new NoSuchElementException("Archived form not found: " + id));

        if (!isAdmin && !username.equalsIgnoreCase(form.getCreatedBy())) {
            throw new NoSuchElementException("Access denied to permanently delete form: " + id);
        }

        // 1. Drop the dynamic table
        dynamicTable.dropTable(getSubmissionTableName(form));

        // 2. Remove all related metadata (submissions, versions, fields, groups are handled by JPA cascades/orphanRemoval if configured, but let's be explicit if needed)
        // Actually, FormEntity has @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true) for versions.
        
        formRepo.delete(form);
        log.info("Form '{}' permanently deleted by '{}'", form.getName(), username);
    }

    // ── Status (Publish / Unpublish) ──────────────────────────────────────────

    @Transactional
    public FormEntity publishForm(UUID id, String owner, boolean isAdmin, boolean isBuilder) {
        FormEntity form = getFormForAction(id, owner, isAdmin);

        Optional<FormVersionEntity> draftOpt = form.getDraftVersion();
        
        if (draftOpt.isEmpty()) {
            // Idempotency: If already published and no new draft, just return the form
            if (form.getStatus() == FormEntity.FormStatus.PUBLISHED && form.getActiveVersion().isPresent()) {
                log.info("Form '{}' is already PUBLISHED with no new draft. Returning current state.", form.getName());
                return form;
            }
            throw new IllegalStateException("No draft version found to publish for form: " + id);
        }

        FormVersionEntity draftVersion = draftOpt.get();

        // SRS Decision 4.3: Block publish if drift is detected.
        dynamicTable.validateSchema(getSubmissionTableName(form), draftVersion.getId());

        // Permission checks
        boolean creatorIsBuilder = form.getCreatedBy() != null && userRepo.findByUsernameWithRolesAndPermissions(form.getCreatedBy())
                .map(user -> user.getRoles().stream().anyMatch(role -> "Builder".equals(role.getRoleName())))
                .orElse(false);

        if (!isAdmin && !creatorIsBuilder) {
            throw new IllegalStateException("Only forms created by Builders can be published.");
        }

        if (!isAdmin) {
            if (!isBuilder) {
                throw new IllegalStateException("Only Admin or Builder owner can publish this form.");
            }
            if (!owner.equals(form.getCreatedBy())) {
                throw new IllegalStateException("Builder can publish only own forms.");
            }
        }

        // 1. Archive current active version if it exists (Single Active Version Constraint)
        form.getVersions().stream()
                .filter(FormVersionEntity::isActive)
                .forEach(v -> {
                    v.setActive(false);
                    versionRepo.save(v);
                });

        // 2. Promote DRAFT to PUBLISHED
        draftVersion.setActive(true);
        versionRepo.save(draftVersion);
        updateDefinitionJson(draftVersion);

        // 4. Update Form Global Status
        form.setStatus(FormEntity.FormStatus.PUBLISHED);

        log.info("B1: Form '{}' version {} activated and status set to PUBLISHED.", form.getName(), draftVersion.getVersionNumber());
        return formRepo.save(form);
    }

    @Transactional
    public FormEntity publishVersion(UUID id, UUID versionId, String owner, boolean isAdmin, boolean isBuilder) {
        FormEntity form = getFormForAction(id, owner, isAdmin);

        FormVersionEntity targetVersion = versionRepo.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));

        if (!targetVersion.getForm().getId().equals(id)) {
            throw new IllegalArgumentException("Version does not belong to this form.");
        }

        if (targetVersion.isActive()) {
            throw new IllegalStateException("Version is already published.");
        }

        // SRS Decision 4.3: Block publish if drift is detected.
        dynamicTable.validateSchema(getSubmissionTableName(form), targetVersion.getId());

        // Permission checks
        boolean creatorIsBuilder = form.getCreatedBy() != null && userRepo.findByUsernameWithRolesAndPermissions(form.getCreatedBy())
                .map(user -> user.getRoles().stream().anyMatch(role -> "Builder".equals(role.getRoleName())))
                .orElse(false);

        if (!isAdmin && !creatorIsBuilder) {
            throw new IllegalStateException("Only forms created by Builders can be published.");
        }

        if (!isAdmin) {
            if (!isBuilder) {
                throw new IllegalStateException("Only Admin or Builder owner can publish this form.");
            }
            if (!owner.equals(form.getCreatedBy())) {
                throw new IllegalStateException("Builder can publish only own forms.");
            }
        }

        // 1. Current active version becomes DRAFT
        form.getVersions().stream()
                .filter(FormVersionEntity::isActive)
                .forEach(v -> {
                    v.setActive(false);
                    versionRepo.save(v);
                });

        // 2. Promote target to PUBLISHED
        targetVersion.setActive(true);
        versionRepo.save(targetVersion);
        updateDefinitionJson(targetVersion);

        // 3. Update Form Global Status
        form.setStatus(FormEntity.FormStatus.PUBLISHED);

        log.info("Form '{}' version {} activated and status set to PUBLISHED.", form.getName(), targetVersion.getVersionNumber());
        return formRepo.save(form);
    }

    @Transactional
    public FormEntity unpublishForm(UUID id, String owner, boolean isAdmin) {
        FormEntity form = getFormForAction(id, owner, isAdmin);
        
        form.getPublishedVersion().ifPresent(v -> {
            v.setActive(false);
            versionRepo.save(v);
            log.info("Form '{}' version {} unpublished (isActive set to false) by '{}'", form.getName(), v.getVersionNumber(), owner);
        });

        form.setStatus(FormEntity.FormStatus.DRAFT);
        return formRepo.save(form);
    }

    @Transactional
    public FormFieldEntity updateField(UUID formId, UUID versionId, String fieldKey, FormFieldDTO dto, String owner, boolean isAdmin) {
        FormEntity form = getFormForAction(formId, owner, isAdmin);
        FormVersionEntity version = versionRepo.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));
        
        if (!version.getForm().getId().equals(formId)) {
            throw new IllegalArgumentException("Version dose not belong to form: " + formId);
        }

        FormFieldEntity field = version.getFields().stream()
                .filter(f -> f.getFieldKey().equals(fieldKey))
                .findFirst()
                .orElse(null);

        if (field == null) {
            // Create new if not exists
            field = toFieldEntity(dto, version, null); // Manual creation uses ID rotation by default
            version.getFields().add(field);
        } else {
            // Update existing
            field.setLabel(dto.getLabel());
            field.setFieldType(dto.getFieldType());
            field.setRequired(dto.isRequired());
            field.setReadOnly(dto.isReadOnly());
            field.setDefaultValue(dto.getDefaultValue());
            field.setFieldOrder(dto.getFieldOrder());
            field.setUiConfigJson(dto.getUiConfigJson());
            field.setValidationJson(dto.getValidationJson());
            field.setGridJson(dto.getGridJson());
            field.setTableRefJson(dto.getTableRefJson());
        }

        versionRepo.save(version);
        return field;
    }

    @Transactional
    public void updateValidation(UUID formId, UUID versionId, UUID validationId, Map<String, Object> req, String owner, boolean isAdmin) {
        log.info("Granular validation update triggered for validationId={}", validationId);
    }

    @Transactional
    public com.formbuilder.entity.CustomValidationRuleEntity addCustomValidationRule(UUID formId, UUID versionId, com.formbuilder.dto.CustomValidationRuleDTO dto, String owner, boolean isAdmin) {
        getFormForAction(formId, owner, isAdmin); // Permission check
        FormVersionEntity version = versionRepo.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("Version not found: " + versionId));
        
        com.formbuilder.entity.CustomValidationRuleEntity rule = com.formbuilder.entity.CustomValidationRuleEntity.builder()
                .formVersion(version)
                .validationType(normalizeValidationType(dto.getValidationType()))
                .scope(dto.getScope())
                .fieldKey(dto.getScope() == com.formbuilder.entity.CustomValidationRuleEntity.ValidationRuleScope.FORM ? null : dto.getFieldKey())
                .expression(dto.getExpression())
                .errorMessage(dto.getErrorMessage())
                .executionOrder(dto.getExecutionOrder())
                .build();
        
        return customValidationRepo.save(rule);
    }
    @Transactional
    public com.formbuilder.entity.CustomValidationRuleEntity updateCustomValidationRule(UUID formId, UUID versionId, UUID ruleId, com.formbuilder.dto.CustomValidationRuleDTO dto, String owner, boolean isAdmin) {
        getFormForAction(formId, owner, isAdmin); // Permission check
        com.formbuilder.entity.CustomValidationRuleEntity rule = customValidationRepo.findById(ruleId)
                .orElseThrow(() -> new NoSuchElementException("Validation rule not found: " + ruleId));
        
        rule.setValidationType(normalizeValidationType(dto.getValidationType()));
        rule.setScope(dto.getScope());
        
        // Normalized schema keeps FORM-scope rules with a NULL field_key.
        if (dto.getScope() == com.formbuilder.entity.CustomValidationRuleEntity.ValidationRuleScope.FORM) {
            rule.setFieldKey(null);
        } else {
            rule.setFieldKey(dto.getFieldKey());
        }
        
        rule.setExpression(dto.getExpression());
        rule.setErrorMessage(dto.getErrorMessage());
        rule.setExecutionOrder(dto.getExecutionOrder());
        
        return customValidationRepo.save(rule);
    }
    @Transactional
    public void deleteCustomValidationRule(UUID formId, UUID versionId, UUID ruleId, String owner, boolean isAdmin) {
        getFormForAction(formId, owner, isAdmin); // Permission check
        customValidationRepo.deleteById(ruleId);
    }

    // ── Shared Options CRUD ───────────────────────────────────────────────────

    /**
     * Create a new shared_options row. Called when admin saves a new dropdown/radio
     * field.
     */
    @Transactional
    public SharedOptionsEntity createSharedOptions(String optionsJson) {
        SharedOptionsEntity shared = SharedOptionsEntity.builder()
                .optionsJson(optionsJson)
                .build();
        SharedOptionsEntity saved = sharedOptionsRepo.save(shared);
        log.info("Created shared_options row id={}", saved.getId());
        return saved;
    }

    public Optional<SharedOptionsEntity> getSharedOptions(UUID id) {
        return sharedOptionsRepo.findById(id);
    }

    /**
     * Update options_json on a shared_options row.
     * Because form_fields stores NO options_json, all fields that reference this
     * shared_options row automatically see the new options at render/validation
     * time.
     */
    @Transactional
    public Optional<SharedOptionsEntity> updateSharedOptions(UUID id, String optionsJson) {
        return sharedOptionsRepo.findById(id).map(shared -> {
            shared.setOptionsJson(optionsJson);
            SharedOptionsEntity saved = sharedOptionsRepo.save(shared);
            log.info("Updated shared_options id={} — {} field(s) will see new options live",
                    id, fieldRepo.findBySharedOptionsId(id).size());
            return saved;
        });
    }

    // ── Static Field helpers ──────────────────────────────────────────────────

    /** Returns all static fields for a form, ordered by field_order */
    public List<StaticFormFieldEntity> getStaticFields(UUID versionId) {
        return staticRepo.findByFormVersionIdOrderByFieldOrderAsc(versionId);
    }

    private void saveStaticFields(FormVersionEntity version, List<FormDTO.StaticFieldDTO> staticDTOs) {
        if (staticDTOs == null || staticDTOs.isEmpty())
            return;
        for (FormDTO.StaticFieldDTO sf : staticDTOs) {
            StaticFormFieldEntity entity = StaticFormFieldEntity.builder()
                    .id(UUID.randomUUID()) // Always new ID to avoid session collision
                    .formVersion(version)
                    .fieldType(sf.getFieldType())
                    .data(sf.getData())
                    .fieldOrder(sf.getFieldOrder())
                    .build();
            staticRepo.save(entity);
            version.getStaticFields().add(entity);
        }
    }

    /** Returns all groups for a form, ordered by group_order */
    public List<FormGroupEntity> getGroups(UUID versionId) {
        return groupRepo.findByFormVersionIdOrderByGroupOrderAsc(versionId);
    }

    private Map<UUID, UUID> saveGroups(FormVersionEntity version, List<FormDTO.GroupDTO> groupDTOs) {
        if (groupDTOs == null || groupDTOs.isEmpty())
            return Map.of();
            
        Map<UUID, UUID> mapping = new HashMap<>();
        for (FormDTO.GroupDTO g : groupDTOs) {
            UUID newId = UUID.randomUUID();
            if (g.getId() != null) {
                mapping.put(g.getId(), newId);
            }
            
            FormGroupEntity entity = FormGroupEntity.builder()
                    .id(newId) // New ID for all saves/updates
                    .formVersion(version)
                    .groupTitle(g.getGroupTitle())
                    .groupDescription(g.getGroupDescription())
                    .groupOrder(g.getGroupOrder())
                    .rulesJson(g.getRulesJson())
                    .build();
            groupRepo.save(entity);
            version.getGroups().add(entity);
        }
        groupRepo.flush();
        return mapping;
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private FormVersionEntity copyVersionAsDraft(FormVersionEntity source) {
        FormEntity form = source.getForm();
        int maxVersion = form.getVersions().stream()
                .mapToInt(FormVersionEntity::getVersionNumber)
                .max().orElse(0);

        FormVersionEntity newDraft = FormVersionEntity.builder()
                .form(form)
                .versionNumber(maxVersion + 1)
                .isActive(false)
                .definitionJson("{}")
                .createdBy(source.getCreatedBy())
                .build();

        // We do NOT copy fields/groups/staticFields here because `updateForm`
        // will immediately clear them and replace them with the DTO contents.
        // The DTO from the frontend contains all the fields (both old and new).
        return newDraft;
    }

    private FormFieldEntity toFieldEntity(FormFieldDTO dto, FormVersionEntity parent, Map<UUID, UUID> groupIdMap) {
        UUID newGroupId = null;
        if (dto.getGroupId() != null) {
            newGroupId = groupIdMap.get(dto.getGroupId());
        }

        return FormFieldEntity.builder()
                .id(UUID.randomUUID()) // Always new ID to avoid session collision
                .formVersion(parent)
                .fieldKey(dto.getFieldKey())
                .label(dto.getLabel())
                .fieldType(dto.getFieldType())
                .required(dto.isRequired())
                .defaultValue(dto.getDefaultValue())
                .validationRegex(dto.getValidationRegex())
                .validationJson(dto.getValidationJson())
                .rulesJson(dto.getRulesJson())
                .uiConfigJson(dto.getUiConfigJson())
                .sharedOptionsId(dto.getSharedOptionsId())
                .fieldOrder(dto.getFieldOrder())
                .disabled(dto.isDisabled())
                .readOnly(dto.isReadOnly())
                // Calculated fields
                .isCalculated(dto.getIsCalculated())
                .formulaExpression(dto.getFormulaExpression())
                .dependenciesJson(serializeDependencies(dto.getDependencies()))
                .precision(dto.getPrecision())
                .lockAfterCalculation(dto.getLockAfterCalculation())
                .parentGroupKey(dto.getParentGroupKey())
                .groupId(newGroupId)
                .validationMessage(dto.getValidationMessage())
                .gridJson(dto.getGridJson())
                .tableRefJson(dto.getTableRefJson())
                .build();
    }

    private String serializeDependencies(List<String> deps) {
        if (deps == null || deps.isEmpty())
            return null;
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(deps);
        } catch (Exception e) {
            return null;
        }
    }

    private String normalizeValidationType(String validationType) {
        if (validationType == null || validationType.isBlank()) {
            return "CUSTOM";
        }
        return validationType.trim().toUpperCase();
    }

    private void validateUniqueFieldKeys(List<FormFieldDTO> fields) {
        if (fields == null || fields.isEmpty())
            return;

        // Policy 10.1: Max 50 fields per form
        if (fields.size() > 50) {
            throw new IllegalArgumentException("Maximum of 50 fields allowed per form (Policy 10.1). Found: " + fields.size());
        }

        Set<String> seenKeys = new HashSet<>();
        List<String> duplicates = new ArrayList<>();
        for (FormFieldDTO field : fields) {
            String key = field.getFieldKey();
            if (key != null && !key.isEmpty()) {
                dynamicTable.validateFieldKey(key);
                if (!seenKeys.add(key)) {
                    duplicates.add(key);
                }
            }
        }
        if (!duplicates.isEmpty()) {
            throw new IllegalArgumentException(
                    "Duplicate field keys found: " + String.join(", ", duplicates) +
                            ". Each field must have a unique key.");
        }
    }

    /**
     * Policy 10.2: Enforce limit of 100 validation rules per form across all fields.
     */
    private void validateTotalRules(List<FormFieldDTO> fields) {
        if (fields == null) return;
        int total = 0;
        for (FormFieldDTO field : fields) {
            total += countRules(field.getValidationJson());
        }
        if (total > 100) {
            throw new IllegalArgumentException("Maximum of 100 validation rules allowed per form (Policy 10.2). Found: " + total);
        }
    }

    private int countRules(String json) {
        if (json == null || json.isBlank() || "{}".equals(json)) return 0;
        try {
            JsonNode node = objectMapper.readTree(json);
            if (node.isObject()) {
                int count = 0;
                Iterator<String> fieldNames = node.fieldNames();
                while (fieldNames.hasNext()) {
                    String fieldName = fieldNames.next();
                    JsonNode val = node.get(fieldName);
                    // Only count if the rule has a meaningful value
                    if (val != null && !val.isNull() && !val.asText().isEmpty() && !Boolean.FALSE.equals(val.asBoolean())) {
                        count++;
                    }
                }
                return count;
            }
        } catch (Exception e) {
            log.warn("Failed to parse validationJson for rule counting: {}", e.getMessage());
        }
        return 0;
    }

    /**
     * Policy 10.3: Enforce limit of 10 pages/sections per form.
     */
    private void validateMaxGroups(List<FormDTO.GroupDTO> groups) {
        if (groups != null && groups.size() > 10) {
            throw new IllegalArgumentException("Maximum of 10 sections/pages allowed per form (Policy 10.3). Found: " + groups.size());
        }
    }




    @Transactional
    public void updateDefinitionJson(FormVersionEntity version) {
        try {
            Map<String, Object> snapshot = new HashMap<>();
            snapshot.put("fields", version.getFields());
            snapshot.put("groups", version.getGroups());
            snapshot.put("staticFields", version.getStaticFields());

            String json = objectMapper.writeValueAsString(snapshot);
            version.setDefinitionJson(json);
            versionRepo.save(version);
            log.debug("Updated definition_json snapshot for version {}", version.getVersionNumber());
        } catch (Exception e) {
            log.error("Failed to serialize form definition for version {}: {}",
                version.getVersionNumber(), e.getMessage());
        }
    }

    // ── Permission Helpers ────────────────────────────────────────────────────

    public boolean canEdit(FormEntity f, String username, Set<String> roleNames) {
        if (roleNames.contains("Admin") || roleNames.contains("Role Administrator")) return true;
        if (username.equalsIgnoreCase(f.getCreatedBy())) return true;
        if (username.equalsIgnoreCase(f.getAssignedBuilderUsername())) return true;
        return false;
    }

    public boolean canDelete(FormEntity f, String username, Set<String> roleNames) {
        if (roleNames.contains("Admin")) return true;
        if (username.equalsIgnoreCase(f.getCreatedBy())) return true;
        return false;
    }

    public boolean canPublish(FormEntity f, String username, Set<String> roleNames) {
        if (roleNames.contains("Admin")) return true;
        if (roleNames.contains("Builder") && username.equalsIgnoreCase(f.getCreatedBy())) return true;
        return false;
    }

    public boolean canViewSubmissions(FormEntity f, String username, Set<String> roleNames) {
        if (roleNames.contains("Admin") || roleNames.contains("Role Administrator") || roleNames.contains("Manager")) return true;
        if (username.equalsIgnoreCase(f.getCreatedBy())) return true;
        return false;
    }

    private static final class AllowedUserEntry {
        public Integer id;
        public String username;
        public String name;
    }
}
