package com.formbuilder.controller;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.FormGroupEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.rbac.service.UserRoleService;
import com.formbuilder.service.FormRenderService;
import com.formbuilder.service.FormService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * REST Controller for Form CRUD operations.
 * Now uses role-based form visibility via UserRoleService.
 */
@RestController
@RequestMapping("/api/forms")
@RequiredArgsConstructor
public class FormController {

    private final FormService formService;
    private final FormRenderService formRenderService;
    private final UserRoleService userRoleService;

    /** List only the forms that belong to the authenticated user. */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAll(Authentication auth) {
        String username = auth.getName();
        Set<String> roleNames = userRoleService.getUserRoleNames(username);

        List<FormEntity> forms = formService.getFormsForRole(username, roleNames);

        // Annotate each form with ownership flag and effective permissions
        List<Map<String, Object>> response = forms.stream().map(form -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", form.getId());
            map.put("name", form.getName());
            map.put("description", form.getDescription());
            map.put("tableName", form.getTableName());
            map.put("status", form.getStatus());
            map.put("visibility", form.getVisibility());
            map.put("allowedRoles", form.getAllowedRoles());
            map.put("createdBy", form.getCreatedBy());
            map.put("createdAt", form.getCreatedAt());
            map.put("updatedAt", form.getUpdatedAt());
            map.put("allowMultipleSubmissions", form.isAllowMultipleSubmissions());
            map.put("showTimestamp", form.isShowTimestamp());
            map.put("expiresAt", form.getExpiresAt());
            map.put("fields", form.getFields());

            // Ownership flag — frontend uses this to show/hide edit/delete buttons
            boolean isOwner = username.equals(form.getCreatedBy());
            map.put("isOwner", isOwner);

            // Effective actions: what can this user do with this form?
            boolean isAdmin = roleNames.contains("Admin");
            boolean isBuilder = roleNames.contains("Builder");
            map.put("canEdit", isOwner || isAdmin);
            map.put("canDelete", isOwner || isAdmin);
            map.put("canPublish", isOwner || isAdmin);
            map.put("canViewSubmissions", isOwner || isAdmin || isBuilder || roleNames.contains("Manager"));

            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }

    /** Single form with static fields bundled — used by builder edit page. */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable UUID id) {
        FormEntity form = formService.getFormById(id);
        List<StaticFormFieldEntity> statics = formService.getStaticFields(id);

        // Convert statics to simple maps for JSON response
        List<Map<String, Object>> staticList = new ArrayList<>();
        for (StaticFormFieldEntity sf : statics) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", sf.getId());
            m.put("fieldType", sf.getFieldType());
            m.put("data", sf.getData());
            m.put("fieldOrder", sf.getFieldOrder());
            m.put("isStatic", true);
            staticList.add(m);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", form.getId());
        response.put("name", form.getName());
        response.put("description", form.getDescription());
        response.put("tableName", form.getTableName());
        response.put("status", form.getStatus());
        response.put("visibility", form.getVisibility());
        response.put("allowedRoles", form.getAllowedRoles());
        response.put("createdBy", form.getCreatedBy());
        response.put("createdAt", form.getCreatedAt());
        response.put("updatedAt", form.getUpdatedAt());
        response.put("allowMultipleSubmissions", form.isAllowMultipleSubmissions());
        response.put("showTimestamp", form.isShowTimestamp());
        response.put("expiresAt", form.getExpiresAt());
        response.put("fields", form.getFields());
        response.put("staticFields", staticList);

        // Groups
        List<FormGroupEntity> groups = formService.getGroups(id);
        List<Map<String, Object>> groupList = new ArrayList<>();
        for (FormGroupEntity g : groups) {
            Map<String, Object> gm = new LinkedHashMap<>();
            gm.put("id", g.getId());
            gm.put("groupTitle", g.getGroupTitle());
            gm.put("groupDescription", g.getGroupDescription());
            gm.put("groupOrder", g.getGroupOrder());
            gm.put("rulesJson", g.getRulesJson());
            groupList.add(gm);
        }
        response.put("groups", groupList);

        return ResponseEntity.ok(response);
    }

    /**
     * Public render — returns 403 if DRAFT.
     * No ownership check: anyone with the link can submit to a published form.
     */
    @GetMapping("/{id}/render")
    public ResponseEntity<?> render(@PathVariable UUID id, jakarta.servlet.http.HttpSession session) {
        FormEntity form = formService.getFormById(id);
        if (form.getStatus() == FormEntity.FormStatus.DRAFT) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "This form is not published yet.", "status", "DRAFT"));
        }

        if (!form.isAllowMultipleSubmissions()) {
            String sessionKey = "submitted_" + id;
            if (session.getAttribute(sessionKey) != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "You have already submitted this form.", "status", "CONFLICT"));
            }
        }

        return ResponseEntity.ok(formRenderService.render(id));
    }

    /**
     * Admin render — always returns form (for builder preview).
     * Admin can preview any form; others can only preview their own.
     */
    @GetMapping("/{id}/render/admin")
    public ResponseEntity<?> renderAdmin(@PathVariable UUID id, Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        formService.getFormForAction(id, auth.getName(), isAdmin);
        return ResponseEntity.ok(formRenderService.render(id));
    }

    /** Create a form — owner is set to the authenticated user. */
    @PostMapping
    public ResponseEntity<FormEntity> create(@RequestBody FormDTO dto, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(formService.createForm(dto, auth.getName()));
    }

    /** Update — owner or Admin can edit a form. */
    @PutMapping("/{id}")
    public ResponseEntity<FormEntity> update(
            @PathVariable UUID id,
            @RequestBody FormDTO dto,
            Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        return ResponseEntity.ok(formService.updateForm(id, dto, auth.getName(), isAdmin));
    }

    /** Soft-delete — moves form to trash. Owner or Admin. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        formService.deleteForm(id, auth.getName(), isAdmin);
        return ResponseEntity.noContent().build();
    }

    /** List trash — Admin sees all, others see their own. */
    @GetMapping("/trash")
    public ResponseEntity<List<FormEntity>> getTrash(Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        return ResponseEntity.ok(formService.getTrashForms(auth.getName(), isAdmin));
    }

    /** Restore — move a trashed form back to active. Owner or Admin. */
    @PostMapping("/{id}/restore")
    public ResponseEntity<Map<String, Object>> restore(@PathVariable UUID id, Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        FormEntity form = formService.restoreForm(id, auth.getName(), isAdmin);
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "message", "Form restored successfully",
                "name", form.getName()));
    }

    /** Permanently delete — only works if form is already in trash. Owner or Admin. */
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<Void> permanentDelete(@PathVariable UUID id, Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        formService.permanentDeleteForm(id, auth.getName(), isAdmin);
        return ResponseEntity.noContent().build();
    }

    /** Publish — owner or Admin can publish a form. */
    @PatchMapping("/{id}/publish")
    public ResponseEntity<Map<String, Object>> publish(@PathVariable UUID id, Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        formService.publishForm(id, auth.getName(), isAdmin);
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "PUBLISHED",
                "message", "Form published successfully"));
    }

    /** Unpublish — owner or Admin can unpublish a form. */
    @PatchMapping("/{id}/unpublish")
    public ResponseEntity<Map<String, Object>> unpublish(@PathVariable UUID id, Authentication auth) {
        boolean isAdmin = userRoleService.getUserRoleNames(auth.getName()).contains("Admin");
        formService.unpublishForm(id, auth.getName(), isAdmin);
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "DRAFT",
                "message", "Form unpublished successfully"));
    }
}
