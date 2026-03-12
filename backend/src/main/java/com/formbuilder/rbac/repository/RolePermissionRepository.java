package com.formbuilder.rbac.repository;

import com.formbuilder.rbac.entity.RolePermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RolePermissionRepository extends JpaRepository<RolePermission, Integer> {

    List<RolePermission> findByRoleId(Integer roleId);

    @Modifying
    @Query("DELETE FROM RolePermission rp WHERE rp.role.id = :roleId AND rp.permission.id = :permId")
    void deleteByRoleIdAndPermissionId(@Param("roleId") Integer roleId, @Param("permId") Integer permId);

    @Modifying
    @Query("DELETE FROM RolePermission rp WHERE rp.role.id = :roleId")
    void deleteAllByRoleId(@Param("roleId") Integer roleId);

    boolean existsByRoleIdAndPermissionId(Integer roleId, Integer permissionId);
}

