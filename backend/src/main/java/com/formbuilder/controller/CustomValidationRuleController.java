package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.dto.CustomValidationRuleDTO;
import com.formbuilder.entity.CustomValidationRuleEntity;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.FormService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping(AppConstants.API_FORMS)
@RequiredArgsConstructor
public class CustomValidationRuleController {

    private final FormService formService;
    private final UserRoleService userRoleService;

    @GetMapping(AppConstants.FORM_CUSTOM_VALIDATIONS)
    public ResponseEntity<List<CustomValidationRuleDTO>> getRules(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains("Admin") || roles.contains("Role Administrator");
        
        // This implicitly checks permissions
        formService.getFormForAction(formId, auth.getName(), isAdmin);
        
        List<CustomValidationRuleDTO> rules = formService.getFormById(formId)
                .getVersions().stream()
                .filter(v -> v.getId().equals(versionId))
                .findFirst()
                .map(v -> v.getCustomValidationRules().stream()
                        .map(this::toDTO)
                        .collect(Collectors.toList()))
                .orElseThrow(() -> new IllegalArgumentException("Version not found"));
                
        return ResponseEntity.ok(rules);
    }

    @PostMapping(AppConstants.FORM_CUSTOM_VALIDATIONS)
    public ResponseEntity<CustomValidationRuleDTO> addRule(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            @RequestBody CustomValidationRuleDTO dto,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains("Admin") || roles.contains("Role Administrator");
        
        CustomValidationRuleEntity rule = formService.addCustomValidationRule(formId, versionId, dto, auth.getName(), isAdmin);
        return ResponseEntity.ok(toDTO(rule));
    }

    @PutMapping(AppConstants.FORM_CUSTOM_VALIDATIONS_BY_ID)
    public ResponseEntity<CustomValidationRuleDTO> updateRule(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            @PathVariable UUID ruleId,
            @RequestBody CustomValidationRuleDTO dto,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains("Admin") || roles.contains("Role Administrator");
        
        CustomValidationRuleEntity rule = formService.updateCustomValidationRule(
                formId, versionId, ruleId, dto, auth.getName(), isAdmin);
        
        return ResponseEntity.ok(toDTO(rule));
    }

    @DeleteMapping(AppConstants.FORM_CUSTOM_VALIDATIONS_BY_ID)
    public ResponseEntity<Void> deleteRule(
            @PathVariable UUID formId,
            @PathVariable UUID versionId,
            @PathVariable UUID ruleId,
            Authentication auth) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roles.contains("Admin") || roles.contains("Role Administrator");
        
        formService.deleteCustomValidationRule(formId, versionId, ruleId, auth.getName(), isAdmin);
        return ResponseEntity.noContent().build();
    }

    private CustomValidationRuleDTO toDTO(CustomValidationRuleEntity entity) {
        return CustomValidationRuleDTO.builder()
                .id(entity.getId())
                .scope(entity.getScope())
                .fieldKey(entity.getFieldKey())
                .expression(entity.getExpression())
                .errorMessage(entity.getErrorMessage())
                .executionOrder(entity.getExecutionOrder())
                .build();
    }
}
