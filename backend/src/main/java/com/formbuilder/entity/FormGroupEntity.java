package com.formbuilder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * JPA entity for form_groups — visual section containers in the form builder.
 * Each group can contain multiple form_fields (via group_id FK on form_fields).
 */
@Entity
@Table(name = "form_groups")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FormGroupEntity {

    @Id
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_version_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonBackReference
    private FormVersionEntity formVersion;

    @Column(name = "group_title", nullable = false, length = 200)
    private String groupTitle;

    @Column(name = "group_description", columnDefinition = "TEXT")
    private String groupDescription;

    /** Render order — determines position on the canvas */
    @Column(name = "group_order", nullable = false)
    private int groupOrder;

    @Column(name = "rules_json", columnDefinition = "TEXT")
    private String rulesJson;

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
