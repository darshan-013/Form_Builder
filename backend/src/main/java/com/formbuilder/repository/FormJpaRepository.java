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
    /** Returns all forms newest-first for the admin dashboard with fields eagerly loaded. */
    @Query("SELECT DISTINCT f FROM FormEntity f LEFT JOIN FETCH f.fields ORDER BY f.createdAt DESC")
    List<FormEntity> findAllByOrderByCreatedAtDesc();

    /** Find form by ID with fields eagerly loaded. */
    @Query("SELECT f FROM FormEntity f LEFT JOIN FETCH f.fields WHERE f.id = :id")
    Optional<FormEntity> findByIdWithFields(@Param("id") UUID id);
}
