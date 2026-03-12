package com.formbuilder.rbac.repository;

import com.formbuilder.rbac.entity.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Integer> {

    Optional<Role> findByRoleName(String roleName);

    boolean existsByRoleName(String roleName);

    /** All roles ordered by system-first then alphabetical. */
    @Query("SELECT r FROM Role r ORDER BY r.systemRole DESC, r.roleName ASC")
    List<Role> findAllOrdered();

    /** All roles with permissions eagerly loaded, ordered by system-first then alphabetical. */
    @Query("SELECT DISTINCT r FROM Role r LEFT JOIN FETCH r.permissions ORDER BY r.systemRole DESC, r.roleName ASC")
    List<Role> findAllWithPermissions();

    /** Eagerly fetch a role with its permissions loaded. */
    @Query("SELECT r FROM Role r LEFT JOIN FETCH r.permissions WHERE r.id = :id")
    Optional<Role> findByIdWithPermissions(@Param("id") Integer id);

    /** Eagerly fetch a role with its permissions by name. */
    @Query("SELECT r FROM Role r LEFT JOIN FETCH r.permissions WHERE r.roleName = :name")
    Optional<Role> findByRoleNameWithPermissions(@Param("name") String name);
}
