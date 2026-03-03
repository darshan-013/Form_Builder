package com.formbuilder.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Form {
    private UUID id;
    private String name;
    private String description;
    private String tableName; // dedicated submission table name (e.g. form_abc123)
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<FormField> fields; // populated on demand by FormService
}
