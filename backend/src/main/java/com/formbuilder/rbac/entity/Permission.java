package com.formbuilder.rbac.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * JPA entity for the 'permissions' table.
 *
 * Fixed set of 9 access-right types seeded by migration.
 * Application code references {@code permissionKey} (READ, WRITE, EDIT, etc.)
 * to check access. Rows are NEVER created/deleted at runtime.
 */
@Entity
@Table(name = "permissions", indexes = {
        @Index(name = "idx_permissions_key", columnList = "permission_key", unique = true)
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString
public class Permission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    @EqualsAndHashCode.Include
    private Integer id;

    /**
     * Unique key: READ | WRITE | EDIT | DELETE | APPROVE | MANAGE | EXPORT | VISIBILITY | AUDIT.
     * Used by service layer for permission checks — never changes after seed.
     */
    @Column(name = "permission_key", nullable = false, unique = true, length = 100)
    @EqualsAndHashCode.Include
    private String permissionKey;

    /** Human-readable description of what this permission grants. */
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;
}

