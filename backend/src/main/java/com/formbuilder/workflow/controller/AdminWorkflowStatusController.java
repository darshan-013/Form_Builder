package com.formbuilder.workflow;

import com.formbuilder.rbac.service.UserRoleService;
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
@RequestMapping("/api/admin/workflows")
@RequiredArgsConstructor
public class AdminWorkflowStatusController {

    private final WorkflowService workflowService;
    private final UserRoleService userRoleService;

    @GetMapping("/status")
    public ResponseEntity<?> status(Authentication auth,
                                    @RequestParam(required = false) String creator,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) Integer step,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDate,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDate) {
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

