package com.formbuilder.controller;

import com.formbuilder.dto.RegisterRequest;
import com.formbuilder.rbac.entity.Permission;
import com.formbuilder.rbac.entity.Role;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.RoleRepository;
import com.formbuilder.rbac.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepo;
    private final RoleRepository roleRepo;

    /**
     * POST /api/auth/register
     * Creates a new user directly in rbac_users table with BCrypt password.
     * Assigns the Viewer role (READ only). Admin must promote to higher roles.
     */
    @PostMapping("/register")
    @Transactional
    public ResponseEntity<?> register(@RequestBody RegisterRequest req) {
        if (req.getUsername() == null || req.getUsername().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Username is required"));
        }
        if (req.getEmail() == null || req.getEmail().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Email is required"));
        }
        if (req.getPassword() == null || req.getPassword().length() < 6) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Password must be at least 6 characters"));
        }

        if (userRepo.existsByUsername(req.getUsername())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Username already taken"));
        }
        if (userRepo.existsByEmail(req.getEmail().trim())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Email already in use"));
        }

        // Create user in rbac_users
        User newUser = User.builder()
                .username(req.getUsername().trim())
                .password(passwordEncoder.encode(req.getPassword()))
                .name(req.getUsername().trim())
                .email(req.getEmail().trim())
                .enabled(true)
                .build();

        // Assign Viewer role
        roleRepo.findByRoleName("Viewer").ifPresent(viewerRole -> {
            newUser.getRoles().add(viewerRole);
        });

        userRepo.save(newUser);
        log.info("Registered new user '{}' with Viewer role", req.getUsername());

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("message", "User registered successfully"));
    }

    /**
     * GET /api/auth/me
     * Returns the currently authenticated user's full profile,
     * including RBAC roles and effective permissions.
     */
    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()
                || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("username", auth.getName());
        response.put("authorities", auth.getAuthorities().stream()
                .map(a -> a.getAuthority()).toList());

        userRepo.findByUsernameWithRolesAndPermissions(auth.getName())
                .ifPresent(rbacUser -> {
                    response.put("userId", rbacUser.getId());
                    response.put("name", rbacUser.getName());
                    response.put("email", rbacUser.getEmail());

                    response.put("roles", rbacUser.getRoles().stream()
                            .sorted(Comparator.comparing(Role::getRoleName))
                            .map(role -> {
                                Map<String, Object> r = new LinkedHashMap<>();
                                r.put("id", role.getId());
                                r.put("roleName", role.getRoleName());
                                r.put("isSystemRole", role.isSystemRole());
                                return r;
                            }).toList());

                    response.put("permissions", rbacUser.getRoles().stream()
                            .flatMap(role -> role.getPermissions().stream())
                            .map(Permission::getPermissionKey)
                            .distinct()
                            .sorted()
                            .toList());
                });

        return ResponseEntity.ok(response);
    }

    // NOTE: POST /api/auth/login → handled by Spring Security formLogin()
    // POST /api/auth/logout → handled by Spring Security logout()
}
