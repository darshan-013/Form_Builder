package com.formbuilder.repository;

import com.formbuilder.entity.FormFieldEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FormFieldJpaRepository extends JpaRepository<FormFieldEntity, UUID> {
    List<FormFieldEntity> findByForm_IdOrderByFieldOrderAsc(UUID formId);
}
