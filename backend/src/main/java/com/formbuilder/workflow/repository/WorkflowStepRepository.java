package com.formbuilder.workflow;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface WorkflowStepRepository extends JpaRepository<WorkflowStep, Long> {

    @Query("SELECT ws FROM WorkflowStep ws " +
            "JOIN FETCH ws.instance wi " +
            "JOIN FETCH wi.form f " +
            "JOIN FETCH ws.approver a " +
            "JOIN FETCH wi.targetBuilder tb " +
            "WHERE ws.id = :id")
    Optional<WorkflowStep> findByIdWithInstanceAndApprover(@Param("id") Long id);

    @Query("SELECT ws FROM WorkflowStep ws " +
            "JOIN FETCH ws.instance wi " +
            "JOIN FETCH wi.form f " +
            "JOIN FETCH wi.targetBuilder tb " +
            "JOIN FETCH ws.approver a " +
            "JOIN FETCH wi.creator c " +
            "WHERE ws.approver.id = :approverId " +
            "AND ws.status = 'PENDING' " +
            "AND wi.status = 'ACTIVE' " +
            "ORDER BY wi.updatedAt DESC")
    List<WorkflowStep> findMyPendingSteps(@Param("approverId") Integer approverId);

    long countByApprover_Id(Integer approverId);

    long deleteByApprover_Id(Integer approverId);
}


