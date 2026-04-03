package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Root endpoint controller - provides API information at http://localhost:8080
 */
@RestController
public class RootController {

    @GetMapping("/")
    public ResponseEntity<?> root() {
        return ResponseEntity.ok(Map.of(
                "application", "Form Builder API",
                "version", "1.0.0",
                "status", "running",
                "timestamp", LocalDateTime.now().toString(),
                "basePath", AppConstants.API_BASE,
                "endpoints", Map.of(
                        "auth", Map.of(
                                "register", "POST " + AppConstants.API_AUTH + "/register",
                                "login", "POST " + AppConstants.API_AUTH + AppConstants.AUTH_LOGIN,
                                "logout", "POST " + AppConstants.API_AUTH + AppConstants.AUTH_LOGOUT,
                                "me", "GET " + AppConstants.API_AUTH + AppConstants.AUTH_ME
                        ),
                        "forms", Map.of(
                                "list", "GET " + AppConstants.API_FORMS,
                                "get", "GET " + AppConstants.API_FORMS + "/{id}",
                                "create", "POST " + AppConstants.API_FORMS,
                                "update", "PUT " + AppConstants.API_FORMS + "/{id}",
                                "delete", "DELETE " + AppConstants.API_FORMS + "/{id}"
                        )
                ),
                "documentation", "Access the v1 API endpoints listed above"
        ));
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "timestamp", LocalDateTime.now().toString()
        ));
    }
}

