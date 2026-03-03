package com.formbuilder.repository;

import com.formbuilder.entity.SharedOptionsEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface SharedOptionsRepository extends JpaRepository<SharedOptionsEntity, UUID> {
}
