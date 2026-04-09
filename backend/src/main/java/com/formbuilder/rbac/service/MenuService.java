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

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

    private void addFixedItems(List<MenuDto> menu, List<String> authorities) {
        boolean isAdmin = authorities.contains("Admin");
        boolean isRoleAdmin = authorities.contains("Role Administrator");
        boolean hasAuditPerm = authorities.contains("AUDIT");
        boolean hasManagePerm = authorities.contains("MANAGE");
        
        boolean isBuilder = authorities.contains("Builder");
        boolean isViewer = authorities.contains("Viewer");
        boolean isCreator = authorities.contains("Creator");
        
        boolean hasManagementSection = isAdmin || isRoleAdmin || hasManagePerm || hasAuditPerm;
        boolean hasWorkflowRole = isAdmin || isBuilder || isViewer || isCreator || authorities.contains("Approver") || authorities.contains("Manager");

        // General Section
        MenuDto general = MenuDto.builder().section("General").items(new ArrayList<>()).build();
        general.getItems().add(MenuDto.MenuItemDto.builder().label("Dashboard").href("/dashboard").icon("🏠").build());
        general.getItems().add(MenuDto.MenuItemDto.builder().label("Form Vault").href("/forms/vault").icon("🗄").build());
        menu.add(general);

        // Management Section
        if (hasManagementSection) {
            MenuDto management = MenuDto.builder().section("Management").items(new ArrayList<>()).build();
            
            if (isAdmin || isRoleAdmin || hasManagePerm) {
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Users").href("/users").icon("👥").build());
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Roles").href("/roles").icon("🛡️").build());
            }
            
            // Admin specific items (Module Management, Mapping)
            if (isAdmin) {
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Module Management").href("/admin/modules").icon("🧩").build());
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Role-Menu Mapping").href("/admin/roles/mapping").icon("🗺️").build());
            }

            // Audit Logs (visible to anyone with AUDIT permission — typically Admin, Role Admin, Manager)
            if (hasAuditPerm || isAdmin) {
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Audit Logs").href("/logs/admin").icon("🧾").build());
            }

            // Role Logs (visible to Admin and Role Administrator)
            if (isAdmin || isRoleAdmin) {
                management.getItems().add(MenuDto.MenuItemDto.builder().label("Role Logs").href("/logs/role-assignments").icon("📜").build());
            }

            if (!management.getItems().isEmpty()) {
                menu.add(management);
            }
        }

        // Workflows Section
        if (hasWorkflowRole) {
            MenuDto workflows = MenuDto.builder().section("Workflows").items(new ArrayList<>()).build();
            
            if (isBuilder || authorities.contains("Approver") || authorities.contains("Manager")) {
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
        List<Module> allowedModules = roleModules.stream()
                .map(RoleModule::getModule)
                .distinct()
                .collect(Collectors.toList());

        if (allowedModules.isEmpty()) return;

        // Fetch all active modules to build the full tree structure
        // In a real app, you'd filter by active=true here
        List<Module> allModules = roleModuleRepository.findAll().stream()
                .map(RoleModule::getModule)
                .distinct()
                .filter(m -> m.getActive() != null && m.getActive())
                .collect(Collectors.toList());

        // Group modules by their parent (could be parent_id or sub_parent_id)
        // We prioritize sub_parent_id for L3 linking
        Map<Long, List<Module>> childrenMap = new HashMap<>();
        for (Module m : allModules) {
            Long parentId = null;
            if (m.getSubParent() != null) {
                parentId = m.getSubParent().getId();
            } else if (m.getParent() != null) {
                parentId = m.getParent().getId();
            }
            
            if (parentId != null) {
                childrenMap.computeIfAbsent(parentId, k -> new ArrayList<>()).add(m);
            }
        }

        // We'll use a "Features" section for dynamic items
        MenuDto customSection = MenuDto.builder().section("Features").items(new ArrayList<>()).build();

        // Get Top Level (L1) modules assigned to roles
        List<Module> topLevel = allowedModules.stream()
                .filter(m -> m.getParent() == null && m.getSubParent() == null)
                .collect(Collectors.toList());

        for (Module m : topLevel) {
            customSection.getItems().add(mapToDto(m, allowedModules, childrenMap));
        }

        if (!customSection.getItems().isEmpty()) {
            menu.add(customSection);
        }
    }

    private MenuDto.MenuItemDto mapToDto(Module module, List<Module> allowedModules, Map<Long, List<Module>> childrenMap) {
        List<MenuDto.MenuItemDto> subItems = new ArrayList<>();
        
        List<Module> children = childrenMap.getOrDefault(module.getId(), Collections.emptyList());
        for (Module child : children) {
            // A child is allowed if it's explicitly assigned to the role
            // OR if it's a parent of something explicitly assigned to the role
            if (allowedModules.contains(child) || isParentOfAllowed(child, allowedModules, childrenMap)) {
                subItems.add(mapToDto(child, allowedModules, childrenMap));
            }
        }

        return MenuDto.MenuItemDto.builder()
                .label(module.getModuleName())
                .href(module.getPrefix())
                .icon(module.getIconCss())
                .subItems(subItems.isEmpty() ? null : subItems)
                .build();
    }

    private boolean isParentOfAllowed(Module parent, List<Module> allowedModules, Map<Long, List<Module>> childrenMap) {
        List<Module> children = childrenMap.getOrDefault(parent.getId(), Collections.emptyList());
        for (Module child : children) {
            if (allowedModules.contains(child) || isParentOfAllowed(child, allowedModules, childrenMap)) {
                return true;
            }
        }
        return false;
    }
}
