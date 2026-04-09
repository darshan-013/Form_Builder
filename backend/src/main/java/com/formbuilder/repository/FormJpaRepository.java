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
     * Returns all forms newest-first (unscoped — for Admin).
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.versions v ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByOrderByCreatedAtDesc();

    /**
     * Returns archived forms newest-first.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.status = com.formbuilder.entity.FormEntity.FormStatus.ARCHIVED ORDER BY f.updatedAt DESC")
    List<FormEntity> findAllArchivedOrderByUpdatedAtDesc();

    /**
     * Returns forms owned by a specific user, newest-first.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.createdBy = :owner ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByCreatedByOrderByCreatedAtDesc(@Param("owner") String owner);


    /**
     * Returns all non-archived forms that have at least one PUBLISHED version.
     */
    @Query("SELECT DISTINCT f FROM FormEntity f JOIN f.versions v " +
           "WHERE f.status <> com.formbuilder.entity.FormEntity.FormStatus.ARCHIVED AND v.isActive = true " +
           "ORDER BY f.createdAt DESC")
    List<FormEntity> findPublishedAccessibleForms();


    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.id = :id")
    Optional<FormEntity> findByIdWithVersions(@Param("id") UUID id);

    /** Find archived form by ID. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.id = :id AND f.status = com.formbuilder.entity.FormEntity.FormStatus.ARCHIVED")
    Optional<FormEntity> findByIdAndArchived(@Param("id") UUID id);

    /** Find form by ID scoped to owner. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.versions v WHERE f.id = :id AND f.createdBy = :owner")
    Optional<FormEntity> findByIdAndCreatedBy(@Param("id") UUID id, @Param("owner") String owner);
 
    /** Find non-archived form by its unique form code. */
    Optional<FormEntity> findByCodeAndStatusNot(String code, FormEntity.FormStatus status);

    /** Check if form code already exists. */
    boolean existsByCode(String code);

    /** Find all forms by their lifecycle status. */
    List<FormEntity> findAllByStatus(FormEntity.FormStatus status);
}
