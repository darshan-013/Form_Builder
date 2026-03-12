package com.formbuilder.rbac.service;

import com.formbuilder.rbac.entity.Permission;
import com.formbuilder.rbac.entity.Role;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.PermissionRepository;
import com.formbuilder.rbac.repository.RoleRepository;
import com.formbuilder.rbac.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Read-only service for the fixed permissions table.
 *
 * Permissions are seeded by migration and NEVER created/modified at runtime.
 * This service provides query methods consumed by RoleService, UserRoleService,
 * and controllers.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PermissionService {

    private final PermissionRepository permissionRepo;
    private final RoleRepository roleRepo;
    private final UserRepository userRepo;

    // ── All Permissions ──────────────────────────────────────────────────

    /** Returns all 9 fixed permissions ordered by id. */
    public List<Permission> getAllPermissions() {
        return permissionRepo.findAll();
    }

    // ── Permissions by Role ──────────────────────────────────────────────

    /**
     * Returns permissions assigned to a specific role.
     *
     * @param roleId the role's primary key
     * @return set of Permission entities (empty if role has none)
     * @throws NoSuchElementException if role not found
     */
    public Set<Permission> getPermissionsByRole(Integer roleId) {
        Role role = roleRepo.findByIdWithPermissions(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));
        return role.getPermissions();
    }

    // ── Permissions by User ──────────────────────────────────────────────

    /**
     * Returns the union of all permissions across all roles assigned to a user.
     * This is the effective permission set that determines what the user can do.
     *
     * @param username the Spring Security username
     * @return set of Permission entities (empty if user has no roles)
     * @throws NoSuchElementException if user not found
     */
    public Set<Permission> getPermissionsByUser(String username) {
        User user = userRepo.findByUsernameWithRolesAndPermissions(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));
        return user.getRoles().stream()
                .flatMap(r -> r.getPermissions().stream())
                .collect(Collectors.toSet());
    }

    /**
     * Returns effective permission keys (strings) for a user.
     * Convenience method for authorization checks.
     *
     * @param username the Spring Security username
     * @return set of permission key strings, e.g. {"READ", "WRITE", "EXPORT"}
     * @throws NoSuchElementException if user not found
     */
    public Set<String> getPermissionKeysByUser(String username) {
        return getPermissionsByUser(username).stream()
                .map(Permission::getPermissionKey)
                .collect(Collectors.toSet());
    }

    /**
     * Quick check: does the user hold a specific permission?
     *
     * @param username      the Spring Security username
     * @param permissionKey e.g. "READ", "MANAGE"
     * @return true if any of the user's roles grant this permission
     */
    public boolean userHasPermission(String username, String permissionKey) {
        try {
            return getPermissionKeysByUser(username).contains(permissionKey);
        } catch (NoSuchElementException e) {
            // User has no RBAC profile yet — deny by default
            return false;
        }
    }
}

