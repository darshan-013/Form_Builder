package com.formbuilder.repository;

import com.formbuilder.entity.FormGroupEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FormGroupRepository extends JpaRepository<FormGroupEntity, UUID> {

    List<FormGroupEntity> findByFormVersionIdOrderByGroupOrderAsc(UUID versionId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM FormGroupEntity g WHERE g.formVersion.id = :versionId")
    void deleteByFormVersionId(UUID versionId);
}
