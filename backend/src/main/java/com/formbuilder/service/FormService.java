package com.formbuilder.service;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.dto.FormFieldDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.entity.SharedOptionsEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.repository.FormFieldJpaRepository;
import com.formbuilder.repository.FormJpaRepository;
import com.formbuilder.repository.SharedOptionsRepository;
import com.formbuilder.repository.StaticFormFieldRepository;
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

    private final FormJpaRepository        formRepo;
    private final FormFieldJpaRepository   fieldRepo;
    private final SharedOptionsRepository  sharedOptionsRepo;
    private final StaticFormFieldRepository staticRepo;
    private final DynamicTableService      dynamicTable;

    // ── Read ──────────────────────────────────────────────────────────────────

    /** Returns only forms owned by the given user. */
    public List<FormEntity> getAllForms(String owner) {
        return formRepo.findAllByCreatedByOrderByCreatedAtDesc(owner);
    }

    /** Returns a form by ID — any owner (used by public endpoints like submit/render). */
    public FormEntity getFormById(UUID id) {
        return formRepo.findByIdWithFields(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
    }

    /**
     * Returns a form by ID scoped to the authenticated owner.
     * Throws NoSuchElementException (→ 404) if form doesn't exist OR belongs to someone else.
     */
    public FormEntity getOwnedFormById(UUID id, String owner) {
        return formRepo.findByIdAndCreatedBy(id, owner)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
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
                .fields(new ArrayList<>())
                .build();

        if (dto.getFields() != null) {
            for (FormFieldDTO f : dto.getFields()) {
                form.getFields().add(toFieldEntity(f, form));
            }
        }

        FormEntity saved = formRepo.save(form);
        dynamicTable.createTable(tableName, saved.getFields());

        // Save static fields
        saveStaticFields(saved.getId(), dto.getStaticFields());

        log.info("Form '{}' created by '{}' with table '{}'", saved.getName(), owner, tableName);
        return saved;
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public FormEntity updateForm(UUID id, FormDTO dto, String owner) {
        validateUniqueFieldKeys(dto.getFields());

        FormEntity existing = formRepo.findByIdAndCreatedBy(id, owner)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));

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

        existing.setName(dto.getName());
        existing.setDescription(dto.getDescription());
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
                } else {
                    existing.getFields().add(toFieldEntity(dtoField, existing));
                }
            }
        }

        FormEntity savedForm = formRepo.save(existing);

        // Replace all static fields for this form
        staticRepo.deleteByFormId(savedForm.getId());
        saveStaticFields(savedForm.getId(), dto.getStaticFields());

        return savedForm;
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void deleteForm(UUID id, String owner) {
        FormEntity form = formRepo.findByIdAndCreatedBy(id, owner)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
        // static_form_fields cascade deletes via FK ON DELETE CASCADE
        dynamicTable.dropTable(form.getTableName());
        formRepo.delete(form);
        log.info("Form '{}' and table '{}' deleted by '{}'", form.getName(), form.getTableName(), owner);
    }

    // ── Status (Publish / Unpublish) ──────────────────────────────────────────

    @Transactional
    public FormEntity publishForm(UUID id, String owner) {
        FormEntity form = formRepo.findByIdAndCreatedBy(id, owner)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
        form.setStatus(FormEntity.FormStatus.PUBLISHED);
        FormEntity saved = formRepo.save(form);
        log.info("Form '{}' published by '{}'", form.getName(), owner);
        return saved;
    }

    @Transactional
    public FormEntity unpublishForm(UUID id, String owner) {
        FormEntity form = formRepo.findByIdAndCreatedBy(id, owner)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
        form.setStatus(FormEntity.FormStatus.DRAFT);
        FormEntity saved = formRepo.save(form);
        log.info("Form '{}' unpublished by '{}'", form.getName(), owner);
        return saved;
    }

    // ── Shared Options CRUD ───────────────────────────────────────────────────

    /** Create a new shared_options row. Called when admin saves a new dropdown/radio field. */
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
     * shared_options row automatically see the new options at render/validation time.
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
        if (staticDTOs == null || staticDTOs.isEmpty()) return;
        for (FormDTO.StaticFieldDTO sf : staticDTOs) {
            staticRepo.save(StaticFormFieldEntity.builder()
                    .formId(formId)
                    .fieldType(sf.getFieldType())
                    .data(sf.getData())
                    .fieldOrder(sf.getFieldOrder())
                    .build());
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private FormFieldEntity toFieldEntity(FormFieldDTO dto, FormEntity parent) {
        return FormFieldEntity.builder()
                .form(parent)
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
                .build();
    }

    private void validateUniqueFieldKeys(List<FormFieldDTO> fields) {
        if (fields == null || fields.isEmpty()) return;
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
}
