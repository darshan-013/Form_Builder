package com.formbuilder.workflow.controller;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.workflow.service.WorkflowService;
import com.formbuilder.workflow.dto.AdminWorkflowStatusDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping(AppConstants.API_ADMIN_WORKFLOWS)
@RequiredArgsConstructor
public class AdminWorkflowStatusController {

    private final WorkflowService workflowService;
    private final UserRoleService userRoleService;

    @GetMapping("/status")
    public ResponseEntity<?> status(Authentication auth,
                                    @RequestParam(name = "creator", required = false) String creator,
                                    @RequestParam(name = "status", required = false) String status,
                                    @RequestParam(name = "step", required = false) Integer step,
                                    @RequestParam(name = "fromDate", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDate,
                                    @RequestParam(name = "toDate", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDate) {
        Set<String> roles = userRoleService.getUserRoleNames(auth.getName());
        if (!roles.contains("Admin")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only Admin can view workflow monitoring"));
        }

        List<AdminWorkflowStatusDTO> rows = workflowService.getAdminStatuses(
                creator,
                status,
                step,
                fromDate,
                toDate
        );

        return ResponseEntity.ok(rows);
    }
}

