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

    /** Lifecycle status stored as VARCHAR in DB. */
    public enum FormStatus { DRAFT, PUBLISHED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "table_name", nullable = false, unique = true, length = 150)
    private String tableName;

    /**
     * DRAFT   = form is being built; submissions are blocked.
     * PUBLISHED = form is live; anyone can submit.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private FormStatus status = FormStatus.DRAFT;

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
        if (status == null) status = FormStatus.DRAFT;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
