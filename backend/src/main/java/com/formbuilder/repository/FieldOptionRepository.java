package com.formbuilder.repository;

import com.formbuilder.entity.FieldOptionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Repository for managing field options (normalized storage).
 * Provides methods to query and manipulate dropdown/radio options
 * stored in separate rows rather than JSON.
 */
@Repository
public interface FieldOptionRepository extends JpaRepository<FieldOptionEntity, UUID> {

    /**
     * Find all active options for a specific field, ordered by display order.
     */
    @Query("SELECT o FROM FieldOptionEntity o WHERE o.field.id = :fieldId AND o.isActive = true ORDER BY o.optionOrder ASC")
    List<FieldOptionEntity> findActiveByFieldId(@Param("fieldId") UUID fieldId);

    /**
     * Find all options (including inactive) for a specific field.
     */
    @Query("SELECT o FROM FieldOptionEntity o WHERE o.field.id = :fieldId ORDER BY o.optionOrder ASC")
    List<FieldOptionEntity> findAllByFieldId(@Param("fieldId") UUID fieldId);

    /**
     * Check if a specific option value exists for a field.
     */
    boolean existsByFieldIdAndOptionValue(UUID fieldId, String optionValue);

    /**
     * Get the default option for a field (if any).
     */
    @Query("SELECT o FROM FieldOptionEntity o WHERE o.field.id = :fieldId AND o.isDefault = true AND o.isActive = true")
    FieldOptionEntity findDefaultByFieldId(@Param("fieldId") UUID fieldId);

    /**
     * Delete all options for a specific field.
     */
    void deleteByFieldId(UUID fieldId);

    /**
     * Count active options for a field.
     */
    @Query("SELECT COUNT(o) FROM FieldOptionEntity o WHERE o.field.id = :fieldId AND o.isActive = true")
    long countActiveByFieldId(@Param("fieldId") UUID fieldId);
}

