package com.formbuilder.repository;

import com.formbuilder.entity.FormFieldEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FormFieldJpaRepository extends JpaRepository<FormFieldEntity, UUID> {

    List<FormFieldEntity> findByFormVersionIdOrderByFieldOrderAsc(UUID versionId);

    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("DELETE FROM FormFieldEntity f WHERE f.formVersion.id = :versionId")
    void deleteByFormVersionId(UUID versionId);

    /** All fields that share the same shared_options row. */
    List<FormFieldEntity> findBySharedOptionsId(UUID sharedOptionsId);
}
