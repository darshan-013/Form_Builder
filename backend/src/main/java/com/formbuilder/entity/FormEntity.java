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
    public enum FormStatus {
        DRAFT, PUBLISHED
    }

    /** Visibility level — controls which roles can see this form. */
    public enum FormVisibility {
        PUBLIC,      // Visible to all authenticated users
        RESTRICTED,  // Visible to specific roles (Manager, Approver, Builder, Admin)
        PRIVATE      // Visible only to the creator and Admin
    }

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
     * DRAFT = form is being built; submissions are blocked.
     * PUBLISHED = form is live; anyone can submit.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private FormStatus status = FormStatus.DRAFT;

    /**
     * Form visibility level.
     * PUBLIC = all authenticated users can see it.
     * RESTRICTED = only certain elevated roles can see it.
     * PRIVATE = only the creator and Admin.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    @Builder.Default
    private FormVisibility visibility = FormVisibility.PUBLIC;

    /**
     * JSON array of role names that can see this form.
     * e.g. ["Viewer","Employee","Manager","Approver","Builder"]
     * If null/empty → all roles can see (PUBLIC equivalent).
     * Admin and Role Administrator ALWAYS have access regardless of this setting.
     */
    @Column(name = "allowed_roles", columnDefinition = "TEXT")
    private String allowedRoles;

    /**
     * Username of the user who created this form. Used to scope dashboard
     * visibility.
     */
    @Column(name = "created_by", length = 150)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
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

    /** Soft delete flag — true = in trash, false = active. */
    @Column(name = "is_soft_deleted", nullable = false)
    @Builder.Default
    private boolean softDeleted = false;

    /** Timestamp when soft delete occurred. Null when active. */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

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
        if (status == null)
            status = FormStatus.DRAFT;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
