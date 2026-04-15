package com.formbuilder.rbac.controller;

import com.formbuilder.constants.AppConstants;

import com.formbuilder.rbac.entity.Module;
import com.formbuilder.rbac.entity.RoleModule;
import com.formbuilder.rbac.service.ModuleService;
import com.formbuilder.rbac.security.RequirePermission;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping(AppConstants.API_MODULES)
@RequiredArgsConstructor
@RequirePermission("MANAGE")
public class ModuleController {

    private final ModuleService moduleService;

    @GetMapping
    public ResponseEntity<?> getAllModules(
            @RequestParam(name = "page", defaultValue = "0") Integer page,
            @RequestParam(name = "size", defaultValue = "10") Integer size) {
        List<Module> allModules = moduleService.getAllModules();
        int safePage = normalizePage(page);
        int safeSize = normalizeSize(size);
        long totalElements = allModules.size();
        int from = Math.min(safePage * safeSize, allModules.size());
        int to = Math.min(from + safeSize, allModules.size());
        List<Module> content = allModules.subList(from, to);

        return ResponseEntity.ok(toPagedResponse(content, safePage, safeSize, totalElements));
    }

    @PostMapping
    public Module createModule(@RequestBody Module module) {
        return moduleService.createModule(module);
    }

    @PutMapping(AppConstants.BY_ID)
    public Module updateModule(@PathVariable("id") Long id, @RequestBody Module module) {
        return moduleService.updateModule(id, module);
    }

    @PostMapping(AppConstants.MODULE_BY_ROLE)
    public ResponseEntity<Void> assignToRole(@PathVariable("roleId") Integer roleId, @RequestBody List<Long> moduleIds) {
        moduleService.assignModulesToRole(roleId, moduleIds);
        return ResponseEntity.ok().build();
    }

    @GetMapping(AppConstants.MODULE_BY_ROLE)
    public List<RoleModule> getByRole(@PathVariable("roleId") Integer roleId) {
        return moduleService.getModulesByRole(roleId);
    }

    private int normalizePage(Integer page) {
        return page == null || page < AppConstants.DEFAULT_PAGE ? AppConstants.DEFAULT_PAGE : page;
    }

    private int normalizeSize(Integer size) {
        if (size == null || size <= 0) {
            return AppConstants.DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, AppConstants.MAX_PAGE_SIZE);
    }

    private Map<String, Object> toPagedResponse(List<?> content, int page, int size, long totalElements) {
        int totalPages = size <= 0 ? 0 : (int) Math.ceil((double) totalElements / size);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("content", content);
        response.put("page", page);
        response.put("size", size);
        response.put("totalElements", totalElements);
        response.put("totalPages", totalPages);
        response.put("hasPrevious", page > 0);
        response.put("hasNext", page + 1 < totalPages);
        return response;
    }
}
