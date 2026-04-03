package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
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
import jakarta.validation.Valid;

import java.util.*;

@Slf4j
@RestController
@RequestMapping(AppConstants.API_AUTH)
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
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {

        String username = req.getUsername().trim();
        String email = req.getEmail().trim();

        if (userRepo.existsByUsername(username)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Username already taken"));
        }
        if (userRepo.existsByEmail(email)) {
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
     * GET /api/v1/auth/me
     * Returns the currently authenticated user's profile.
     */
    @GetMapping({"/me", AppConstants.AUTH_ME})
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
                    response.put("profilePic", rbacUser.getProfilePic());

                    // Map roles to objects [{roleName: "..."}] to match AuthContext hasRole
                    response.put("roles", rbacUser.getRoles().stream()
                            .map(r -> Map.of("roleName", r.getRoleName()))
                            .toList());

                    // Collect and return all distinct permission keys
                    response.put("permissions", rbacUser.getAllPermissionKeys());
                });

        return ResponseEntity.ok(response);
    }

    // NOTE: POST /api/auth/login → handled by Spring Security formLogin()
    // POST /api/auth/logout → handled by Spring Security logout()
}
