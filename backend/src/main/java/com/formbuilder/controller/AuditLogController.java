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
import java.util.LinkedHashMap;
import java.util.Map;

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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(defaultValue = "0") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {

        // Use a more robust check for Admin role
        boolean isAdmin = userRoleService.userHasRole(auth.getName(), "Admin");
        
        if (!isAdmin) {
            log.warn("Access denied to admin logs for user '{}' — role Admin required", auth.getName());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin can access the full system audit trail."));
        }

        int safePage = normalizePage(page);
        int safeSize = normalizeSize(size);
        AuditLogService.PagedResult result = auditLogService.getAdminLogsPaged(action, user, fromDate, toDate, safePage, safeSize);
        return ResponseEntity.ok(toPagedResponse(result.content(), safePage, safeSize, result.totalElements()));
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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(defaultValue = "0") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {

        boolean isAdmin = userRoleService.userHasRole(auth.getName(), "Admin");
        boolean isRoleAdmin = userRoleService.userHasRole(auth.getName(), "Role Administrator");

        if (!isAdmin && !isRoleAdmin) {
            log.warn("Access denied to role assignment logs for user '{}'", auth.getName());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin or Role Administrator can access role assignment logs."));
        }

        int safePage = normalizePage(page);
        int safeSize = normalizeSize(size);
        AuditLogService.PagedResult result = auditLogService.getRoleAssignmentLogsPaged(roleId, user, fromDate, toDate, safePage, safeSize);
        return ResponseEntity.ok(toPagedResponse(result.content(), safePage, safeSize, result.totalElements()));
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

    private Map<String, Object> toPagedResponse(List<Map<String, Object>> content, int page, int size, long totalElements) {
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

