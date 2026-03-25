package com.formbuilder.repository;

import com.formbuilder.entity.FormVersionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface FormVersionRepository extends JpaRepository<FormVersionEntity, UUID> {
    Optional<FormVersionEntity> findByFormIdAndVersionNumber(UUID formId, int versionNumber);
    Optional<FormVersionEntity> findByFormIdAndIsActiveTrue(UUID formId);
    
    @org.springframework.data.jpa.repository.Query(value = "SELECT * FROM form_versions WHERE form_id = ?1 AND is_active = true ORDER BY version_number DESC LIMIT 1", nativeQuery = true)
    Optional<FormVersionEntity> findLatestPublishedByFormId(UUID formId);

    @org.springframework.data.jpa.repository.Query(value = "SELECT * FROM form_versions WHERE form_id = ?1 ORDER BY version_number DESC LIMIT 1", nativeQuery = true)
    Optional<FormVersionEntity> findLatestByFormId(UUID formId);
}
