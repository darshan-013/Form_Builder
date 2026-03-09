package com.formbuilder.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
public class FormDTO {
    private String name;
    private String description;
    private List<FormFieldDTO> fields;
    /** Static UI-only elements (section_header, label_text, description_block) */
    private List<StaticFieldDTO> staticFields;

    /** If false — only one submission per session is allowed. Default true = no restriction. */
    private Boolean allowMultipleSubmissions;

    /** If true — submission timestamp is shown in submissions list. Default false. */
    private Boolean showTimestamp;

    /**
     * Optional expiry. If set, submissions are blocked after this date-time.
     * Null = no expiry.
     */
    private LocalDateTime expiresAt;

    @Data
    public static class StaticFieldDTO {
        private UUID   id;
        private String fieldType;
        private String data;
        private int    fieldOrder;
    }
}
