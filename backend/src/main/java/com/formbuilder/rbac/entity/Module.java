package com.formbuilder.rbac.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "modules")
@org.hibernate.annotations.SQLRestriction("is_deleted = false")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Module {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "module_name", nullable = false)
    private String moduleName;

    @Column(name = "module_description", columnDefinition = "TEXT")
    private String moduleDescription;

    @Column(name = "prefix")
    private String prefix;

    @Column(name = "icon_css")
    private String iconCss;

    @Column(name = "is_parent")
    @Builder.Default
    private Boolean isParent = false;

    @Column(name = "is_sub_parent")
    @Builder.Default
    private Boolean isSubParent = false;

    @Column(name = "active")
    @Builder.Default
    private Boolean active = true;

    @Column(name = "is_deleted")
    @Builder.Default
    private Boolean isDeleted = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"parent", "subParent", "subModules", "hibernateLazyInitializer", "handler"})
    private Module parent;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sub_parent_id")
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"parent", "subParent", "subModules", "hibernateLazyInitializer", "handler"})
    private Module subParent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Module> subModules;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (active == null) active = true;
    }
}
