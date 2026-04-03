package com.formbuilder.rbac.controller;

import com.formbuilder.constants.AppConstants;

import com.formbuilder.rbac.entity.Module;
import com.formbuilder.rbac.entity.RoleModule;
import com.formbuilder.rbac.service.ModuleService;
import com.formbuilder.rbac.security.RequirePermission;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping(AppConstants.API_MODULES)
@RequiredArgsConstructor
@RequirePermission("MANAGE")
public class ModuleController {

    private final ModuleService moduleService;

    @GetMapping
    public List<Module> getAllModules() {
        return moduleService.getAllModules();
    }

    @PostMapping
    public Module createModule(@RequestBody Module module) {
        return moduleService.createModule(module);
    }

    @PutMapping(AppConstants.BY_ID)
    public Module updateModule(@PathVariable Long id, @RequestBody Module module) {
        return moduleService.updateModule(id, module);
    }

    @PostMapping(AppConstants.MODULE_BY_ROLE)
    public ResponseEntity<Void> assignToRole(@PathVariable Integer roleId, @RequestBody List<Long> moduleIds) {
        moduleService.assignModulesToRole(roleId, moduleIds);
        return ResponseEntity.ok().build();
    }

    @GetMapping(AppConstants.MODULE_BY_ROLE)
    public List<RoleModule> getByRole(@PathVariable Integer roleId) {
        return moduleService.getModulesByRole(roleId);
    }
}
