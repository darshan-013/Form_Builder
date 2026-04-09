package com.formbuilder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.Optional;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * JPA entity for the fixed 'forms' metadata table.
 * Submission data is stored in a SEPARATE dynamic table (form_data_<code>)
 * managed by DynamicTableService — NOT by Hibernate.
 */
@Entity
@Table(name = "forms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(exclude = "versions")
@ToString(exclude = "versions")
public class FormEntity {

    /** Lifecycle status stored as VARCHAR in DB. */
    public enum FormStatus {
        DRAFT,
        ASSIGNED,
        PENDING_APPROVAL,
        REJECTED,
        PUBLISHED,
        ARCHIVED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "UUID")
    private UUID id;

    @Column(name = "name", nullable = false, length = 255)
    @NotBlank(message = "Form name cannot be blank")
    @Size(max = 255, message = "Form name must not exceed 255 characters")
    private String name;

    @Column(name = "code", nullable = false, unique = true, length = 100, updatable = false)
    @NotBlank(message = "Form code cannot be blank")
    @Size(max = 100, message = "Form code must not exceed 100 characters")
    private String code;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * DRAFT = form is being built; submissions are blocked.
     * PENDING_APPROVAL = workflow is active and awaiting decisions.
     * REJECTED = workflow rejected; creator/builder can revise and resubmit.
     * PUBLISHED = form is live; anyone can submit.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @NotNull(message = "Form status cannot be null")
    @Builder.Default
    private FormStatus status = FormStatus.DRAFT;

    /**
     * JSON array of explicit user access entries.
     * Each entry carries user id + username + optional display-name snapshot.
     * If null/empty, default visibility rules apply.
     */
    @Column(name = "allowed_users", columnDefinition = "TEXT")
    private String allowedUsers;

    /**
     * Username of the user who created this form. Used to scope dashboard
     * visibility.
     */
    @Column(name = "created_by", length = 100)
    private String createdBy;

    /** Assigned Builder who is allowed to start workflow for this form. */
    @Column(name = "assigned_builder_id")
    private Integer assignedBuilderId;

    @Column(name = "assigned_builder_username", length = 150)
    private String assignedBuilderUsername;

    @Column(name = "created_at", nullable = false, updatable = false)
    @NotNull(message = "Creation timestamp cannot be null")
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    @NotNull(message = "Update timestamp cannot be null")
    private LocalDateTime updatedAt;

    /**
     * If false — only ONE submission per user session is allowed. Default true = no
     * restriction.
     */
    @Column(name = "allow_multiple_submissions", nullable = false)
    @Builder.Default
    private boolean allowMultipleSubmissions = true;

    /** Timestamp is always recorded and shown — compulsory feature. */
    @Column(name = "show_timestamp", nullable = false)
    @Builder.Default
    private boolean showTimestamp = true;

    /**
     * Optional expiry date-time. If set, submissions are blocked after this point.
     * Null = no expiry (form stays active indefinitely).
     */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;


    @OneToMany(mappedBy = "form", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    @com.fasterxml.jackson.annotation.JsonManagedReference
    private List<FormVersionEntity> versions = new ArrayList<>();

    // Helper to get active version (latest if multiple exist)
    public Optional<FormVersionEntity> getActiveVersion() {
        return versions.stream()
                .filter(FormVersionEntity::isActive)
                .max(Comparator.comparingInt(FormVersionEntity::getVersionNumber));
    }

    // Alias for backward compatibility with existing code
    public Optional<FormVersionEntity> getPublishedVersion() {
        return getActiveVersion();
    }

    // Helper to get draft (not active, latest version)
    // Note: In our model, only one is active. All others are DRAFTs.
    // Requirement 4: activación generates activation of new version, discard of
    // drafts.
    public Optional<FormVersionEntity> getDraftVersion() {
        return versions.stream()
                .filter(v -> !v.isActive())
                .max(Comparator.comparingInt(FormVersionEntity::getVersionNumber));
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (status == null)
            status = FormStatus.DRAFT;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
