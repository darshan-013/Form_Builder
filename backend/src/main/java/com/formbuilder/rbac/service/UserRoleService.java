package com.formbuilder.rbac.service;

import com.formbuilder.rbac.entity.Permission;
import com.formbuilder.rbac.entity.Role;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.RoleRepository;
import com.formbuilder.rbac.repository.UserRepository;
import com.formbuilder.workflow.WorkflowService;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for managing RBAC user profiles, user ↔ role assignments,
 * and querying a user's effective roles and permissions.
 *
 * This service works with the RBAC user profile (rbac_users table),
 * NOT the Spring Security users table directly.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserRoleService {

    private final UserRepository userRepo;
    private final RoleRepository roleRepo;
    private final JdbcTemplate jdbc;
    private final EntityManager entityManager;
    private final WorkflowService workflowService;

    // ═══════════════════════════════════════════════════════════════════════
    //  USER CRUD
    // ═══════════════════════════════════════════════════════════════════════

    /** Returns all RBAC users with roles + permissions eagerly loaded. */
    public List<User> getAllUsers() {
        return userRepo.findAllWithRolesAndPermissions();
    }

    /** Returns a single user with roles + permissions eagerly loaded. */
    public User getUserById(Integer id) {
        return userRepo.findByIdWithRolesAndPermissions(id)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + id));
    }

    /**
     * Creates a new RBAC user profile with credentials.
     * If password is null/empty, a random password is generated
     * (user must use password reset to set their own).
     */
    @Transactional
    public User createUser(String username, String name, String email) {
        if (username == null || username.trim().isEmpty()) {
            throw new IllegalArgumentException("Username is required");
        }
        if (userRepo.existsByUsername(username.trim())) {
            throw new IllegalArgumentException("User profile already exists for username: " + username);
        }
        if (email != null && !email.trim().isEmpty() && userRepo.existsByEmail(email.trim())) {
            throw new IllegalArgumentException("Email already in use: " + email);
        }

        User user = User.builder()
                .username(username.trim())
                .password("")  // No password — admin-created profiles need the user to register or reset
                .name(name != null ? name.trim() : null)
                .email(email != null && !email.trim().isEmpty() ? email.trim() : null)
                .enabled(true)
                .build();

        User saved = userRepo.save(user);
        log.info("RBAC user profile created for '{}'", username);
        return saved;
    }

    /** Updates an RBAC user's name and/or email. */
    @Transactional
    public User updateUser(Integer id, String name, String email) {
        User user = userRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + id));

        if (name != null) {
            user.setName(name.trim());
        }
        if (email != null) {
            String trimmedEmail = email.trim();
            if (!trimmedEmail.isEmpty()) {
                // Check uniqueness only if email changed
                if (!trimmedEmail.equals(user.getEmail()) && userRepo.existsByEmail(trimmedEmail)) {
                    throw new IllegalArgumentException("Email already in use: " + trimmedEmail);
                }
                user.setEmail(trimmedEmail);
            } else {
                user.setEmail(null);
            }
        }

        User saved = userRepo.save(user);
        log.info("RBAC user profile updated for '{}' (id={})", user.getUsername(), id);
        return saved;
    }

    /** Deletes an RBAC user profile and returns workflow-impact stats. */
    @Transactional
    public DeleteUserImpact deleteUser(Integer id) {
        User user = userRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + id));

        if ("admin".equalsIgnoreCase(user.getUsername()) || user.hasRole("Admin")) {
            throw new IllegalStateException("Core admin accounts cannot be deleted.");
        }

        Integer fallbackUserId = resolveWorkflowFallbackUserId(id);
        String reason = "Workflow rejected because user '" + user.getUsername() + "' was removed permanently.";
        int rejected = workflowService.rejectActiveWorkflowsForUser(id, reason);

        // Preserve workflow history by re-linking references to fallback admin account.
        int movedCreatorRefs = jdbc.update("UPDATE workflow_instances SET creator_id = ? WHERE creator_id = ?", fallbackUserId, id);
        int movedTargetRefs = jdbc.update("UPDATE workflow_instances SET target_builder_id = ? WHERE target_builder_id = ?", fallbackUserId, id);
        int movedStepRefs = jdbc.update("UPDATE workflow_steps SET approver_id = ? WHERE approver_id = ?", fallbackUserId, id);

        // Clean assignment fields for non-started forms owned by deleted builder.
        jdbc.update("UPDATE forms SET assigned_builder_id = NULL, assigned_builder_username = NULL WHERE assigned_builder_id = ?", id);

        if (rejected > 0 || movedCreatorRefs > 0 || movedTargetRefs > 0 || movedStepRefs > 0) {
            log.warn("User '{}' (id={}) deletion impact: rejectedWorkflows={}, creatorRefsMoved={}, targetRefsMoved={}, stepRefsMoved={}",
                    user.getUsername(), id, rejected, movedCreatorRefs, movedTargetRefs, movedStepRefs);
        }

        userRepo.delete(user);
        log.info("RBAC user profile deleted for '{}' (id={})", user.getUsername(), id);

        return DeleteUserImpact.builder()
                .deletedUserId(id)
                .deletedUsername(user.getUsername())
                .rejectedWorkflows(rejected)
                .creatorRefsMoved(movedCreatorRefs)
                .targetRefsMoved(movedTargetRefs)
                .stepRefsMoved(movedStepRefs)
                .build();
    }

    private Integer resolveWorkflowFallbackUserId(Integer deletingUserId) {
        return userRepo.findByUsername("admin")
                .filter(u -> !Objects.equals(u.getId(), deletingUserId))
                .map(User::getId)
                .orElseThrow(() -> new IllegalStateException(
                        "Cannot delete user because fallback admin account is missing."));
    }

    @lombok.Value
    @lombok.Builder
    public static class DeleteUserImpact {
        Integer deletedUserId;
        String deletedUsername;
        int rejectedWorkflows;
        int creatorRefsMoved;
        int targetRefsMoved;
        int stepRefsMoved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ASSIGN ROLE TO USER (by user ID)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Assigns exactly one role to a user by user ID.
     * Existing role assignments are replaced so each user has a single role.
     */
    @Transactional
    public User assignRoleToUserById(Integer userId, Integer roleId) {
        User user = userRepo.findByIdWithRolesAndPermissions(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        Role role = roleRepo.findById(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        Role currentRole = user.getRoles().stream().findFirst().orElse(null);
        if (currentRole != null && currentRole.getId().equals(roleId)) {
            log.debug("Role '{}' is already assigned to user '{}' (id={}) — skipping", role.getRoleName(), user.getUsername(), userId);
            return user;
        }

        // Enforce single-role policy: replace any existing role assignment.
        jdbc.update("DELETE FROM user_roles WHERE user_id = ?", userId);
        jdbc.update("INSERT INTO user_roles(user_id, role_id) VALUES (?, ?)", userId, roleId);

        // JDBC writes bypass JPA tracking; clear 1st-level cache so re-query sees latest role.
        entityManager.clear();

        // Reload to get fresh state
        User reloaded = userRepo.findByIdWithRolesAndPermissions(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        log.info("Role '{}' assigned to user '{}' (id={})", role.getRoleName(), user.getUsername(), userId);
        return reloaded;
    }

    /**
     * Removes a role from a user by user ID.
     * Single-role policy requires at least one role, so removing the current
     * role is not allowed via this endpoint.
     */
    @Transactional
    public User removeRoleFromUserById(Integer userId, Integer roleId) {
        User user = userRepo.findByIdWithRolesAndPermissions(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        Role role = roleRepo.findById(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        if (user.getRoles().size() <= 1) {
            throw new IllegalArgumentException("Each user must have exactly one role. Assign a new role instead.");
        }

        boolean removed = user.getRoles().removeIf(r -> r.getId().equals(roleId));

        if (!removed) {
            throw new IllegalArgumentException(
                    "User '" + user.getUsername() + "' does not have role '" + role.getRoleName() + "'");
        }

        User saved = userRepo.save(user);
        log.info("Role '{}' removed from user '{}' (id={})", role.getRoleName(), user.getUsername(), userId);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ASSIGN ROLE TO USER (by username — kept for backward compatibility)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Backward-compatible username path, now enforcing single-role policy.
     */
    @Transactional
    public User assignRoleToUser(String username, Integer roleId) {
        User user = userRepo.findByUsernameWithRolesAndPermissions(username)
                .orElseThrow(() -> new NoSuchElementException(
                        "RBAC user not found: " + username
                                + ". Ensure the user has a profile in rbac_users."));

        Role role = roleRepo.findById(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        Role currentRole = user.getRoles().stream().findFirst().orElse(null);
        if (currentRole != null && currentRole.getId().equals(roleId)) {
            log.debug("Role '{}' is already assigned to user '{}' — skipping", role.getRoleName(), username);
            return user;
        }

        user.getRoles().clear();
        user.getRoles().add(role);
        User saved = userRepo.save(user);

        log.info("Role '{}' assigned to user '{}'", role.getRoleName(), username);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REMOVE ROLE FROM USER (by username — kept for backward compatibility)
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    public User removeRoleFromUser(String username, Integer roleId) {
        User user = userRepo.findByUsernameWithRolesAndPermissions(username)
                .orElseThrow(() -> new NoSuchElementException(
                        "RBAC user not found: " + username));

        Role role = roleRepo.findById(roleId)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + roleId));

        if (user.getRoles().size() <= 1) {
            throw new IllegalArgumentException("Each user must have exactly one role. Assign a new role instead.");
        }

        boolean removed = user.getRoles().removeIf(r -> r.getId().equals(roleId));

        if (!removed) {
            throw new IllegalArgumentException(
                    "User '" + username + "' does not have role '" + role.getRoleName() + "'");
        }

        User saved = userRepo.save(user);
        log.info("Role '{}' removed from user '{}'", role.getRoleName(), username);
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  READ — USER ROLES
    // ═══════════════════════════════════════════════════════════════════════

    public Set<Role> getUserRoles(String username) {
        User user = userRepo.findByUsernameWithRolesAndPermissions(username)
                .orElseThrow(() -> new NoSuchElementException(
                        "RBAC user not found: " + username));
        return user.getRoles();
    }

    public Set<String> getUserRoleNames(String username) {
        return getUserRoles(username).stream()
                .map(Role::getRoleName)
                .collect(Collectors.toSet());
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  READ — USER PERMISSIONS (effective, union across all roles)
    // ═══════════════════════════════════════════════════════════════════════

    public Set<Permission> getUserPermissions(String username) {
        User user = userRepo.findByUsernameWithRolesAndPermissions(username)
                .orElseThrow(() -> new NoSuchElementException(
                        "RBAC user not found: " + username));

        return user.getRoles().stream()
                .flatMap(role -> role.getPermissions().stream())
                .collect(Collectors.toSet());
    }

    /** Returns effective permissions for a user by ID. */
    public Set<Permission> getUserPermissionsById(Integer userId) {
        User user = userRepo.findByIdWithRolesAndPermissions(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + userId));

        return user.getRoles().stream()
                .flatMap(role -> role.getPermissions().stream())
                .collect(Collectors.toSet());
    }

    public Set<String> getUserPermissionKeys(String username) {
        return getUserPermissions(username).stream()
                .map(Permission::getPermissionKey)
                .collect(Collectors.toSet());
    }

    /** Returns effective permission key strings for a user by ID. */
    public Set<String> getUserPermissionKeysById(Integer userId) {
        return getUserPermissionsById(userId).stream()
                .map(Permission::getPermissionKey)
                .collect(Collectors.toSet());
    }

    public boolean userHasPermission(String username, String permissionKey) {
        try {
            return getUserPermissionKeys(username).contains(permissionKey);
        } catch (NoSuchElementException e) {
            log.warn("Permission check for unknown RBAC user '{}' — denied", username);
            return false;
        }
    }

    public boolean userHasRole(String username, String roleName) {
        try {
            return getUserRoleNames(username).contains(roleName);
        } catch (NoSuchElementException e) {
            return false;
        }
    }
}

