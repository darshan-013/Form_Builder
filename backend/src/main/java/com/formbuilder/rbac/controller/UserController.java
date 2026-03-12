package com.formbuilder.rbac.controller;

import com.formbuilder.rbac.entity.Permission;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.security.RequirePermission;
import com.formbuilder.rbac.service.UserRoleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST Controller for RBAC user management and role assignment.
 *
 * All endpoints require the MANAGE permission — enforced by
 * {@code @RequirePermission("MANAGE")} at class level via
 * {@link com.formbuilder.rbac.security.PermissionInterceptor}.
 *
 * <pre>
 * GET    /api/users                    → list all RBAC users with their roles
 * POST   /api/users                    → create an RBAC user profile
 * PUT    /api/users/{id}               → update user name/email
 * DELETE /api/users/{id}               → delete RBAC user profile
 * POST   /api/users/{id}/roles         → assign a role to a user
 * DELETE /api/users/{id}/roles/{roleId}→ remove a role from a user
 * GET    /api/users/{id}/permissions   → get effective permissions for a user
 * </pre>
 */
@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@RequirePermission("MANAGE")
public class UserController {

    private final UserRoleService userRoleService;

    // ── GET /api/users ───────────────────────────────────────────────────

    /**
     * Returns all RBAC users with their assigned roles.
     * Excludes the currently logged-in user from the list.
     * If the requesting user is a Role Administrator (not Admin),
     * also excludes users who have the Admin role.
     */
    @GetMapping
    public ResponseEntity<?> getAllUsers(Authentication auth) {
        List<User> users = userRoleService.getAllUsers();

        String currentUsername = auth != null ? auth.getName() : null;
        Set<String> myRoles = currentUsername != null
                ? userRoleService.getUserRoleNames(currentUsername)
                : Set.of();
        boolean iAmAdmin = myRoles.contains("Admin");

        List<Map<String, Object>> response = users.stream()
                .filter(u -> !u.getUsername().equals(currentUsername))
                // Role Administrator cannot see Admin or other Role Administrator users
                .filter(u -> {
                    if (iAmAdmin) return true; // Admin sees everyone
                    // Check if this user has Admin or Role Administrator role
                    boolean userIsAdmin = u.getRoles().stream()
                            .anyMatch(r -> r.getRoleName().equals("Admin") || r.getRoleName().equals("Role Administrator"));
                    return !userIsAdmin;
                })
                .map(this::toUserResponse)
                .toList();

        return ResponseEntity.ok(response);
    }

    // ── POST /api/users ──────────────────────────────────────────────────

    /**
     * Creates a new RBAC user profile.
     * The username must already exist in the Spring Security 'users' table
     * (registered via /api/auth/register).
     *
     * Request body:
     * <pre>
     * {
     *   "username": "john_doe",
     *   "name": "John Doe",
     *   "email": "john@example.com"
     * }
     * </pre>
     */
    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody CreateUserRequest body) {

        if (body.username == null || body.username.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Username is required"));
        }

        User created = userRoleService.createUser(body.username, body.name, body.email);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toUserResponse(created));
    }

    // ── PUT /api/users/{id} ──────────────────────────────────────────────

    /**
     * Updates an RBAC user's display name and/or email.
     *
     * Request body:
     * <pre>
     * {
     *   "name": "John Updated",
     *   "email": "john.updated@example.com"
     * }
     * </pre>
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateUser(@PathVariable Integer id,
                                        @RequestBody UpdateUserRequest body) {

        User updated = userRoleService.updateUser(id, body.name, body.email);

        return ResponseEntity.ok(toUserResponse(updated));
    }

    // ── DELETE /api/users/{id} ───────────────────────────────────────────

    /**
     * Deletes an RBAC user profile. CASCADE in DB handles user_roles cleanup.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Integer id) {

        userRoleService.deleteUser(id);

        return ResponseEntity.ok(Map.of("message", "User deleted successfully"));
    }

    // ── POST /api/users/{id}/roles ───────────────────────────────────────

    /**
     * Assigns a role to a user.
     *
     * Request body:
     * <pre>
     * {
     *   "roleId": 3
     * }
     * </pre>
     *
     * Uses INSERT INTO user_roles(user_id, role_id) VALUES (?, ?)
     * ON CONFLICT DO NOTHING — idempotent.
     */
    @PostMapping("/{id}/roles")
    public ResponseEntity<?> assignRole(@PathVariable Integer id,
                                        @RequestBody AssignRoleRequest body) {

        if (body.roleId == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "roleId is required"));
        }

        User updated = userRoleService.assignRoleToUserById(id, body.roleId);

        return ResponseEntity.ok(toUserResponse(updated));
    }

    // ── DELETE /api/users/{id}/roles/{roleId} ────────────────────────────

    /**
     * Removes a role from a user.
     */
    @DeleteMapping("/{id}/roles/{roleId}")
    public ResponseEntity<?> removeRole(@PathVariable Integer id,
                                        @PathVariable Integer roleId) {

        User updated = userRoleService.removeRoleFromUserById(id, roleId);

        return ResponseEntity.ok(toUserResponse(updated));
    }

    // ── GET /api/users/{id}/permissions ──────────────────────────────────

    /**
     * Returns the effective permissions for a user — the union of all
     * permissions across all assigned roles.
     *
     * Response:
     * <pre>
     * {
     *   "permissions": ["APPROVE", "READ", "WRITE"]
     * }
     * </pre>
     */
    @GetMapping("/{id}/permissions")
    public ResponseEntity<?> getUserPermissions(@PathVariable Integer id) {

        Set<String> permissionKeys = userRoleService.getUserPermissionKeysById(id);

        return ResponseEntity.ok(Map.of(
                "permissions", permissionKeys.stream().sorted().toList()
        ));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  RESPONSE BUILDER
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Converts a User entity to a clean JSON-friendly map.
     * Avoids exposing JPA internals / lazy proxy objects.
     */
    private Map<String, Object> toUserResponse(User user) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", user.getId());
        map.put("username", user.getUsername());
        map.put("name", user.getName());
        map.put("email", user.getEmail());
        map.put("createdAt", user.getCreatedAt());
        map.put("roles", user.getRoles().stream()
                .map(role -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("id", role.getId());
                    r.put("roleName", role.getRoleName());
                    r.put("isSystemRole", role.isSystemRole());
                    r.put("permissions", role.getPermissions().stream()
                            .map(Permission::getPermissionKey)
                            .sorted()
                            .toList());
                    return r;
                })
                .sorted(Comparator.comparing(r -> (String) r.get("roleName")))
                .toList());
        // Also include flattened effective permissions
        map.put("permissions", user.getRoles().stream()
                .flatMap(role -> role.getPermissions().stream())
                .map(Permission::getPermissionKey)
                .distinct()
                .sorted()
                .toList());
        return map;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REQUEST DTOs
    // ═══════════════════════════════════════════════════════════════════════

    /** POST /api/users request body. */
    public static class CreateUserRequest {
        public String username;
        public String name;
        public String email;
    }

    /** PUT /api/users/{id} request body. */
    public static class UpdateUserRequest {
        public String name;
        public String email;
    }

    /** POST /api/users/{id}/roles request body. */
    public static class AssignRoleRequest {
        public Integer roleId;
    }
}


