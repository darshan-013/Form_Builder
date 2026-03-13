package com.formbuilder.controller;

import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.AuditLogService;
import lombok.RequiredArgsConstructor;
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
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogService auditLogService;
    private final UserRoleService userRoleService;

    @GetMapping("/admin")
    public ResponseEntity<?> getAdminLogs(
            Authentication auth,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate) {

        Set<String> roleNames = userRoleService.getUserRoleNames(auth.getName());
        if (!roleNames.contains("Admin")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin can access full audit logs."));
        }

        List<Map<String, Object>> logs = auditLogService.getAdminLogs(action, user, fromDate, toDate);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/role-assignments")
    public ResponseEntity<?> getRoleAssignmentLogs(
            Authentication auth,
            @RequestParam(required = false) Integer roleId,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate) {

        Set<String> roleNames = userRoleService.getUserRoleNames(auth.getName());
        boolean isAdmin = roleNames.contains("Admin");
        boolean isRoleAdmin = roleNames.contains("Role Administrator");

        if (!isAdmin && !isRoleAdmin) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin or Role Administrator can access role assignment logs."));
        }

        List<Map<String, Object>> logs = auditLogService.getRoleAssignmentLogs(roleId, user, fromDate, toDate);
        return ResponseEntity.ok(logs);
    }
}

