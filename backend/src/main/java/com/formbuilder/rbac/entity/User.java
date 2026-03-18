package com.formbuilder.rbac.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * JPA entity for the 'rbac_users' table.
 *
 * This is the SINGLE source of truth for both authentication (username/password)
 * and RBAC authorization (roles/permissions).
 *
 * User → ManyToMany → Role  via 'user_roles' join table.
 */
@Entity
@Table(name = "rbac_users", indexes = {
        @Index(name = "idx_rbac_users_email",    columnList = "email",    unique = true),
        @Index(name = "idx_rbac_users_username",  columnList = "username", unique = true)
})
@org.hibernate.annotations.SQLRestriction("is_deleted = false")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(exclude = {"roles", "password"})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    @EqualsAndHashCode.Include
    private Integer id;

    @Column(name = "username", nullable = false, unique = true, length = 100)
    @NotBlank(message = "Username cannot be blank")
    @Size(max = 100, message = "Username must not exceed 100 characters")
    @EqualsAndHashCode.Include
    private String username;

    /** BCrypt-encoded password. */
    @Column(name = "password", nullable = false, length = 255)
    @NotBlank(message = "Password cannot be blank")
    @Size(max = 255, message = "Password must not exceed 255 characters")
    @JsonIgnore
    private String password;

    /** Whether this account is active. */
    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private boolean enabled = true;

    /** Whether this account is soft-deleted. */
    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private boolean isDeleted = false;

    /** Display name (e.g. "Darshan Patel"). */
    @Column(name = "name", length = 100)
    @Size(max = 100, message = "Name must not exceed 100 characters")
    private String name;

    /** Unique email for notifications / contact. */
    @Column(name = "email", unique = true, length = 150)
    @NotBlank(message = "Email cannot be blank")
    @Size(max = 150, message = "Email must not exceed 150 characters")
    @Email(message = "Invalid email format")
    private String email;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // ── Relationship: User ↔ Role ────────────────────────────────────────
    @ManyToMany(fetch = FetchType.LAZY, cascade = { CascadeType.PERSIST, CascadeType.MERGE })
    @JoinTable(
            name = "user_roles",
            joinColumns        = @JoinColumn(name = "user_id", referencedColumnName = "id"),
            inverseJoinColumns = @JoinColumn(name = "role_id", referencedColumnName = "id"),
            uniqueConstraints  = @UniqueConstraint(name = "uq_user_role",
                                                   columnNames = { "user_id", "role_id" })
    )
    @JsonIgnore
    @Builder.Default
    private Set<Role> roles = new HashSet<>();

    // ── Lifecycle ────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    // ── Convenience ──────────────────────────────────────────────────────

    /** Check if this user has a specific role by name. */
    public boolean hasRole(String roleName) {
        return roles.stream()
                .anyMatch(r -> r.getRoleName().equals(roleName));
    }

    /** Check if this user has a specific permission key (across all roles). */
    public boolean hasPermission(String permissionKey) {
        return roles.stream()
                .flatMap(r -> r.getPermissions().stream())
                .anyMatch(p -> p.getPermissionKey().equals(permissionKey));
    }

    /** Collect all distinct permission keys from all assigned roles. */
    public Set<String> getAllPermissionKeys() {
        return roles.stream()
                .flatMap(r -> r.getPermissions().stream())
                .map(Permission::getPermissionKey)
                .collect(Collectors.toSet());
    }

    /** Collect all role names assigned to this user. */
    public Set<String> getAllRoleNames() {
        return roles.stream()
                .map(Role::getRoleName)
                .collect(Collectors.toSet());
    }
}
