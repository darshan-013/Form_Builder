package com.formbuilder.rbac.service;

import com.formbuilder.rbac.entity.Module;
import com.formbuilder.rbac.entity.RoleModule;
import com.formbuilder.rbac.repository.ModuleRepository;
import com.formbuilder.rbac.repository.RoleModuleRepository;
import com.formbuilder.rbac.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ModuleService {

    private final ModuleRepository moduleRepository;
    private final RoleModuleRepository roleModuleRepository;
    private final RoleRepository roleRepository;

    @Transactional(readOnly = true)
    public List<Module> getAllModules() {
        List<Module> modules = moduleRepository.findAll();
        modules.forEach(this::initializeParents);
        return modules;
    }

    @Transactional
    public Module createModule(Module module) {
        Module saved = moduleRepository.save(module);
        return initializeParents(saved);
    }

    @Transactional
    public Module updateModule(Long id, Module moduleDetails) {
        Module module = moduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Module not found: " + id));
        
        module.setModuleName(moduleDetails.getModuleName());
        module.setModuleDescription(moduleDetails.getModuleDescription());
        module.setPrefix(moduleDetails.getPrefix());
        module.setIconCss(moduleDetails.getIconCss());
        module.setActive(moduleDetails.getActive());
        module.setParent(moduleDetails.getParent());
        module.setSubParent(moduleDetails.getSubParent());
        
        Module saved = moduleRepository.save(module);
        return initializeParents(saved);
    }

    private Module initializeParents(Module m) {
        if (m == null) return null;
        if (m.getParent() != null) {
            org.hibernate.Hibernate.initialize(m.getParent());
        }
        if (m.getSubParent() != null) {
            org.hibernate.Hibernate.initialize(m.getSubParent());
        }
        return m;
    }

    @Transactional
    public void assignModulesToRole(Integer roleId, List<Long> moduleIds) {
        // 1. Fetch the role first to ensure it exists
        com.formbuilder.rbac.entity.Role role = roleRepository.findById(roleId)
                .orElseThrow(() -> new RuntimeException("Role not found: " + roleId));

        // 2. Efficiently remove existing mappings
        List<RoleModule> existing = roleModuleRepository.findByRoleId(roleId);
        if (!existing.isEmpty()) {
            roleModuleRepository.deleteAllInBatch(existing);
            roleModuleRepository.flush(); // CRITICAL: ensure deletes hit DB before we start adding new ones
        }

        // 3. Add new mappings
        for (Long moduleId : moduleIds) {
            Module module = moduleRepository.findById(moduleId)
                    .orElseThrow(() -> new RuntimeException("Module not found: " + moduleId));
            
            roleModuleRepository.save(RoleModule.builder()
                    .role(role)
                    .module(module)
                    .build());
        }
    }

    public List<RoleModule> getModulesByRole(Integer roleId) {
        return roleModuleRepository.findByRoleId(roleId);
    }
}
