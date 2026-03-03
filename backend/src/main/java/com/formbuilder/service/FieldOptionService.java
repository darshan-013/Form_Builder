package com.formbuilder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formbuilder.dto.FieldOptionDTO;
import com.formbuilder.entity.FieldOptionEntity;
import com.formbuilder.entity.FormFieldEntity;
import com.formbuilder.repository.FieldOptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for managing field options.
 * Supports both JSON-based and normalized (table-based) options storage.
 *
 * Priority:
 * 1. If field has normalized options (options list), use those
 * 2. Otherwise, fall back to JSON options (optionsJson)
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class FieldOptionService {

    private final FieldOptionRepository optionRepository;
    private final ObjectMapper objectMapper;

    /**
     * Get options for a field.
     * Returns normalized options if available, otherwise parses JSON.
     */
    public List<String> getOptionsForField(FormFieldEntity field) {
        // Priority 1: Check for normalized options
        if (field.getOptions() != null && !field.getOptions().isEmpty()) {
            return field.getOptions().stream()
                    .filter(FieldOptionEntity::isActive)
                    .sorted((a, b) -> Integer.compare(a.getOptionOrder(), b.getOptionOrder()))
                    .map(FieldOptionEntity::getOptionValue)
                    .collect(Collectors.toList());
        }

        // Priority 2: Fall back to JSON options
        if (field.getOptionsJson() != null && !field.getOptionsJson().isEmpty()
            && !"null".equals(field.getOptionsJson())) {
            return parseJsonOptions(field.getOptionsJson());
        }

        return Collections.emptyList();
    }

    /**
     * Convert JSON string to list of option values.
     */
    public List<String> parseJsonOptions(String optionsJson) {
        if (optionsJson == null || optionsJson.isEmpty() || "null".equals(optionsJson)) {
            return Collections.emptyList();
        }

        try {
            return objectMapper.readValue(optionsJson, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            log.error("Failed to parse options JSON: {}", optionsJson, e);
            return Collections.emptyList();
        }
    }

    /**
     * Convert list of option values to JSON string.
     */
    public String toJsonOptions(List<String> options) {
        if (options == null || options.isEmpty()) {
            return null;
        }

        try {
            return objectMapper.writeValueAsString(options);
        } catch (Exception e) {
            log.error("Failed to serialize options to JSON", e);
            return null;
        }
    }

    /**
     * Save normalized options for a field.
     * Replaces all existing options with the new list.
     */
    @Transactional
    public void saveNormalizedOptions(FormFieldEntity field, List<FieldOptionDTO> optionDTOs) {
        // Clear existing options
        field.getOptions().clear();

        // Add new options
        if (optionDTOs != null && !optionDTOs.isEmpty()) {
            for (FieldOptionDTO dto : optionDTOs) {
                FieldOptionEntity option = FieldOptionEntity.builder()
                        .field(field)
                        .optionValue(dto.getOptionValue())
                        .optionOrder(dto.getOptionOrder())
                        .isDefault(dto.isDefault())
                        .isActive(dto.isActive())
                        .build();
                field.getOptions().add(option);
            }
        }

        log.info("Saved {} normalized options for field {}",
                optionDTOs != null ? optionDTOs.size() : 0, field.getId());
    }

    /**
     * Migrate JSON options to normalized format for a field.
     */
    @Transactional
    public void migrateJsonToNormalized(FormFieldEntity field) {
        if (field.getOptionsJson() == null || field.getOptionsJson().isEmpty()) {
            log.debug("No JSON options to migrate for field {}", field.getId());
            return;
        }

        List<String> jsonOptions = parseJsonOptions(field.getOptionsJson());
        if (jsonOptions.isEmpty()) {
            return;
        }

        // Clear existing normalized options
        field.getOptions().clear();

        // Convert each JSON option to a normalized option
        int order = 0;
        for (String optionValue : jsonOptions) {
            FieldOptionEntity option = FieldOptionEntity.builder()
                    .field(field)
                    .optionValue(optionValue)
                    .optionOrder(order++)
                    .isDefault(false)
                    .isActive(true)
                    .build();
            field.getOptions().add(option);
        }

        log.info("Migrated {} options from JSON to normalized for field {}",
                jsonOptions.size(), field.getId());
    }

    /**
     * Convert normalized options to JSON format.
     * Useful for backward compatibility or export.
     */
    public String normalizedToJson(List<FieldOptionEntity> options) {
        if (options == null || options.isEmpty()) {
            return null;
        }

        List<String> optionValues = options.stream()
                .filter(FieldOptionEntity::isActive)
                .sorted((a, b) -> Integer.compare(a.getOptionOrder(), b.getOptionOrder()))
                .map(FieldOptionEntity::getOptionValue)
                .collect(Collectors.toList());

        return toJsonOptions(optionValues);
    }

    /**
     * Get active options for a field by ID.
     */
    public List<FieldOptionEntity> getActiveOptions(UUID fieldId) {
        return optionRepository.findActiveByFieldId(fieldId);
    }

    /**
     * Get all options (including inactive) for a field by ID.
     */
    public List<FieldOptionEntity> getAllOptions(UUID fieldId) {
        return optionRepository.findAllByFieldId(fieldId);
    }

    /**
     * Check if an option value exists for a field.
     */
    public boolean optionExists(UUID fieldId, String optionValue) {
        return optionRepository.existsByFieldIdAndOptionValue(fieldId, optionValue);
    }

    /**
     * Get the default option for a field.
     */
    public FieldOptionEntity getDefaultOption(UUID fieldId) {
        return optionRepository.findDefaultByFieldId(fieldId);
    }

    /**
     * Convert entity to DTO.
     */
    public FieldOptionDTO toDTO(FieldOptionEntity entity) {
        FieldOptionDTO dto = new FieldOptionDTO();
        dto.setId(entity.getId());
        dto.setOptionValue(entity.getOptionValue());
        dto.setOptionOrder(entity.getOptionOrder());
        dto.setDefault(entity.isDefault());
        dto.setActive(entity.isActive());
        return dto;
    }

    /**
     * Convert entity list to DTO list.
     */
    public List<FieldOptionDTO> toDTOList(List<FieldOptionEntity> entities) {
        if (entities == null) {
            return Collections.emptyList();
        }
        return entities.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }
}


