package com.formbuilder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Stores a shared (canonical) options_json that can be referenced by
 * many form_fields rows across many forms.
 *
 * When ANY field that references this row changes its options, the update
 * is written here — so ALL fields pointing to the same shared_options_id
 * automatically see the new data at render / validation time.
 *
 * Table: shared_options
 * Columns: id (uuid PK) | options_json (TEXT) | created_at | updated_at
 */
@Entity
@Table(name = "shared_options")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SharedOptionsEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    /**
     * Canonical JSON array of options.
     * Format: [{"label":"A","value":"A"},{"label":"B","value":"B"}]
     */
    @Column(name = "options_json", columnDefinition = "TEXT", nullable = false)
    private String optionsJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

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
