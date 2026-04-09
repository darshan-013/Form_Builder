package com.formbuilder.entity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(
        name = "form_versions",
        uniqueConstraints = @UniqueConstraint(name = "uk_form_versions_form_id_version_number", columnNames = {"form_id", "version_number"})
)
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

    @Column(name = "definition_json", nullable = false, columnDefinition = "JSONB")
    @Builder.Default
    private String definitionJson = "{}";

    @Column(name = "created_by", nullable = false, length = 100)
    private String createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

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
}
