package com.formbuilder.workflow;

import com.formbuilder.rbac.entity.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "workflow_steps",
        uniqueConstraints = @UniqueConstraint(name = "uq_workflow_step_order", columnNames = { "instance_id", "step_index" }))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instance_id", nullable = false)
    private WorkflowInstance instance;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approver_id", nullable = false)
    private User approver;

    @Column(name = "step_index", nullable = false)
    private Integer stepIndex;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private WorkflowStepStatus status = WorkflowStepStatus.PENDING;

    @Column(name = "comments", columnDefinition = "TEXT")
    private String comments;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;
}

