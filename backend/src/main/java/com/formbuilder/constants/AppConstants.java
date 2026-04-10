package com.formbuilder.constants;

public class AppConstants {
    // Cross Origin
    public static final String FRONTEND_URL = "http://localhost:3000";

    // Base path
    public static final String API_BASE = "/api/v1";
    public static final int DEFAULT_PAGE = 0;
    public static final int DEFAULT_PAGE_SIZE = 10;
    public static final int MAX_PAGE_SIZE = 100;

    // Base API Endpoints (v1)
    public static final String API_AUTH = API_BASE + "/auth";
    public static final String API_FORMS = API_BASE + "/forms";
    public static final String API_RUNTIME = API_BASE + "/runtime";
    public static final String API_PROFILE = API_BASE + "/profile";
    public static final String API_LOGS = API_BASE + "/logs";
    public static final String API_USERS = API_BASE + "/users";
    public static final String API_ROLES = API_BASE + "/roles";
    public static final String API_SHARED_OPTIONS = API_BASE + "/shared-options";
    public static final String API_WORKFLOWS = API_BASE + "/workflows";
    public static final String API_ADMIN_WORKFLOWS = API_BASE + "/admin/workflows";
    public static final String API_ADMIN = API_BASE + "/admin";
    public static final String API_MENUS = API_BASE + "/menus";
    public static final String API_MODULES = API_BASE + "/modules";
    public static final String API_FILES = API_BASE + "/files";
    public static final String API_UPLOAD = API_FILES + "/upload";

    // Auth Sub-Endpoints
    public static final String AUTH_LOGIN = "/login";
    public static final String AUTH_LOGOUT = "/logout";
    public static final String AUTH_ME = "/me";
    
    // Generic Sub-Endpoints (ID-based)
    public static final String BY_ID = "/{id}";
    public static final String BY_ID_SUBMISSIONS = "/{id}/submissions";
    public static final String BY_ID_PERMISSIONS = "/{id}/permissions";
    public static final String BY_ID_ROLES = "/{id}/roles";
    public static final String BY_ID_ROLE_BY_ID = "/{id}/roles/{roleId}";
    
    // Form Sub-Endpoints
    public static final String FORM_BY_ID = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}";
    public static final String FORM_RENDER = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/render";
    public static final String FORM_RENDER_ADMIN = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/render/admin";
    public static final String FORM_PUBLISH = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/publish";
    public static final String FORM_UNPUBLISH = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/unpublish";
    public static final String FORM_ASSIGN_BUILDER = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/assign-builder";
    public static final String FORM_VERSIONS = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/versions";
    public static final String FORM_VERSION_BY_ID = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/versions/{versionId:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}";
    public static final String FORM_VERSION_PUBLISH = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/versions/{versionId:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/publish";
    public static final String FORM_VERSION_ACTIVATE = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/versions/{versionId:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/activate";
    public static final String FORM_STATS = "/stats";
    public static final String FORM_CHECK_CODE = "/check-code";
    public static final String FORM_TRASH = "/trash";
    public static final String FORM_RESTORE = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/restore";
    public static final String FORM_PERMANENT_DELETE = "/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/permanent";
    
    // Field Sub-Endpoints (Granular)
    public static final String FORM_FIELDS = "/{formId}/versions/{versionId}/fields";
    public static final String FORM_FIELD_BY_KEY = "/{formId}/versions/{versionId}/fields/{fieldKey}";
    
    // Validation Sub-Endpoints (Granular)
    public static final String FORM_VALIDATIONS = "/{formId}/versions/{versionId}/validations";
    public static final String FORM_VALIDATION_BY_ID = "/{formId}/versions/{versionId}/validations/{validationId}";

    // Custom Validation Sub-Endpoints
    public static final String FORM_CUSTOM_VALIDATIONS = "/{formId}/versions/{versionId}/custom-validations";
    public static final String FORM_CUSTOM_VALIDATIONS_BY_ID = "/{formId}/versions/{versionId}/custom-validations/{ruleId}";

    // Runtime Sub-Endpoints
    public static final String RUNTIME_FORM_RENDER = "/forms/{idOrCode}";
    public static final String RUNTIME_SUBMIT = "/forms/{idOrCode}/submit";
    public static final String RUNTIME_DRAFT = "/forms/{idOrCode}/draft";
    public static final String RUNTIME_SUBMIT_V2 = "/forms/{idOrCode}/submissions/submit";
    public static final String RUNTIME_DRAFT_V2 = "/forms/{idOrCode}/submissions/draft";
    public static final String RUNTIME_SUBMISSIONS_TRASH = "/{id}/submissions/trash";
    public static final String RUNTIME_SUBMISSION_RESTORE = "/{id}/submissions/{submissionId}/restore";
    
    // User/Profile Sub-Endpoints
    public static final String PROFILE_PASSWORD = "/password";
    public static final String PROFILE_PHOTO = "/photo";

    // RBAC Sub-Endpoints
    public static final String RBAC_PERMISSIONS = "/{id}/permissions";
    public static final String RBAC_ROLES = "/{id}/roles";
    public static final String RBAC_ROLE_BY_ID = "/{userId}/roles/{roleId}";

    // Submission Sub-Endpoints
    public static final String BY_ID_SUBMISSION_BY_ID = "/{id}/submissions/{submissionId}";
    public static final String BY_ID_SUBMISSIONS_BULK = "/{id}/submissions/bulk";
    public static final String BY_ID_SUBMISSIONS_EXPORT = "/{id}/submissions/export";

    // Module Sub-Endpoints
    public static final String MODULE_BY_ROLE = "/role/{roleId}";

    // Admin/Monitoring Sub-Endpoints
    public static final String ADMIN_WORKFLOW_STATUS = "/status";
    public static final String LOGS_ADMIN = "/admin";
    public static final String LOGS_ROLE_ASSIGNMENTS = "/role-assignments";
}
