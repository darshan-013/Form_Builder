package com.formbuilder.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
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

    /** JSON array of options for dropdown/radio fields (e.g. ["Option 1", "Option 2"]) */
    @Column(name = "options_json", columnDefinition = "TEXT")
    private String optionsJson;

    /** JSON object containing advanced validation rules */
    @Column(name = "validation_json", columnDefinition = "TEXT")
    private String validationJson;

    /**
     * Normalized options (alternative to optionsJson).
     * Each option is stored as a separate row in field_options table.
     * Benefits: better data integrity, queryability, and flexibility.
     *
     * Note: This is excluded from JSON serialization to avoid LazyInitializationException.
     * Use optionsJson for API responses, or explicitly load this collection with EAGER fetch.
     */
    @OneToMany(mappedBy = "field", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("optionOrder ASC")
    @JsonIgnore
    @Builder.Default
    private List<FieldOptionEntity> options = new ArrayList<>();

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
