package com.formbuilder.rbac.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/**
 * JPA entity for the 'roles' table.
 *
 * 7 system roles are seeded by migration (is_system_role = TRUE).
 * Admin / Role Administrator can create custom roles at runtime
 * (is_system_role = FALSE). System roles cannot be deleted.
 *
 * Role → ManyToMany → Permission  via 'role_permissions' join table.
 */
@Entity
@Table(name = "roles", indexes = {
        @Index(name = "idx_roles_name", columnList = "role_name", unique = true)
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(exclude = "permissions")
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    @EqualsAndHashCode.Include
    private Integer id;

    /** Unique display name — e.g. "Admin", "Manager", "Custom Reviewer". */
    @Column(name = "role_name", nullable = false, unique = true, length = 100)
    @EqualsAndHashCode.Include
    private String roleName;

    /**
     * TRUE = seeded by system, protected from deletion.
     * FALSE = custom role created by Admin/Role Administrator at runtime.
     */
    @Column(name = "is_system_role", nullable = false)
    @Builder.Default
    private boolean systemRole = false;

    /**
     * ID of the rbac_users row that created this role.
     * NULL for system-seeded roles.
     */
    @Column(name = "created_by")
    private Integer createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    // ── Relationship: Role ↔ Permission ──────────────────────────────────
    // Owns the join table. CascadeType.PERSIST + MERGE allows adding/removing
    // permissions when saving a Role. REMOVE is intentionally excluded —
    // deleting a role should NOT delete the shared Permission rows.
    @ManyToMany(fetch = FetchType.LAZY, cascade = { CascadeType.PERSIST, CascadeType.MERGE })
    @JoinTable(
            name = "role_permissions",
            joinColumns        = @JoinColumn(name = "role_id",       referencedColumnName = "id"),
            inverseJoinColumns = @JoinColumn(name = "permission_id", referencedColumnName = "id"),
            uniqueConstraints  = @UniqueConstraint(name = "uq_role_permission",
                                                   columnNames = { "role_id", "permission_id" })
    )
    @JsonIgnore
    @Builder.Default
    private Set<Permission> permissions = new HashSet<>();

    // ── Lifecycle ────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Convenience ──────────────────────────────────────────────────────

    /** Check if this role grants a specific permission by key. */
    public boolean hasPermission(String permissionKey) {
        return permissions.stream()
                .anyMatch(p -> p.getPermissionKey().equals(permissionKey));
    }
}

