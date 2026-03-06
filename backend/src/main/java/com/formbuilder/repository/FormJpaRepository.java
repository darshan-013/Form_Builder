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

    /** Returns all forms newest-first (unscoped — kept for internal use). */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByOrderByCreatedAtDesc();

    /** Returns forms owned by a specific user, newest-first. */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.createdBy = :owner ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByCreatedByOrderByCreatedAtDesc(@Param("owner") String owner);

    /** Find form by ID with fields eagerly loaded. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.id = :id")
    Optional<FormEntity> findByIdWithFields(@Param("id") UUID id);

    /** Find form by ID scoped to owner — returns empty if form belongs to another user. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.id = :id AND f.createdBy = :owner")
    Optional<FormEntity> findByIdAndCreatedBy(@Param("id") UUID id, @Param("owner") String owner);
}
