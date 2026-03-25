package com.formbuilder.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Data
public class FormDTO {
    @NotBlank(message = "Form name cannot be blank")
    @Size(max = 150, message = "Form name must not exceed 150 characters")
    private String name;
 
    @Size(max = 50, message = "Form code must not exceed 50 characters")
    private String formCode;

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
