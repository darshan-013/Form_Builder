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
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.softDeleted = false ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByOrderByCreatedAtDesc();

    /**
     * Returns active (non-deleted) forms owned by a specific user, newest-first.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.createdBy = :owner AND f.softDeleted = false ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByCreatedByOrderByCreatedAtDesc(@Param("owner") String owner);


    /**
     * Returns all non-deleted forms that have at least one PUBLISHED version.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f JOIN f.versions v " +
           "WHERE f.softDeleted = false AND v.isActive = true " +
           "ORDER BY f.createdAt DESC")
    List<FormEntity> findPublishedAccessibleForms();


    /** Find active form by ID with its versions. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.id = :id AND f.softDeleted = false")
    Optional<FormEntity> findByIdWithVersions(@Param("id") UUID id);

    /** Find active form by ID scoped to owner. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.id = :id AND f.createdBy = :owner AND f.softDeleted = false")
    Optional<FormEntity> findByIdAndCreatedBy(@Param("id") UUID id, @Param("owner") String owner);
 
    /** Check if form code already exists. */
    boolean existsByFormCode(String formCode);
}
