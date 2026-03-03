package com.formbuilder.controller;

import com.formbuilder.entity.SharedOptionsEntity;
import com.formbuilder.service.FormService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * REST controller for shared_options rows.
 *
 * POST /api/shared-options           → create new shared_options row, return {id, optionsJson}
 * GET  /api/shared-options/{id}      → get a shared_options row by id
 * PUT  /api/shared-options/{id}      → update options_json of a shared row (all linked fields see this instantly)
 */
@RestController
@RequestMapping("/api/shared-options")
@RequiredArgsConstructor
public class SharedOptionsController {

    private final FormService formService;

    /**
     * Create a new shared_options row.
     * Called by the frontend picker when admin links an existing field's options to a new field.
     * Body: { "optionsJson": "[{\"label\":\"A\",\"value\":\"A\"},...]" }
     */
    @PostMapping
    public ResponseEntity<SharedOptionsEntity> create(@RequestBody Map<String, String> body) {
        String optionsJson = body.get("optionsJson");
        if (optionsJson == null || optionsJson.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        SharedOptionsEntity created = formService.createSharedOptions(optionsJson);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Get a shared_options row by id.
     */
    @GetMapping("/{id}")
    public ResponseEntity<SharedOptionsEntity> getById(@PathVariable UUID id) {
        return formService.getSharedOptions(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Update the options_json of a shared_options row.
     * All form_fields rows with shared_options_id = this id will immediately reflect
     * the new options at next render/validation (live from DB).
     * Body: { "optionsJson": "[{\"label\":\"A\",\"value\":\"A\"},...]" }
     */
    @PutMapping("/{id}")
    public ResponseEntity<SharedOptionsEntity> update(@PathVariable UUID id,
                                                       @RequestBody Map<String, String> body) {
        String optionsJson = body.get("optionsJson");
        if (optionsJson == null || optionsJson.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return formService.updateSharedOptions(id, optionsJson)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
