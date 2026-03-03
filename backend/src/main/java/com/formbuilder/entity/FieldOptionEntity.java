package com.formbuilder.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * JPA entity for the 'field_options' table.
 * Stores individual options for dropdown and radio fields.
 * Each option is a separate row (normalized design).
 *
 * This is an alternative to storing options as JSON in form_fields.options_json.
 * Benefits:
 * - Better data integrity and validation
 * - Can query individual options
 * - Can add metadata to each option
 * - Can reuse common options across fields
 * - Better for fields with many options
 */
@Entity
@Table(name = "field_options", uniqueConstraints = {
    @UniqueConstraint(name = "uq_field_option_value", columnNames = {"field_id", "option_value"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(exclude = "field")
@ToString(exclude = "field")
public class FieldOptionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    /** Back-reference to parent field. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "field_id", nullable = false)
    @JsonIgnore
    private FormFieldEntity field;

    /** The actual option value (both display text and submit value) */
    @Column(name = "option_value", nullable = false, length = 255)
    private String optionValue;

    /** Display order (0-based). Lower numbers appear first. */
    @Column(name = "option_order", nullable = false)
    @Builder.Default
    private int optionOrder = 0;

    /** True if this option should be pre-selected by default */
    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean isDefault = false;

    /** False for soft-deleted options (keeps history) */
    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean isActive = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}



