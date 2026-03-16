package com.formbuilder.rbac.repository;

import com.formbuilder.rbac.entity.Module;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ModuleRepository extends JpaRepository<Module, Long> {
    List<Module> findByActiveTrue();
    List<Module> findByParentIsNullAndActiveTrue();
}
