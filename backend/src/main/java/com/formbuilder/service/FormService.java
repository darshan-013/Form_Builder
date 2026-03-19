package com.formbuilder.service;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.dto.FormFieldDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.entity.FormGroupEntity;
import com.formbuilder.entity.SharedOptionsEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.UserRepository;
import com.formbuilder.repository.FormFieldJpaRepository;
import com.formbuilder.repository.FormGroupRepository;
import com.formbuilder.repository.FormJpaRepository;
import com.formbuilder.repository.SharedOptionsRepository;
import com.formbuilder.repository.StaticFormFieldRepository;
import com.formbuilder.workflow.WorkflowInstance;
import com.formbuilder.workflow.WorkflowInstanceRepository;
import com.formbuilder.workflow.WorkflowInstanceStatus;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class FormService {

    private final FormJpaRepository formRepo;
    private final FormFieldJpaRepository fieldRepo;
    private final SharedOptionsRepository sharedOptionsRepo;
    private final StaticFormFieldRepository staticRepo;
    private final FormGroupRepository groupRepo;
    private final DynamicTableService dynamicTable;
    private final UserRepository userRepo;
    private final WorkflowInstanceRepository workflowInstanceRepo;

    private static final ObjectMapper JSON = new ObjectMapper();

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
            List<AllowedUserEntry> parsed = JSON.readValue(json, new TypeReference<>() {});
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
            return JSON.writeValueAsString(unique.values());
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Returns a form by ID — any owner (used by public endpoints like
     * submit/render).
     */
    public FormEntity getFormById(UUID id) {
        return formRepo.findByIdWithFields(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
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
            return formRepo.findByIdWithFields(id)
                    .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
        }
        FormEntity form = formRepo.findByIdWithFields(id)
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
        String tableName = dynamicTable.generateTableName(dto.getName());

        FormEntity form = FormEntity.builder()
                .name(dto.getName())
                .description(dto.getDescription())
                .tableName(tableName)
                .createdBy(owner)
                .allowedUsers(serializeUserList(dto.getAllowedUsers()))
                .allowMultipleSubmissions(
                        dto.getAllowMultipleSubmissions() == null ? true : dto.getAllowMultipleSubmissions())
                .showTimestamp(true) // always compulsory — timestamp every submission
                .expiresAt(dto.getExpiresAt())
                .fields(new ArrayList<>())
                .build();

        // 1. Initial save of form metadata (to get form.id)
        FormEntity saved = formRepo.save(form);

        // 2. Save static fields (no FK dependencies)
        saveStaticFields(saved.getId(), dto.getStaticFields());

        // 3. Save groups (must exist before dynamic fields reference them)
        saveGroups(saved.getId(), dto.getGroups());
        groupRepo.flush(); // Force groups to DB before saving fields

        // 4. Map and save dynamic fields
        if (dto.getFields() != null) {
            for (FormFieldDTO f : dto.getFields()) {
                saved.getFields().add(toFieldEntity(f, saved));
            }
            // Save again to flush fields with correct IDs
            saved = formRepo.save(saved);
        }

        dynamicTable.createTable(tableName, saved.getFields());

        log.info("Form '{}' created by '{}' with table '{}'", saved.getName(), owner, tableName);
        return saved;
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public FormEntity updateForm(UUID id, FormDTO dto, String owner, boolean isAdmin) {
        validateUniqueFieldKeys(dto.getFields());

        FormEntity existing = getFormForAction(id, owner, isAdmin);

        Map<String, FormFieldEntity> oldByKey = existing.getFields().stream()
                .collect(Collectors.toMap(FormFieldEntity::getFieldKey, f -> f));

        Set<String> newKeys = dto.getFields() != null
                ? dto.getFields().stream().map(FormFieldDTO::getFieldKey).collect(Collectors.toSet())
                : Set.of();

        // DDL: add / alter columns
        if (dto.getFields() != null) {
            for (FormFieldDTO f : dto.getFields()) {
                if (!oldByKey.containsKey(f.getFieldKey())) {
                    dynamicTable.addColumn(existing.getTableName(), f.getFieldKey(), f.getFieldType());
                } else {
                    String oldType = oldByKey.get(f.getFieldKey()).getFieldType();
                    if (!oldType.equals(f.getFieldType())) {
                        dynamicTable.alterColumnType(existing.getTableName(), f.getFieldKey(), f.getFieldType());
                    }
                }
            }
        }
        // DDL: drop removed columns
        for (String key : oldByKey.keySet()) {
            if (!newKeys.contains(key)) {
                dynamicTable.dropColumn(existing.getTableName(), key);
            }
        }

        // 1. Replace all static fields
        staticRepo.deleteByFormId(existing.getId());
        saveStaticFields(existing.getId(), dto.getStaticFields());

        // 2. Replace all groups (must exist before fields reference them)
        groupRepo.deleteByFormId(existing.getId());
        groupRepo.flush(); // Force delete to DB
        saveGroups(existing.getId(), dto.getGroups());
        groupRepo.flush(); // Force inserts to DB

        // 3. Update form metadata and fields
        existing.setName(dto.getName());
        existing.setDescription(dto.getDescription());
        if (dto.getAllowedUsers() != null) {
            existing.setAllowedUsers(serializeUserList(dto.getAllowedUsers()));
        }
        if (dto.getAllowMultipleSubmissions() != null)
            existing.setAllowMultipleSubmissions(dto.getAllowMultipleSubmissions());
        existing.setExpiresAt(dto.getExpiresAt());
        existing.getFields().removeIf(field -> !newKeys.contains(field.getFieldKey()));

        if (dto.getFields() != null) {
            for (FormFieldDTO dtoField : dto.getFields()) {
                FormFieldEntity existingField = oldByKey.get(dtoField.getFieldKey());
                if (existingField != null) {
                    existingField.setLabel(dtoField.getLabel());
                    existingField.setFieldType(dtoField.getFieldType());
                    existingField.setRequired(dtoField.isRequired());
                    existingField.setDefaultValue(dtoField.getDefaultValue());
                    existingField.setValidationRegex(dtoField.getValidationRegex());
                    existingField.setValidationJson(dtoField.getValidationJson());
                    existingField.setRulesJson(dtoField.getRulesJson());
                    existingField.setUiConfigJson(dtoField.getUiConfigJson());
                    existingField.setSharedOptionsId(dtoField.getSharedOptionsId());
                    existingField.setFieldOrder(dtoField.getFieldOrder());
                    existingField.setDisabled(dtoField.isDisabled());
                    existingField.setReadOnly(dtoField.isReadOnly());
                    existingField.setIsCalculated(dtoField.getIsCalculated());
                    existingField.setFormulaExpression(dtoField.getFormulaExpression());
                    existingField.setDependenciesJson(serializeDependencies(dtoField.getDependencies()));
                    existingField.setPrecision(dtoField.getPrecision());
                    existingField.setLockAfterCalculation(dtoField.getLockAfterCalculation());
                    existingField.setParentGroupKey(dtoField.getParentGroupKey());
                    existingField.setGroupId(dtoField.getGroupId());
                } else {
                    existing.getFields().add(toFieldEntity(dtoField, existing));
                }
            }
        }

        return formRepo.save(existing);
    }

    // ── Delete / Soft Delete ────────────────────────────────────────────────

    /** Soft-delete only: mark form as deleted without dropping schema/data. */
    @Transactional
    public void deleteForm(UUID id, String owner, boolean isAdmin) {
        FormEntity form = getFormForAction(id, owner, isAdmin);
        form.setSoftDeleted(true);
        form.setDeletedAt(java.time.LocalDateTime.now());
        formRepo.save(form);
        log.info("Form '{}' soft-deleted by '{}'", form.getName(), owner);
    }

    // ── Status (Publish / Unpublish) ──────────────────────────────────────────

    @Transactional
    public FormEntity publishForm(UUID id, String owner, boolean isAdmin, boolean isBuilder) {
        FormEntity form = getFormForAction(id, owner, isAdmin);

        if (form.getStatus() != FormEntity.FormStatus.DRAFT) {
            throw new IllegalStateException("Only drafted forms can be published.");
        }

        boolean creatorIsBuilder = form.getCreatedBy() != null && userRepo.findByUsernameWithRolesAndPermissions(form.getCreatedBy())
                .map(user -> user.getRoles().stream().anyMatch(role -> "Builder".equals(role.getRoleName())))
                .orElse(false);
        if (!isAdmin && !creatorIsBuilder) {
            throw new IllegalStateException("Only draft forms created by Builder can be published.");
        }

        if (!isAdmin) {
            if (!isBuilder) {
                throw new IllegalStateException("Only Admin or Builder owner can publish this form.");
            }
            if (!owner.equals(form.getCreatedBy())) {
                throw new IllegalStateException("Builder can publish only own draft forms.");
            }
        }

        form.setStatus(FormEntity.FormStatus.PUBLISHED);
        FormEntity saved = formRepo.save(form);
        log.info("Form '{}' published by '{}'", form.getName(), owner);
        return saved;
    }

    @Transactional
    public FormEntity unpublishForm(UUID id, String owner, boolean isAdmin) {
        FormEntity form = getFormForAction(id, owner, isAdmin);
        form.setStatus(FormEntity.FormStatus.DRAFT);
        FormEntity saved = formRepo.save(form);
        log.info("Form '{}' unpublished by '{}'", form.getName(), owner);
        return saved;
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
    public List<StaticFormFieldEntity> getStaticFields(UUID formId) {
        return staticRepo.findByFormIdOrderByFieldOrderAsc(formId);
    }

    private void saveStaticFields(UUID formId, List<FormDTO.StaticFieldDTO> staticDTOs) {
        if (staticDTOs == null || staticDTOs.isEmpty())
            return;
        for (FormDTO.StaticFieldDTO sf : staticDTOs) {
            staticRepo.save(StaticFormFieldEntity.builder()
                    .id(sf.getId() != null ? sf.getId() : UUID.randomUUID())
                    .formId(formId)
                    .fieldType(sf.getFieldType())
                    .data(sf.getData())
                    .fieldOrder(sf.getFieldOrder())
                    .build());
        }
    }

    /** Returns all groups for a form, ordered by group_order */
    public List<FormGroupEntity> getGroups(UUID formId) {
        return groupRepo.findByFormIdOrderByGroupOrderAsc(formId);
    }

    private void saveGroups(UUID formId, List<FormDTO.GroupDTO> groupDTOs) {
        if (groupDTOs == null || groupDTOs.isEmpty())
            return;
        for (FormDTO.GroupDTO g : groupDTOs) {
            groupRepo.save(FormGroupEntity.builder()
                    .id(g.getId() != null ? g.getId() : UUID.randomUUID())
                    .formId(formId)
                    .groupTitle(g.getGroupTitle())
                    .groupDescription(g.getGroupDescription())
                    .groupOrder(g.getGroupOrder())
                    .rulesJson(g.getRulesJson())
                    .build());
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private FormFieldEntity toFieldEntity(FormFieldDTO dto, FormEntity parent) {
        return FormFieldEntity.builder()
                .id(dto.getId() != null ? dto.getId() : UUID.randomUUID())
                .form(parent)
                .fieldKey(dto.getFieldKey())
                .label(dto.getLabel()
                )
                .fieldType(dto.getFieldType())
                .required(dto.isRequired())
                .defaultValue(dto.getDefaultValue()
                )
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
                .groupId(dto.getGroupId())
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

    private void validateUniqueFieldKeys(List<FormFieldDTO> fields) {
        if (fields == null || fields.isEmpty())
            return;
        Set<String> seenKeys = new HashSet<>();
        List<String> duplicates = new ArrayList<>();
        for (FormFieldDTO field : fields) {
            String key = field.getFieldKey();
            if (key != null && !key.isEmpty() && !seenKeys.add(key)) {
                duplicates.add(key);
            }
        }
        if (!duplicates.isEmpty()) {
            throw new IllegalArgumentException(
                    "Duplicate field keys found: " + String.join(", ", duplicates) +
                            ". Each field must have a unique key.");
        }
    }


    private static final class AllowedUserEntry {
        public Integer id;
        public String username;
        public String name;
    }
}
