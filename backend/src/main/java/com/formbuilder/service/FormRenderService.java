package com.formbuilder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formbuilder.dto.FormRenderDTO;
import com.formbuilder.dto.FormRenderDTO.OptionDTO;
import com.formbuilder.dto.FormRenderDTO.RenderFieldDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.repository.FormJpaRepository;
import com.formbuilder.repository.SharedOptionsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Builds the FormRenderDTO used by the public form renderer.
 * Options are ALWAYS read live from the shared_options table via shared_options_id FK.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FormRenderService {

    private final FormJpaRepository    formRepo;
    private final SharedOptionsRepository sharedOptionsRepo;
    private final ObjectMapper         objectMapper;

    public FormRenderDTO render(UUID formId) {
        FormEntity form = formRepo.findByIdWithFields(formId)
                .orElseThrow(() -> new NoSuchElementException("Form not found: " + formId));

        List<RenderFieldDTO> renderFields = form.getFields().stream()
                .sorted(Comparator.comparingInt(FormFieldEntity::getFieldOrder))
                .map(this::toRenderField)
                .collect(Collectors.toList());

        return FormRenderDTO.builder()
                .formId(form.getId())
                .formName(form.getName())
                .formDescription(form.getDescription())
                .fields(renderFields)
                .build();
    }

    private RenderFieldDTO toRenderField(FormFieldEntity f) {
        List<OptionDTO> options = List.of();
        String gridJson = null;

        boolean isChoice = "dropdown".equals(f.getFieldType())
                        || "radio".equals(f.getFieldType())
                        || "multiple_choice".equals(f.getFieldType());
        boolean isGrid = "multiple_choice_grid".equals(f.getFieldType());

        if (isChoice) {
            options = parseOptionsJson(resolveOptionsJson(f));
        }
        if (isGrid) {
            // shared_options.options_json stores {"rows":[...],"columns":[...]} for grid fields
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
                .options(options)
                .gridJson(gridJson)
                .uiConfigJson(f.getUiConfigJson())
                .build();
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

    /** Parse options_json → OptionDTO list. Handles both string[] and {label,value}[] formats. */
    private List<OptionDTO> parseOptionsJson(String optionsJson) {
        if (optionsJson == null || optionsJson.isBlank()) return List.of();
        try {
            List<Map<String, Object>> raw = objectMapper.readValue(
                    optionsJson, new TypeReference<List<Map<String, Object>>>() {});
            return raw.stream()
                    .map(m -> {
                        String label = m.getOrDefault("label", m.getOrDefault("value", "")).toString();
                        String value = m.getOrDefault("value", label).toString();
                        return OptionDTO.builder().label(label).value(value).build();
                    })
                    .collect(Collectors.toList());
        } catch (Exception e) {
            try {
                List<String> raw = objectMapper.readValue(optionsJson, new TypeReference<List<String>>() {});
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
