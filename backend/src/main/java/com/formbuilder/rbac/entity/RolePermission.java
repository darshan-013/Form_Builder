package com.formbuilder.rbac.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * JPA entity for the 'role_permissions' join table.
 *
 * While JPA's @ManyToMany on {@link Role} handles the relationship
 * transparently, this explicit entity is provided for:
 *   - Direct JDBC/JPQL queries on the join table
 *   - Repository-level operations (bulk insert/delete)
 *   - Audit and admin tooling
 *
 * The DB enforces UNIQUE(role_id, permission_id) and cascading deletes.
 */
@Entity
@Table(name = "role_permissions",
       uniqueConstraints = @UniqueConstraint(
               name = "uq_role_permission",
               columnNames = { "role_id", "permission_id" }
       ),
       indexes = {
               @Index(name = "idx_role_permissions_role_id", columnList = "role_id"),
               @Index(name = "idx_role_permissions_perm_id", columnList = "permission_id")
       }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class RolePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    @EqualsAndHashCode.Include
    private Integer id;

    /** The role being granted a permission. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "role_id", nullable = false,
                foreignKey = @ForeignKey(name = "fk_rp_role"))
    private Role role;

    /** The permission being granted to the role. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "permission_id", nullable = false,
                foreignKey = @ForeignKey(name = "fk_rp_permission"))
    private Permission permission;
}

