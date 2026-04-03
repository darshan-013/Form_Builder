package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;

import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping(AppConstants.API_LOGS)
@RequiredArgsConstructor
@com.formbuilder.rbac.security.RequirePermission("AUDIT")
public class AuditLogController {

    private static final Logger log = LoggerFactory.getLogger(AuditLogController.class);

    private final AuditLogService auditLogService;
    private final UserRoleService userRoleService;

    /**
     * GET /api/v1/logs/admin
     * Complete system audit trail. Restricted to users with Admin role.
     */
    @GetMapping(AppConstants.LOGS_ADMIN)
    public ResponseEntity<?> getAdminLogs(
            Authentication auth,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate) {

        // Use a more robust check for Admin role
        boolean isAdmin = userRoleService.userHasRole(auth.getName(), "Admin");
        
        if (!isAdmin) {
            log.warn("Access denied to admin logs for user '{}' — role Admin required", auth.getName());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin can access the full system audit trail."));
        }

        List<Map<String, Object>> logs = auditLogService.getAdminLogs(action, user, fromDate, toDate);
        return ResponseEntity.ok(logs);
    }

    /**
     * GET /api/v1/logs/role-assignments
     * Filtered audit logs for role/permission changes. Accessible by Admin and Role Administrator.
     */
    @GetMapping(AppConstants.LOGS_ROLE_ASSIGNMENTS)
    public ResponseEntity<?> getRoleAssignmentLogs(
            Authentication auth,
            @RequestParam(required = false) Integer roleId,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate) {

        boolean isAdmin = userRoleService.userHasRole(auth.getName(), "Admin");
        boolean isRoleAdmin = userRoleService.userHasRole(auth.getName(), "Role Administrator");

        if (!isAdmin && !isRoleAdmin) {
            log.warn("Access denied to role assignment logs for user '{}'", auth.getName());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin or Role Administrator can access role assignment logs."));
        }

        List<Map<String, Object>> logs = auditLogService.getRoleAssignmentLogs(roleId, user, fromDate, toDate);
        return ResponseEntity.ok(logs);
    }
}

