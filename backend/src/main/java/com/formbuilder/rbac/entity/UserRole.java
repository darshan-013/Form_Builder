package com.formbuilder.rbac.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * JPA entity for the 'user_roles' join table.
 *
 * While JPA's @ManyToMany on {@link User} handles the relationship
 * transparently, this explicit entity is provided for:
 *   - Direct JDBC/JPQL queries on the join table
 *   - Repository-level operations (bulk assign/revoke)
 *   - Audit and admin tooling
 *
 * The DB enforces UNIQUE(user_id, role_id) and cascading deletes.
 */
@Entity
@Table(name = "user_roles",
       uniqueConstraints = @UniqueConstraint(
               name = "uq_user_role",
               columnNames = { "user_id", "role_id" }
       ),
       indexes = {
               @Index(name = "idx_user_roles_user_id", columnList = "user_id"),
               @Index(name = "idx_user_roles_role_id", columnList = "role_id")
       }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class UserRole {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    @EqualsAndHashCode.Include
    private Integer id;

    /** The user being assigned a role. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false,
                foreignKey = @ForeignKey(name = "fk_ur_user"))
    private User user;

    /** The role being assigned to the user. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "role_id", nullable = false,
                foreignKey = @ForeignKey(name = "fk_ur_role"))
    private Role role;
}

