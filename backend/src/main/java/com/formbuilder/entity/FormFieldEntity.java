package com.formbuilder.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * JPA entity for the fixed 'form_fields' metadata table.
 * Each instance corresponds to ONE field definition in a form.
 * At runtime, DynamicTableService creates/alters the actual column
 * in the form's dedicated submission table.
 *
 * ⚠️ No submission entity exists — submission rows live in dynamic tables.
 */
@Entity
@Table(name = "form_fields", uniqueConstraints = @UniqueConstraint(name = "uq_form_field_key", columnNames = {
        "form_id", "field_key" }))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(exclude = "form")
@ToString(exclude = "form")
public class FormFieldEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    /** Back-reference to parent form. @JsonBackReference prevents circular JSON. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_id", nullable = false)
    @JsonBackReference
    private FormEntity form;

    /** Snake_case key — becomes the column name in the dynamic submission table. */
    @Column(name = "field_key", nullable = false, length = 100)
    private String fieldKey;

    @Column(name = "label", nullable = false, length = 150)
    private String label;

    /**
     * Logical type. Allowed values: text | number | date | boolean | dropdown | radio | file.
     * Mapped to SQL types by DynamicTableService.
     */
    @Column(name = "field_type", nullable = false, length = 50)
    private String fieldType;

    @Column(name = "required", nullable = false)
    private boolean required;

    @Column(name = "default_value", columnDefinition = "TEXT")
    private String defaultValue;

    @Column(name = "validation_regex", columnDefinition = "TEXT")
    private String validationRegex;

    /** JSON object of advanced validation rules e.g. {"minLength":3,"emailFormat":true} */
    @Column(name = "validation_json", columnDefinition = "TEXT")
    private String validationJson;

    /**
     * Conditional Rule Engine config — stored as TEXT, evaluated ONLY on the frontend.
     * Structure: { combinator:"AND"|"OR", conditions:[...], actions:[{type, setValue?}] }
     * Backend stores this and passes it through in the render API — never evaluates it.
     * Security: backend validates all required fields independently of rule state.
     */
    @Column(name = "rules_json", columnDefinition = "TEXT")
    private String rulesJson;

    /**
     * FK → shared_options.id
     * ALL dropdown/radio fields must have this set.
     * Options are ALWAYS stored in the shared_options table — never inline in form_fields.
     * ON DELETE SET NULL — if the shared_options row is deleted the field loses its options gracefully.
     */
    @Column(name = "shared_options_id", columnDefinition = "UUID")
    private UUID sharedOptionsId;

    /** Zero-based render order — maintained by drag-and-drop in the builder. */
    @Column(name = "field_order", nullable = false)
    private int fieldOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
