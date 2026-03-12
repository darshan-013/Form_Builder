package com.formbuilder.repository;

import com.formbuilder.entity.FormEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FormJpaRepository extends JpaRepository<FormEntity, UUID> {

    /**
     * Returns all non-deleted forms newest-first (unscoped — for Admin).
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.softDeleted = false ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByOrderByCreatedAtDesc();

    /**
     * Returns active (non-deleted) forms owned by a specific user, newest-first.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.createdBy = :owner AND f.softDeleted = false ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByCreatedByOrderByCreatedAtDesc(@Param("owner") String owner);

    /**
     * Returns all non-deleted PUBLISHED forms (for Role Administrator view).
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields " +
           "WHERE f.softDeleted = false AND f.status = 'PUBLISHED' " +
           "ORDER BY f.createdAt DESC")
    List<FormEntity> findPublishedPublicForms();

    /**
     * Returns all non-deleted PUBLISHED forms.
     * Fine-grained role filtering is done in FormService via allowed_roles column.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields " +
           "WHERE f.softDeleted = false AND f.status = 'PUBLISHED' " +
           "ORDER BY f.createdAt DESC")
    List<FormEntity> findPublishedAccessibleForms();

    /**
     * Returns own forms (any status) + PUBLISHED PUBLIC/RESTRICTED forms by others.
     * For Builder role.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields " +
           "WHERE f.softDeleted = false AND (" +
           "  f.createdBy = :owner " +
           "  OR (f.status = 'PUBLISHED' AND f.visibility IN ('PUBLIC', 'RESTRICTED'))" +
           ") ORDER BY f.createdAt DESC")
    List<FormEntity> findFormsForBuilder(@Param("owner") String owner);

    /** Find active form by ID with fields eagerly loaded. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.id = :id AND f.softDeleted = false")
    Optional<FormEntity> findByIdWithFields(@Param("id") UUID id);

    /** Find active form by ID scoped to owner. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.id = :id AND f.createdBy = :owner AND f.softDeleted = false")
    Optional<FormEntity> findByIdAndCreatedBy(@Param("id") UUID id, @Param("owner") String owner);

    /**
     * Find ANY form by ID (including soft-deleted) — used for
     * restore/permanent-delete.
     */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.id = :id AND f.createdBy = :owner")
    Optional<FormEntity> findByIdAndCreatedByIncludingTrashed(@Param("id") UUID id, @Param("owner") String owner);

    /** Returns soft-deleted forms for a specific user (the trash bin). */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.createdBy = :owner AND f.softDeleted = true ORDER BY f.deletedAt DESC")
    List<FormEntity> findTrashedByOwner(@Param("owner") String owner);

    /** Returns ALL soft-deleted forms (Admin trash view). */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.softDeleted = true ORDER BY f.deletedAt DESC")
    List<FormEntity> findAllTrashed();
}
