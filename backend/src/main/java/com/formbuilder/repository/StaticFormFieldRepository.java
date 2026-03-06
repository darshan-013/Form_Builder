package com.formbuilder.repository;

import com.formbuilder.entity.StaticFormFieldEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface StaticFormFieldRepository extends JpaRepository<StaticFormFieldEntity, UUID> {

    List<StaticFormFieldEntity> findByFormIdOrderByFieldOrderAsc(UUID formId);

    @Modifying
    @Query("DELETE FROM StaticFormFieldEntity s WHERE s.formId = :formId")
    void deleteByFormId(UUID formId);
}
