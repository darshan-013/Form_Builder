package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import com.formbuilder.dto.PasswordChangeRequest;
import com.formbuilder.dto.ProfileUpdateRequest;
import com.formbuilder.rbac.entity.User;
import com.formbuilder.rbac.repository.UserRepository;
import com.formbuilder.rbac.service.UserRoleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping(AppConstants.API_PROFILE)
@RequiredArgsConstructor
public class ProfileController {

    private final UserRoleService userService;
    private final UserRepository userRepo;
    private static final String UPLOAD_DIR = "uploads";

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> getProfile(Authentication auth) {
        User user = userRepo.findByUsernameWithRolesAndPermissions(auth.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));

        Map<String, Object> response = new HashMap<>();
        response.put("user", user);
        response.put("roles", user.getRoles().stream()
                .map(r -> Map.of("roleName", r.getRoleName()))
                .collect(java.util.stream.Collectors.toList()));
        response.put("permissions", user.getAllPermissionKeys());

        return ResponseEntity.ok(response);
    }

    @PutMapping
    @Transactional
    public ResponseEntity<User> updateProfile(@Valid @RequestBody ProfileUpdateRequest request, Authentication auth) {
        User user = userRepo.findByUsername(auth.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        User updated = userService.updateProfile(user.getId(), request.getName(), request.getEmail(), request.getUsername());
        return ResponseEntity.ok(updated);
    }

    @PutMapping(AppConstants.PROFILE_PASSWORD)
    public ResponseEntity<?> changePassword(@Valid @RequestBody PasswordChangeRequest request, Authentication auth) {
        User user = userRepo.findByUsername(auth.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        try {
            userService.updatePassword(user.getId(), request.getCurrentPassword(), request.getNewPassword());
            return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/photo")
    public ResponseEntity<Map<String, String>> uploadPhoto(@RequestParam("file") MultipartFile file, Authentication auth) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file provided"));
        }

        User user = userRepo.findByUsername(auth.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));

        try {
            Path uploadPath = Paths.get(UPLOAD_DIR);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            String originalFilename = file.getOriginalFilename();
            String extension = "";
            if (originalFilename != null && originalFilename.contains(".")) {
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            String uniqueFilename = "profile_" + user.getId() + "_" + UUID.randomUUID() + extension;

            Path filePath = uploadPath.resolve(uniqueFilename);
            Files.copy(file.getInputStream(), filePath);

            userService.updateProfilePic(user.getId(), uniqueFilename);

            log.info("Profile photo uploaded for user {}: {}", user.getUsername(), uniqueFilename);

            return ResponseEntity.ok(Map.of("filePath", uniqueFilename));

        } catch (IOException e) {
            log.error("Failed to upload profile photo", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to upload photo: " + e.getMessage()));
        }
    }
}
