package com.formbuilder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formbuilder.dto.FormRenderDTO;
import com.formbuilder.dto.FormRenderDTO.OptionDTO;
import com.formbuilder.dto.FormRenderDTO.RenderFieldDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.entity.FormGroupEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.repository.FormGroupRepository;
import com.formbuilder.repository.FormJpaRepository;
import com.formbuilder.repository.SharedOptionsRepository;
import com.formbuilder.repository.StaticFormFieldRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;
import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;

/**
 * Builds the FormRenderDTO used by the public form renderer.
 * Merges dynamic fields (form_fields) with static UI elements
 * (static_form_fields)
 * sorted by field_order so the builder layout is preserved.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FormRenderService {

    private final FormJpaRepository formRepo;
    private final SharedOptionsRepository sharedOptionsRepo;
    private final StaticFormFieldRepository staticRepo;
    private final FormGroupRepository groupRepo;
    private final ObjectMapper objectMapper;

    public FormRenderDTO render(UUID formId) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));

        // 1. Dynamic fields
        List<RenderFieldDTO> renderFields = new ArrayList<>(
                form.getFields().stream()
                        .sorted(Comparator.comparingInt(FormFieldEntity::getFieldOrder))
                        .map(this::toRenderField)
                        .collect(Collectors.toList()));

        // 2. Static fields — merged in by field_order
        List<StaticFormFieldEntity> staticFields = staticRepo.findByFormIdOrderByFieldOrderAsc(formId);
        for (StaticFormFieldEntity sf : staticFields) {
            renderFields.add(RenderFieldDTO.builder()
                    .fieldKey("__static__" + sf.getId())
                    .label(sf.getData()) // label carries the display text
                    .fieldType(sf.getFieldType())
                    .fieldOrder(sf.getFieldOrder())
                    .isStatic(true)
                    .staticData(sf.getData())
                    .required(false)
                    .options(List.of())
                    .build());
        }

        // 3. Sort merged list by fieldOrder
        renderFields.sort(Comparator.comparingInt(RenderFieldDTO::getFieldOrder));

        // 4. Groups
        List<FormGroupEntity> groupEntities = groupRepo.findByFormIdOrderByGroupOrderAsc(formId);
        List<FormRenderDTO.RenderGroupDTO> groups = groupEntities.stream()
                .map(g -> FormRenderDTO.RenderGroupDTO.builder()
                        .id(g.getId())
                        .groupTitle(g.getGroupTitle())
                        .groupDescription(g.getGroupDescription())
                        .groupOrder(g.getGroupOrder())
                        .rulesJson(g.getRulesJson())
                        .build())
                .collect(Collectors.toList());

        return FormRenderDTO.builder()
                .formId(form.getId())
                .formName(form.getName())
                .formDescription(form.getDescription())
                .fields(renderFields)
                .groups(groups)
                .allowMultipleSubmissions(form.isAllowMultipleSubmissions())
                .showTimestamp(form.isShowTimestamp())
                .expiresAt(form.getExpiresAt())
                .build();
    }

    private RenderFieldDTO toRenderField(FormFieldEntity f) {
        List<OptionDTO> options = List.of();
        String gridJson = null;

        boolean isChoice = "dropdown".equals(f.getFieldType())
                || "radio".equals(f.getFieldType())
                || "multiple_choice".equals(f.getFieldType());
        boolean isGrid = "multiple_choice_grid".equals(f.getFieldType())
                || "checkbox_grid".equals(f.getFieldType());

        if (isChoice) {
            options = parseOptionsJson(resolveOptionsJson(f));
        }
        if (isGrid) {
            gridJson = resolveOptionsJson(f);
        }

        return RenderFieldDTO.builder()
                .fieldKey(f.getFieldKey())
                .label(f.getLabel())
                .fieldType(f.getFieldType())
                .required(f.isRequired())
                .validationRegex(f.getValidationRegex())
                .validationJson(f.getValidationJson())
                .rulesJson(f.getRulesJson())
                .defaultValue(f.getDefaultValue())
                .fieldOrder(f.getFieldOrder())
                .disabled(f.isDisabled())
                .readOnly(f.isReadOnly())
                .options(options)
                .gridJson(gridJson)
                .uiConfigJson(f.getUiConfigJson())
                .isStatic(false)
                // Calculated fields
                .isCalculated(Boolean.TRUE.equals(f.getIsCalculated()))
                .formulaExpression(f.getFormulaExpression())
                .dependencies(parseDependencies(f.getDependenciesJson()))
                .precision(f.getPrecision())
                .lockAfterCalculation(Boolean.TRUE.equals(f.getLockAfterCalculation()))
                .parentGroupKey(f.getParentGroupKey())
                .groupId(f.getGroupId())
                .build();
    }

    private List<String> parseDependencies(String json) {
        if (json == null || json.isBlank())
            return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * Resolve options for a dropdown/radio field.
     * Options are ALWAYS in shared_options table — never inline on form_fields.
     */
    String resolveOptionsJson(FormFieldEntity field) {
        if (field.getSharedOptionsId() == null) {
            log.warn("Field '{}' (id={}) is a choice field but has no shared_options_id",
                    field.getFieldKey(), field.getId());
            return "[]";
        }
        return sharedOptionsRepo.findById(field.getSharedOptionsId())
                .map(s -> s.getOptionsJson())
                .orElseGet(() -> {
                    log.warn("shared_options row {} not found for field '{}'",
                            field.getSharedOptionsId(), field.getFieldKey());
                    return "[]";
                });
    }

    /**
     * Parse options_json → OptionDTO list. Handles both string[] and
     * {label,value}[] formats.
     */
    private List<OptionDTO> parseOptionsJson(String optionsJson) {
        if (optionsJson == null || optionsJson.isBlank())
            return List.of();
        try {
            List<Map<String, Object>> raw = objectMapper.readValue(
                    optionsJson, new TypeReference<List<Map<String, Object>>>() {
                    });
            return raw.stream()
                    .map(m -> {
                        String label = m.getOrDefault("label", m.getOrDefault("value", "")).toString();
                        String value = m.getOrDefault("value", label).toString();
                        return OptionDTO.builder().label(label).value(value).build();
                    })
                    .collect(Collectors.toList());
        } catch (Exception e) {
            try {
                List<String> raw = objectMapper.readValue(optionsJson, new TypeReference<List<String>>() {
                });
                return raw.stream()
                        .map(v -> OptionDTO.builder().label(v).value(v).build())
                        .collect(Collectors.toList());
            } catch (Exception ex) {
                log.warn("Could not parse options_json: {}", optionsJson);
                return List.of();
            }
        }
    }
}
