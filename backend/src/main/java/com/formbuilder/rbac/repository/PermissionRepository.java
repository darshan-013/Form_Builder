package com.formbuilder.rbac.repository;

import com.formbuilder.rbac.entity.Permission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface PermissionRepository extends JpaRepository<Permission, Integer> {

    Optional<Permission> findByPermissionKey(String permissionKey);

    List<Permission> findByPermissionKeyIn(Collection<String> keys);
}

