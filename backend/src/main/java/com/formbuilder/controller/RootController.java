package com.formbuilder.controller;

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
                "endpoints", Map.of(
                        "auth", Map.of(
                                "register", "POST /api/auth/register",
                                "login", "POST /api/auth/login",
                                "logout", "POST /api/auth/logout",
                                "me", "GET /api/auth/me"
                        ),
                        "forms", Map.of(
                                "list", "GET /api/forms",
                                "get", "GET /api/forms/{id}",
                                "create", "POST /api/forms",
                                "update", "PUT /api/forms/{id}",
                                "delete", "DELETE /api/forms/{id}"
                        ),
                        "submissions", Map.of(
                                "submit", "POST /api/forms/{id}/submit",
                                "list", "GET /api/forms/{id}/submissions"
                        )
                ),
                "documentation", "Access the API endpoints listed above"
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

