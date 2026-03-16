package com.formbuilder.rbac.repository;

import com.formbuilder.rbac.entity.RoleModule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Collection;

@Repository
public interface RoleModuleRepository extends JpaRepository<RoleModule, Long> {
    
    @Query("SELECT rm FROM RoleModule rm JOIN FETCH rm.module m " +
           "WHERE rm.role.roleName IN :roleNames AND m.active = true")
    List<RoleModule> findByRoleRoleNameIn(@Param("roleNames") Collection<String> roleNames);

    @Query("SELECT rm FROM RoleModule rm JOIN FETCH rm.module WHERE rm.role.id = :roleId")
    List<RoleModule> findByRoleId(@Param("roleId") Integer roleId);
}
