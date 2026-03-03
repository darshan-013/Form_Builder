package com.formbuilder.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * JPA entity for the fixed 'forms' metadata table.
 * Submission data is stored in a SEPARATE dynamic table (form_<name>_<id>)
 * managed by DynamicTableService — NOT by Hibernate.
 */
@Entity
@Table(name = "forms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(exclude = "fields")
@ToString(exclude = "fields")
public class FormEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * Name of the dynamically created PostgreSQL submission table.
     * Format: form_<sanitizedName>_<shortId>
     * e.g. form_contact_form_a3b8d1
     */
    @Column(name = "table_name", nullable = false, unique = true, length = 150)
    private String tableName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    // ── Relationship ────────────────────────────────────────────────────────
    // CascadeType.ALL + orphanRemoval = JPA owns field lifecycle.
    // DynamicTableService owns the DDL lifecycle separately.
    @OneToMany(mappedBy = "form", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("fieldOrder ASC")
    @JsonManagedReference
    @Builder.Default
    private List<FormFieldEntity> fields = new ArrayList<>();

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
