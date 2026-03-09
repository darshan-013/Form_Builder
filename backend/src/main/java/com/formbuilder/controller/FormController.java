package com.formbuilder.controller;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.entity.StaticFormFieldEntity;
import com.formbuilder.service.FormRenderService;
import com.formbuilder.service.FormService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST Controller for Form CRUD operations.
 *
 * POST /api/forms → create form + DynamicTableService.createTable()
 * GET /api/forms → list all forms (admin dashboard)
 * GET /api/forms/{id} → single form with fields (public — for preview / submit
 * page)
 * PUT /api/forms/{id} → update metadata + DynamicTableService.updateTable()
 * (add/drop/alter)
 * DELETE /api/forms/{id} → delete metadata + DynamicTableService.dropTable()
 */
@RestController
@RequestMapping("/api/forms")
@RequiredArgsConstructor
public class FormController {

    private final FormService formService;
    private final FormRenderService formRenderService;

    /** List only the forms that belong to the authenticated user. */
    @GetMapping
    public ResponseEntity<List<FormEntity>> getAll(Authentication auth) {
        return ResponseEntity.ok(formService.getAllForms(auth.getName()));
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
        response.put("createdBy", form.getCreatedBy());
        response.put("createdAt", form.getCreatedAt());
        response.put("updatedAt", form.getUpdatedAt());
        response.put("allowMultipleSubmissions", form.isAllowMultipleSubmissions());
        response.put("showTimestamp", form.isShowTimestamp());
        response.put("expiresAt", form.getExpiresAt());
        response.put("fields", form.getFields());
        response.put("staticFields", staticList);

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
     * Enforces ownership so users cannot preview other users' forms.
     */
    @GetMapping("/{id}/render/admin")
    public ResponseEntity<?> renderAdmin(@PathVariable UUID id, Authentication auth) {
        // Owner check via getOwnedFormById (throws 404 if not owner)
        formService.getOwnedFormById(id, auth.getName());
        return ResponseEntity.ok(formRenderService.render(id));
    }

    /** Create a form — owner is set to the authenticated user. */
    @PostMapping
    public ResponseEntity<FormEntity> create(@RequestBody FormDTO dto, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(formService.createForm(dto, auth.getName()));
    }

    /** Update — only the owner can edit their form. */
    @PutMapping("/{id}")
    public ResponseEntity<FormEntity> update(
            @PathVariable UUID id,
            @RequestBody FormDTO dto,
            Authentication auth) {
        return ResponseEntity.ok(formService.updateForm(id, dto, auth.getName()));
    }

    /** Delete — only the owner can delete their form. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
        formService.deleteForm(id, auth.getName());
        return ResponseEntity.noContent().build();
    }

    /** Publish — only the owner can publish their form. */
    @PatchMapping("/{id}/publish")
    public ResponseEntity<Map<String, Object>> publish(@PathVariable UUID id, Authentication auth) {
        formService.publishForm(id, auth.getName());
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "PUBLISHED",
                "message", "Form published successfully"));
    }

    /** Unpublish — only the owner can unpublish their form. */
    @PatchMapping("/{id}/unpublish")
    public ResponseEntity<Map<String, Object>> unpublish(@PathVariable UUID id, Authentication auth) {
        formService.unpublishForm(id, auth.getName());
        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "DRAFT",
                "message", "Form unpublished successfully"));
    }
}
