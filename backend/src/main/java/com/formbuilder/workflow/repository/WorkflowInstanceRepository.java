package com.formbuilder.workflow.repository;

import com.formbuilder.workflow.entity.WorkflowInstance;
import com.formbuilder.workflow.entity.WorkflowInstanceStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkflowInstanceRepository extends JpaRepository<WorkflowInstance, Long> {

    @EntityGraph(attributePaths = { "form", "creator", "targetBuilder", "steps", "steps.approver" })
    Optional<WorkflowInstance> findById(Long id);

    @EntityGraph(attributePaths = { "form", "creator", "targetBuilder", "steps", "steps.approver" })
    Optional<WorkflowInstance> findByForm_IdAndStatus(UUID formId, WorkflowInstanceStatus status);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "LEFT JOIN FETCH wi.steps s " +
            "LEFT JOIN FETCH s.approver " +
            "WHERE wi.creator.username = :username ORDER BY wi.createdAt DESC")
    List<WorkflowInstance> findByCreatorUsernameWithSteps(@Param("username") String username);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "LEFT JOIN FETCH wi.steps s " +
            "LEFT JOIN FETCH s.approver a " +
            "WHERE wi.creator.username = :username OR a.id = :userId OR wi.targetBuilder.id = :userId " +
            "ORDER BY wi.createdAt DESC")
    List<WorkflowInstance> findByCreatorOrApproverWithSteps(@Param("username") String username,
                                                            @Param("userId") Integer userId);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "LEFT JOIN FETCH wi.steps s " +
            "WHERE wi.status = 'ACTIVE' AND s.approver.id = :userId")
    List<WorkflowInstance> findActiveByApproverId(@Param("userId") Integer userId);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "LEFT JOIN FETCH wi.steps s " +
            "LEFT JOIN FETCH s.approver " +
            "WHERE f.id IN :formIds " +
            "ORDER BY wi.createdAt DESC")
    List<WorkflowInstance> findByFormIdsWithSteps(@Param("formIds") List<UUID> formIds);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "LEFT JOIN FETCH wi.steps s " +
            "LEFT JOIN FETCH s.approver a " +
            "WHERE wi.status = 'ACTIVE' " +
            "AND (wi.creator.id = :userId OR wi.targetBuilder.id = :userId OR a.id = :userId)")
    List<WorkflowInstance> findActiveInvolvingUser(@Param("userId") Integer userId);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "JOIN FETCH wi.creator c " +
            "JOIN FETCH wi.targetBuilder tb " +
            "LEFT JOIN FETCH wi.steps s " +
            "LEFT JOIN FETCH s.approver a " +
            "WHERE a.id = :userId OR tb.id = :userId " +
            "ORDER BY wi.createdAt DESC")
    List<WorkflowInstance> findByInvolvedUserWithSteps(@Param("userId") Integer userId);

    @Query("SELECT DISTINCT wi FROM WorkflowInstance wi " +
            "JOIN FETCH wi.form f " +
            "LEFT JOIN FETCH wi.steps s " +
            "LEFT JOIN FETCH s.approver " +
            "ORDER BY wi.createdAt DESC")
    List<WorkflowInstance> findAllWithSteps();

    long countByCreator_IdOrTargetBuilder_Id(Integer creatorId, Integer targetBuilderId);
}
