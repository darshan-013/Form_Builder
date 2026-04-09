package com.formbuilder.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Data
public class FormDTO {
    @NotBlank(message = "Form name is required")
    @Size(min = 3, max = 255, message = "Form name must be between 3 and 255 characters")
    @Pattern(
            regexp = "^[A-Za-z_][A-Za-z0-9_ ]*$",
            message = "Form name must start with a letter or underscore and contain only letters, numbers, spaces, and underscores"
    )
    private String name;
 
    @NotBlank(message = "Form code is required")
    @Size(max = 100, message = "Form code must not exceed 100 characters")
    @Pattern(regexp = "^[a-z_]+$", message = "Code must contain only lowercase letters and underscores. Numbers and special characters are not allowed.")
    private String code;

    private String description;

    @Valid
    private List<FormFieldDTO> fields;

    /** Static UI-only elements (section_header, label_text, description_block) */
    @Valid
    private List<StaticFieldDTO> staticFields;

    /** Section groups — visual containers for grouped fields */
    @Valid
    private List<GroupDTO> groups;


    /**
     * Explicit users allowed to see this form.
     * Stored as JSON array of objects with id + username + optional name snapshot.
     * If null/empty, fallback visibility rules apply.
     */
    private List<AllowedUserDTO> allowedUsers;

    /**
     * If false — only one submission per session is allowed. Default true = no
     * restriction.
     */
    private Boolean allowMultipleSubmissions;

    /**
     * If true — submission timestamp is shown in submissions list. Default false.
     */
    private Boolean showTimestamp;

    /**
     * Optional expiry. If set, submissions are blocked after this date-time.
     * Null = no expiry.
     */
    private LocalDateTime expiresAt;

    /**
     * Optional custom validation rules (expression-based errors).
     */
    private List<CustomValidationRuleDTO> customValidationRules;

    @Data
    public static class StaticFieldDTO {
        private UUID id;
        private String fieldType;
        private String data;
        private int fieldOrder;
    }

    @Data
    public static class GroupDTO {
        private UUID id;
        private String groupTitle;
        private String groupDescription;
        private int groupOrder;
        private String rulesJson;
    }

    @Data
    public static class AllowedUserDTO {
        private Integer id;
        private String username;
        private String name;
    }
}
