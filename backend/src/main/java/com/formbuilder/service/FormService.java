package com.formbuilder.service;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.dto.FormFieldDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.repository.FormJpaRepository;
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
    private final DynamicTableService dynamicTable;

    // ── Read ─────────────────────────────────────────────────────────────────

    public List<FormEntity> getAllForms() {
        return formRepo.findAllByOrderByCreatedAtDesc();
    }

    public FormEntity getFormById(UUID id) {
        return formRepo.findByIdWithFields(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));
    }

    // ── Create ───────────────────────────────────────────────────────────────

    @Transactional
    public FormEntity createForm(FormDTO dto) {
        validateUniqueFieldKeys(dto.getFields());

        String tableName = dynamicTable.generateTableName(dto.getName());

        FormEntity form = FormEntity.builder()
                .name(dto.getName())
                .description(dto.getDescription())
                .tableName(tableName)
                .fields(new ArrayList<>())
                .build();

        if (dto.getFields() != null) {
            for (FormFieldDTO f : dto.getFields()) {
                form.getFields().add(toFieldEntity(f, form));
            }
        }

        FormEntity saved = formRepo.save(form);

        dynamicTable.createTable(tableName, saved.getFields());

        log.info("Form '{}' created with table '{}'", saved.getName(), tableName);
        return saved;
    }

    // ── Update ───────────────────────────────────────────────────────────────

    @Transactional
    public FormEntity updateForm(UUID id, FormDTO dto) {
        validateUniqueFieldKeys(dto.getFields());

        FormEntity existing = formRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));

        Map<String, FormFieldEntity> oldByKey = existing.getFields().stream()
                .collect(Collectors.toMap(FormFieldEntity::getFieldKey, f -> f));

        Set<String> newKeys = dto.getFields() != null
                ? dto.getFields().stream().map(FormFieldDTO::getFieldKey).collect(Collectors.toSet())
                : Set.of();

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
                    existingField.setOptionsJson(dtoField.getOptionsJson());
                    existingField.setFieldOrder(dtoField.getFieldOrder());
                } else {
                    existing.getFields().add(toFieldEntity(dtoField, existing));
                }
            }
        }

        return formRepo.save(existing);
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    @Transactional
    public void deleteForm(UUID id) {
        FormEntity form = formRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + id));

        dynamicTable.dropTable(form.getTableName());

        formRepo.delete(form);
        log.info("Form '{}' and table '{}' deleted", form.getName(), form.getTableName());
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private FormFieldEntity toFieldEntity(FormFieldDTO dto, FormEntity parent) {
        return FormFieldEntity.builder()
                .form(parent)
                .fieldKey(dto.getFieldKey())
                .label(dto.getLabel())
                .fieldType(dto.getFieldType())
                .required(dto.isRequired())
                .defaultValue(dto.getDefaultValue())
                .validationRegex(dto.getValidationRegex())
                .optionsJson(dto.getOptionsJson())
                .validationJson(dto.getValidationJson())
                .fieldOrder(dto.getFieldOrder())
                .build();
    }

    private void validateUniqueFieldKeys(List<FormFieldDTO> fields) {
        if (fields == null || fields.isEmpty()) {
            return;
        }

        Set<String> seenKeys = new HashSet<>();
        List<String> duplicates = new ArrayList<>();

        for (FormFieldDTO field : fields) {
            String key = field.getFieldKey();
            if (key != null && !key.isEmpty()) {
                if (!seenKeys.add(key)) {
                    duplicates.add(key);
                }
            }
        }

        if (!duplicates.isEmpty()) {
            throw new IllegalArgumentException(
                "Duplicate field keys found: " + String.join(", ", duplicates) +
                ". Each field must have a unique key."
            );
        }
    }
}

