package com.formbuilder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "field_validation")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class CustomValidationRuleEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_version_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonBackReference
    private FormVersionEntity formVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 20)
    private ValidationRuleScope scope;

    @Column(name = "field_key", length = 100)
    private String fieldKey;

    @Column(name = "validation_type", nullable = false, length = 50)
    @Builder.Default
    private String validationType = "CUSTOM";

    @Column(name = "expression", nullable = false, columnDefinition = "TEXT")
    private String expression;

    @Column(name = "error_message", nullable = false, length = 255)
    private String errorMessage;

    @Column(name = "execution_order", nullable = false)
    @Builder.Default
    private int executionOrder = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;


    public enum ValidationRuleScope {
        FIELD, FORM
    }
}
