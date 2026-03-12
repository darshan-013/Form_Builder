package com.formbuilder.rbac.controller;

import com.formbuilder.rbac.entity.Permission;
import com.formbuilder.rbac.entity.Role;
import com.formbuilder.rbac.security.RequirePermission;
import com.formbuilder.rbac.service.RoleService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST Controller for Role management.
 *
 * All endpoints require the MANAGE permission — enforced by
 * {@code @RequirePermission("MANAGE")} at class level, which is
 * checked by the {@link com.formbuilder.rbac.security.PermissionInterceptor}
 * before any handler method executes.
 *
 * <pre>
 * GET    /api/roles              → list all roles with their permissions
 * POST   /api/roles              → create a custom role
 * PUT    /api/roles/{id}         → update a custom role (name and/or permissions)
 * DELETE /api/roles/{id}         → delete a custom role (system roles are protected)
 * POST   /api/roles/{id}/permissions → add permissions to an existing role
 * </pre>
 */
@Slf4j
@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
@RequirePermission("MANAGE")
public class RoleController {

    private final RoleService roleService;

    // ── GET /api/roles ───────────────────────────────────────────────────

    /**
     * Returns all roles (system + custom) with their assigned permissions.
     * System roles appear first, then alphabetical.
     */
    @GetMapping
    public ResponseEntity<?> getAllRoles() {
        List<Role> roles = roleService.getAllRoles();

        List<Map<String, Object>> response = roles.stream()
                .map(this::toRoleResponse)
                .toList();

        return ResponseEntity.ok(response);
    }

    // ── POST /api/roles ──────────────────────────────────────────────────

    /**
     * Creates a new custom role.
     *
     * Request body:
     * <pre>
     * {
     *   "name": "Regional Auditor",
     *   "permissions": ["READ", "EXPORT", "AUDIT"]
     * }
     * </pre>
     *
     * Validations (enforced by RoleService):
     * 1. Role name must be unique
     * 4. Actor cannot assign permissions they don't hold
     */
    @PostMapping
    public ResponseEntity<?> createRole(@RequestBody CreateRoleRequest body,
                                        Authentication auth,
                                        HttpSession session) {

        // Validate request body
        if (body.name == null || body.name.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Role name is required"));
        }
        if (body.permissions == null || body.permissions.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "At least one permission is required"));
        }

        Integer actorUserId = (Integer) session.getAttribute("USER_ID");
        String actorUsername = auth.getName();

        Role created = roleService.createRole(
                body.name,
                new LinkedHashSet<>(body.permissions),
                actorUsername,
                actorUserId
        );

        // Reload with permissions for response
        Role loaded = roleService.getRoleWithPermissions(created.getId());

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toRoleResponse(loaded));
    }

    // ── PUT /api/roles/{id} ──────────────────────────────────────────────

    /**
     * Updates a custom role's name and/or permissions.
     *
     * Request body:
     * <pre>
     * {
     *   "name": "Updated Name",         // optional — null keeps existing
     *   "permissions": ["READ", "WRITE"] // optional — null keeps existing
     * }
     * </pre>
     *
     * Validations (enforced by RoleService):
     * 1. Role name must be unique (if changed)
     * 2. System roles cannot be edited
     * 4. Actor cannot assign permissions they don't hold
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateRole(@PathVariable Integer id,
                                        @RequestBody UpdateRoleRequest body,
                                        Authentication auth) {

        Set<String> permKeys = body.permissions != null
                ? new LinkedHashSet<>(body.permissions)
                : null;

        Role updated = roleService.updateRole(id, body.name, permKeys, auth.getName());

        // Reload with permissions for response
        Role loaded = roleService.getRoleWithPermissions(updated.getId());

        return ResponseEntity.ok(toRoleResponse(loaded));
    }

    // ── DELETE /api/roles/{id} ───────────────────────────────────────────

    /**
     * Deletes a custom role. System roles are protected.
     *
     * Validations (enforced by RoleService):
     * 3. System roles cannot be deleted
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRole(@PathVariable Integer id,
                                        Authentication auth) {

        roleService.deleteRole(id, auth.getName());

        return ResponseEntity.ok(Map.of("message", "Role deleted successfully"));
    }

    // ── POST /api/roles/{id}/permissions ─────────────────────────────────

    /**
     * Adds permissions to an existing custom role (additive — does not remove
     * existing permissions).
     *
     * Request body:
     * <pre>
     * {
     *   "permissions": ["EXPORT", "AUDIT"]
     * }
     * </pre>
     *
     * Validations (enforced by RoleService):
     * 2. System roles cannot be edited
     * 4. Actor cannot assign permissions they don't hold
     */
    @PostMapping("/{id}/permissions")
    public ResponseEntity<?> assignPermissions(@PathVariable Integer id,
                                               @RequestBody PermissionsRequest body,
                                               Authentication auth) {

        if (body.permissions == null || body.permissions.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "At least one permission is required"));
        }

        Role updated = roleService.assignPermissionsToRole(
                id,
                new LinkedHashSet<>(body.permissions),
                auth.getName()
        );

        // Reload with permissions for response
        Role loaded = roleService.getRoleWithPermissions(updated.getId());

        return ResponseEntity.ok(toRoleResponse(loaded));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  RESPONSE BUILDER
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Converts a Role entity to a clean JSON-friendly map.
     * Avoids exposing JPA internals / lazy proxy objects.
     */
    private Map<String, Object> toRoleResponse(Role role) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", role.getId());
        map.put("roleName", role.getRoleName());
        map.put("isSystemRole", role.isSystemRole());
        map.put("createdBy", role.getCreatedBy());
        map.put("createdAt", role.getCreatedAt());
        map.put("updatedAt", role.getUpdatedAt());
        map.put("permissions", role.getPermissions().stream()
                .map(Permission::getPermissionKey)
                .sorted()
                .toList());
        return map;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REQUEST DTOs (inner classes — scoped to this controller only)
    // ═══════════════════════════════════════════════════════════════════════

    /** POST /api/roles request body. */
    public static class CreateRoleRequest {
        public String name;
        public List<String> permissions;
    }

    /** PUT /api/roles/{id} request body. */
    public static class UpdateRoleRequest {
        public String name;
        public List<String> permissions;
    }

    /** POST /api/roles/{id}/permissions request body. */
    public static class PermissionsRequest {
        public List<String> permissions;
    }
}



