package com.formbuilder.rbac.service;

import com.formbuilder.rbac.dto.MenuDto;
import com.formbuilder.rbac.entity.Module;
import com.formbuilder.rbac.entity.RoleModule;
import com.formbuilder.rbac.repository.RoleModuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MenuService {

    private final RoleModuleRepository roleModuleRepository;

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<MenuDto> getMenuForCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return Collections.emptyList();

        List<String> roleNames = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(r -> r.replace("ROLE_", ""))
                .collect(Collectors.toList());

        List<MenuDto> menu = new ArrayList<>();

        // 1. Fixed Items
        addFixedItems(menu, roleNames);

        // 2. Dynamic Items from Database
        addDynamicItems(menu, roleNames);

        return menu;
    }

    private void addFixedItems(List<MenuDto> menu, List<String> roleNames) {
        boolean isAdmin = roleNames.contains("Admin");
        boolean isRoleAdmin = roleNames.contains("Role Administrator");
        boolean isBuilder = roleNames.contains("Builder");
        boolean isViewer = roleNames.contains("Viewer");
        boolean isCreator = roleNames.contains("Creator");
        boolean hasManagementRole = isAdmin || isRoleAdmin;
        boolean hasWorkflowRole = isAdmin || isBuilder || isViewer || isCreator || roleNames.contains("Approver") || roleNames.contains("Manager");

        // General Section
        MenuDto general = MenuDto.builder().section("General").items(new ArrayList<>()).build();
        general.getItems().add(MenuDto.MenuItemDto.builder().label("Dashboard").href("/dashboard").icon("🏠").build());
        menu.add(general);

        // Management Section
        if (hasManagementRole) {
            MenuDto management = MenuDto.builder().section("Management").items(new ArrayList<>()).build();
            management.getItems().add(MenuDto.MenuItemDto.builder().label("Users").href("/users").icon("👥").build());
            management.getItems().add(MenuDto.MenuItemDto.builder().label("Roles").href("/roles").icon("🛡️").build());
            
            // Admin specific items (Module Management, Mapping, Audit Logs)
            if (isAdmin) {
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Module Management").href("/admin/modules").icon("🧩").build());
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Role-Menu Mapping").href("/admin/roles/mapping").icon("🗺️").build());
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Audit Logs").href("/logs/admin").icon("🧾").build());
            }

            // Role Logs (visible to both Admin and Role Administrator)
            if (isAdmin || isRoleAdmin) {
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Role Logs").href("/logs/role-assignments").icon("📜").build());
            }

            menu.add(management);
        }

        // Workflows Section
        if (hasWorkflowRole) {
            MenuDto workflows = MenuDto.builder().section("Workflows").items(new ArrayList<>()).build();
            
            if (isBuilder || roleNames.contains("Approver") || roleNames.contains("Manager")) {
                workflows.getItems().add(MenuDto.MenuItemDto.builder().label("Approval Inbox").href("/admin/approvals").icon("✓").build());
            }
            
            if (isBuilder) {
                workflows.getItems().add(MenuDto.MenuItemDto.builder().label("Workflow Review").href("/workflows/review").icon("◇").build());
            }

            if (isViewer || isCreator) {
                workflows.getItems().add(MenuDto.MenuItemDto.builder().label("Workflow Status").href("/workflows/status").icon("📈").build());
            }
            
            if (isAdmin) {
                workflows.getItems().add(MenuDto.MenuItemDto.builder().label("Workflow Monitor").href("/admin/workflows/status").icon("◉").build());
            }

            if (!workflows.getItems().isEmpty()) {
                menu.add(workflows);
            }
        }
    }

    private void addDynamicItems(List<MenuDto> menu, List<String> roleNames) {
        List<RoleModule> roleModules = roleModuleRepository.findByRoleRoleNameIn(roleNames);
        List<Module> modules = roleModules.stream()
                .map(RoleModule::getModule)
                .distinct()
                .collect(Collectors.toList());

        if (modules.isEmpty()) return;

        // Group by parent/sub-parent to build hierarchy
        Map<Long, List<Module>> childrenMap = roleModuleRepository.findAll().stream() // Simplified for now, in practice filter by active
                .map(RoleModule::getModule)
                .distinct()
                .filter(m -> m.getParent() != null || m.getSubParent() != null)
                .collect(Collectors.groupingBy(m -> m.getSubParent() != null ? m.getSubParent().getId() : m.getParent().getId()));

        // We'll use a "Custom Modules" section for dynamic items
        MenuDto customSection = MenuDto.builder().section("Features").items(new ArrayList<>()).build();

        // Filter for top-level modules assigned to roles
        List<Module> topLevel = modules.stream()
                .filter(m -> m.getParent() == null && m.getSubParent() == null)
                .collect(Collectors.toList());

        for (Module m : topLevel) {
            customSection.getItems().add(mapToDto(m, modules));
        }

        if (!customSection.getItems().isEmpty()) {
            menu.add(customSection);
        }
    }

    private MenuDto.MenuItemDto mapToDto(Module module, List<Module> allowedModules) {
        List<MenuDto.MenuItemDto> subItems = new ArrayList<>();
        
        // Find children of this module
        // A child of 'module' is one where:
        // 1. If 'module' is Level 1: child.parent == module && child.subParent == null
        // 2. If 'module' is Level 2: child.parent == module.parent && child.subParent == module
        
        if (module.getSubModules() != null) {
            for (Module child : module.getSubModules()) {
                boolean isDirectChild = false;
                
                if (module.getParent() == null) {
                    // Current module is Top Level (L1)
                    if (child.getSubParent() == null) {
                        isDirectChild = true; // L2 child
                    }
                } else if (module.getSubParent() == null) {
                    // Current module is SubParent (L2)
                    if (child.getSubParent() != null && child.getSubParent().getId().equals(module.getId())) {
                        isDirectChild = true; // L3 child
                    }
                }

                if (isDirectChild) {
                    if (allowedModules.contains(child) || isParentOfAllowed(child, allowedModules)) {
                        subItems.add(mapToDto(child, allowedModules));
                    }
                }
            }
        }

        return MenuDto.MenuItemDto.builder()
                .label(module.getModuleName())
                .href(module.getPrefix())
                .icon(module.getIconCss())
                .subItems(subItems.isEmpty() ? null : subItems)
                .build();
    }

    private boolean isParentOfAllowed(Module parent, List<Module> allowedModules) {
        if (parent.getSubModules() == null) return false;
        for (Module child : parent.getSubModules()) {
            if (allowedModules.contains(child) || isParentOfAllowed(child, allowedModules)) return true;
        }
        return false;
    }
}
