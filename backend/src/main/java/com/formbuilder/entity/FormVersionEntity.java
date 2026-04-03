package com.formbuilder.entity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "form_versions")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class FormVersionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonBackReference
    private FormEntity form;

    @Column(name = "version_number", nullable = false)
    private int versionNumber;

    @Column(name = "is_active", nullable = false)
    private boolean isActive;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private FormVersionStatus status = FormVersionStatus.DRAFT;

    @Column(name = "definition_json", columnDefinition = "TEXT")
    private String definitionJson;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "is_soft_deleted", nullable = false)
    @Builder.Default
    private boolean isSoftDeleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    // Sub-components are now children of the version, not the form.
    @OneToMany(mappedBy = "formVersion", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    @com.fasterxml.jackson.annotation.JsonManagedReference
    private List<FormFieldEntity> fields = new ArrayList<>();

    @OneToMany(mappedBy = "formVersion", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    @com.fasterxml.jackson.annotation.JsonManagedReference
    private List<FormGroupEntity> groups = new ArrayList<>();

    @OneToMany(mappedBy = "formVersion", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    @com.fasterxml.jackson.annotation.JsonManagedReference
    private List<StaticFormFieldEntity> staticFields = new ArrayList<>();

    @OneToMany(mappedBy = "formVersion", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    @com.fasterxml.jackson.annotation.JsonManagedReference
    private List<CustomValidationRuleEntity> customValidationRules = new ArrayList<>();

    public enum FormVersionStatus {
        DRAFT, PUBLISHED
    }
}
