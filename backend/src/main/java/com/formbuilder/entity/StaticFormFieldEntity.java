package com.formbuilder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * JPA entity for static_form_fields — UI-only elements that never store submission data.
 * Types: section_header | label_text | description_block
 */
@Entity
@Table(name = "static_form_fields")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StaticFormFieldEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    /** FK to forms.id — ON DELETE CASCADE in DB */
    @Column(name = "form_id", nullable = false, columnDefinition = "UUID")
    private UUID formId;

    /** section_header | label_text | description_block */
    @Column(name = "field_type", nullable = false, length = 50)
    private String fieldType;

    /** Display text content */
    @Column(name = "data", columnDefinition = "TEXT")
    private String data;

    /** Render order — merged with dynamic fields on render */
    @Column(name = "field_order", nullable = false)
    private int fieldOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
