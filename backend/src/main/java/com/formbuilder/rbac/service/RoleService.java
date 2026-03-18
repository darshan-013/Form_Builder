package com.formbuilder.rbac.service;

import com.formbuilder.rbac.entity.Permission;
import com.formbuilder.rbac.entity.Role;
import com.formbuilder.rbac.repository.PermissionRepository;
import com.formbuilder.rbac.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for managing roles and their permission assignments.
 *
 * Business Rules:
 * 1. Role name must be unique (case-insensitive check).
 * 2. System roles (is_system_role = TRUE) cannot be edited.
 * 3. System roles cannot be deleted.
 * 4. A Role Administrator can only assign permissions they themselves possess.
 *    Admin is exempt from this restriction (Admin holds all permissions).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepo;
    private final PermissionRepository permissionRepo;
    private final PermissionService permissionService;

    // ═══════════════════════════════════════════════════════════════════════
    //  CREATE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Creates a new custom role with the given permissions.
     *
     * @param roleName       unique role name
     * @param permissionKeys set of permission keys to assign (e.g. "READ", "WRITE")
     * @param actorUsername  the username of the Admin/Role Administrator performing this action
     * @param actorUserId    the rbac_users.id of the actor (stored as created_by)
     * @return the created Role entity with permissions loaded
     * @throws IllegalArgumentException if name is blank, already taken, or actor lacks permissions
     */
    @Transactional
    public Role createRole(String roleName, Set<String> permissionKeys,
                           String actorUsername, Integer actorUserId) {

        // ── Validate role name ───────────────────────────────────────────
        if (roleName == null || roleName.trim().isEmpty()) {
            throw new IllegalArgumentException("Role name cannot be blank");
        }
        String trimmedName = roleName.trim();

        if (roleRepo.existsByRoleName(trimmedName)) {
            throw new IllegalArgumentException("Role name already exists: " + trimmedName);
        }

        // ── Validate actor can assign these permissions ──────────────────
        validateActorPermissions(actorUsername, permissionKeys);

        // ── Resolve permission entities ──────────────────────────────────
        Set<Permission> permissions = resolvePermissions(permissionKeys);

        // ── Build and save ───────────────────────────────────────────────
        Role role = Role.builder()
                .roleName(trimmedName)
                .systemRole(false)
                .createdBy(actorUserId)
                .permissions(permissions)
                .build();

        Role saved = roleRepo.save(role);
        log.info("Role '{}' created by '{}' with permissions {}", trimmedName, actorUsername, permissionKeys);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Updates a custom role's name and/or permissions.
     *
     * @param roleId         the role to update
     * @param newRoleName    new name (null to keep existing)
     * @param permissionKeys full replacement set of permission keys (null to keep existing)
     * @param actorUsername  the user performing the update
     * @return the updated Role entity
     * @throws IllegalStateException    if attempting to edit a system role
     * @throws IllegalArgumentException if name conflict or actor lacks permissions
     * @throws NoSuchElementException   if role not found
     */
    @Transactional
    public Role updateRole(Integer roleId, String newRoleName, Set<String> permissionKeys,
                           String actorUsername) {

        Role role = roleRepo.findByIdWithPermissions(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        // ── System role guard ────────────────────────────────────────────
        if (role.isSystemRole()) {
            throw new IllegalStateException(
                    "System role '" + role.getRoleName() + "' cannot be edited. "
                            + "System roles are managed by the platform.");
        }

        // ── Update name if provided ──────────────────────────────────────
        if (newRoleName != null && !newRoleName.trim().isEmpty()) {
            String trimmedName = newRoleName.trim();
            if (!trimmedName.equals(role.getRoleName()) && roleRepo.existsByRoleName(trimmedName)) {
                throw new IllegalArgumentException("Role name already exists: " + trimmedName);
            }
            role.setRoleName(trimmedName);
        }

        // ── Update permissions if provided ───────────────────────────────
        if (permissionKeys != null) {
            validateActorPermissions(actorUsername, permissionKeys);
            Set<Permission> newPermissions = resolvePermissions(permissionKeys);
            role.getPermissions().clear();
            role.getPermissions().addAll(newPermissions);
        }

        Role saved = roleRepo.save(role);
        log.info("Role '{}' (id={}) updated by '{}'", saved.getRoleName(), roleId, actorUsername);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DELETE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Deletes a custom role. System roles cannot be deleted.
     *
     * @param roleId        the role to delete
     * @param actorUsername the user performing the deletion
     * @throws IllegalStateException  if attempting to delete a system role
     * @throws NoSuchElementException if role not found
     */
    @Transactional
    public void deleteRole(Integer roleId, String actorUsername) {
        Role role = roleRepo.findById(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        if (role.isSystemRole()) {
            throw new IllegalStateException(
                    "System role '" + role.getRoleName() + "' cannot be deleted. "
                            + "System roles are managed by the platform.");
        }

        // Soft delete the role
        role.setDeleted(true);
        roleRepo.save(role);
        log.info("Role '{}' (id={}) soft-deleted by '{}'", role.getRoleName(), roleId, actorUsername);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ASSIGN / REMOVE INDIVIDUAL PERMISSIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Adds specific permissions to an existing custom role.
     *
     * @param roleId         the role to modify
     * @param permissionKeys set of permission keys to add
     * @param actorUsername  the user performing the action
     * @return the updated Role
     */
    @Transactional
    public Role assignPermissionsToRole(Integer roleId, Set<String> permissionKeys,
                                        String actorUsername) {

        Role role = roleRepo.findByIdWithPermissions(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        if (role.isSystemRole()) {
            throw new IllegalStateException(
                    "Cannot modify permissions of system role '" + role.getRoleName() + "'");
        }

        validateActorPermissions(actorUsername, permissionKeys);
        Set<Permission> toAdd = resolvePermissions(permissionKeys);

        role.getPermissions().addAll(toAdd);
        Role saved = roleRepo.save(role);

        log.info("Permissions {} added to role '{}' by '{}'",
                permissionKeys, role.getRoleName(), actorUsername);
        return saved;
    }

    /**
     * Removes a single permission from an existing custom role.
     *
     * @param roleId        the role to modify
     * @param permissionKey the permission key to remove (e.g. "EXPORT")
     * @param actorUsername the user performing the action
     * @return the updated Role
     */
    @Transactional
    public Role removePermissionFromRole(Integer roleId, String permissionKey,
                                         String actorUsername) {

        Role role = roleRepo.findByIdWithPermissions(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        if (role.isSystemRole()) {
            throw new IllegalStateException(
                    "Cannot modify permissions of system role '" + role.getRoleName() + "'");
        }

        Permission permission = permissionRepo.findByPermissionKey(permissionKey)
                .orElseThrow(() -> new NoSuchElementException("Permission not found: " + permissionKey));

        boolean removed = role.getPermissions().remove(permission);
        if (!removed) {
            throw new IllegalArgumentException(
                    "Role '" + role.getRoleName() + "' does not have permission '" + permissionKey + "'");
        }

        Role saved = roleRepo.save(role);
        log.info("Permission '{}' removed from role '{}' by '{}'",
                permissionKey, role.getRoleName(), actorUsername);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  READ
    // ═══════════════════════════════════════════════════════════════════════

    /** Returns all roles with permissions eagerly loaded, ordered by system-first then alphabetical. */
    public List<Role> getAllRoles() {
        return roleRepo.findAllWithPermissions();
    }

    /** Returns a single role with permissions eagerly loaded. */
    public Role getRoleWithPermissions(Integer roleId) {
        return roleRepo.findByIdWithPermissions(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));
    }

    /**
     * Returns the permissions assigned to a role.
     *
     * @param roleId the role's primary key
     * @return set of permission entities
     * @throws NoSuchElementException if role not found
     */
    public Set<Permission> getRolePermissions(Integer roleId) {
        return getRoleWithPermissions(roleId).getPermissions();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Rule 4: A Role Administrator can only assign permissions they themselves hold.
     * Admin (who holds ALL permissions) is exempt — this check passes for them naturally.
     *
     * @param actorUsername  the user creating/updating the role
     * @param permissionKeys the permissions they want to assign
     * @throws IllegalArgumentException if actor tries to assign permissions they don't have
     */
    private void validateActorPermissions(String actorUsername, Set<String> permissionKeys) {
        if (permissionKeys == null || permissionKeys.isEmpty()) {
            return;
        }

        Set<String> actorPerms = permissionService.getPermissionKeysByUser(actorUsername);

        Set<String> unauthorized = permissionKeys.stream()
                .filter(key -> !actorPerms.contains(key))
                .collect(Collectors.toSet());

        if (!unauthorized.isEmpty()) {
            throw new IllegalArgumentException(
                    "You cannot assign permissions you do not have: " + unauthorized);
        }
    }

    /**
     * Converts a set of permission key strings to Permission entities.
     * Validates that every key is a real permission.
     *
     * @param permissionKeys set of keys like {"READ", "WRITE"}
     * @return set of Permission entities
     * @throws NoSuchElementException if any key doesn't match a known permission
     */
    private Set<Permission> resolvePermissions(Set<String> permissionKeys) {
        if (permissionKeys == null || permissionKeys.isEmpty()) {
            return new HashSet<>();
        }

        List<Permission> found = permissionRepo.findByPermissionKeyIn(permissionKeys);

        // Verify all requested keys were found
        Set<String> foundKeys = found.stream()
                .map(Permission::getPermissionKey)
                .collect(Collectors.toSet());

        Set<String> missing = permissionKeys.stream()
                .filter(key -> !foundKeys.contains(key))
                .collect(Collectors.toSet());

        if (!missing.isEmpty()) {
            throw new NoSuchElementException("Unknown permissions: " + missing);
        }

        return new HashSet<>(found);
    }
}
