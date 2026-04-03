package com.formbuilder.repository;

import com.formbuilder.entity.CustomValidationRuleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CustomValidationRuleRepository extends JpaRepository<CustomValidationRuleEntity, UUID> {
    List<CustomValidationRuleEntity> findByFormVersionIdOrderByExecutionOrderAsc(UUID formVersionId);
}
