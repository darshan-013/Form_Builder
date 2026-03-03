package com.formbuilder.controller;

import com.formbuilder.dto.FormDTO;
import com.formbuilder.entity.FormEntity;
import com.formbuilder.service.FormService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

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

    /** List all forms — admin dashboard */
    @GetMapping
    public ResponseEntity<List<FormEntity>> getAll() {
        return ResponseEntity.ok(formService.getAllForms());
    }

    /** Single form with all fields — used by preview and submit pages */
    @GetMapping("/{id}")
    public ResponseEntity<FormEntity> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(formService.getFormById(id));
    }

    /**
     * Create form.
     * Saves metadata to forms + form_fields tables,
     * then calls DynamicTableService.createTable() to CREATE the physical table.
     */
    @PostMapping
    public ResponseEntity<FormEntity> create(@RequestBody FormDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(formService.createForm(dto));
    }

    /**
     * Update form.
     * Diffs old vs new fields, calls DynamicTableService to
     * ADD COLUMN / DROP COLUMN / ALTER COLUMN TYPE as needed.
     */
    @PutMapping("/{id}")
    public ResponseEntity<FormEntity> update(@PathVariable UUID id, @RequestBody FormDTO dto) {
        return ResponseEntity.ok(formService.updateForm(id, dto));
    }

    /**
     * Delete form.
     * Calls DynamicTableService.dropTable() then removes metadata rows.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        formService.deleteForm(id);
        return ResponseEntity.noContent().build();
    }
}
