/**
 * API service layer.
 * All requests go through Next.js rewrite proxy -> Spring Boot :8080
 * Session cookie (JSESSIONID) is carried automatically via credentials:'include'.
 */

const BASE = '/api/v1';
const SCHEMA_DRIFT_STORAGE_KEY = 'schema_drift_report_v1';

function hasPagingParams(params) {
    return params && (params.page !== undefined || params.size !== undefined);
}

function toQueryString(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.set(key, String(value));
        }
    });
    const raw = query.toString();
    return raw ? `?${raw}` : '';
}

function extractContent(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.content)) return data.content;
    return [];
}

// -- Core fetch helper ----------------------------------------------------------

async function request(method, path, body) {
    const opts = {
        method,
        credentials: 'include',
        headers: {},
    };

    if (body !== undefined) {
        if (body instanceof FormData) {
            opts.body = body;
            // Browser sets multipart boundary for FormData.
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }

    const res = await fetch(`${BASE}${path}`, opts);

    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({ error: res.statusText }));

    if (!res.ok) {
        const err = new Error(data?.error || data?.message || 'Request failed');
        err.status = res.status;
        err.errorCode = data?.errorCode;
        err.errors = data?.errors;
        err.details = data;
        throw err;
    }

    return data;
}

// -- Global session expiry handler (client-side routing) ----------------------

// Detect session expiry from 401 responses and redirect to login
if (typeof window !== 'undefined') {
    // Store original request function
    const originalRequest = request;
    
    // Wrap request to handle 401 with session expiry detection
    const wrappedRequest = async (method, path, body) => {
        try {
            return await originalRequest(method, path, body);
        } catch (err) {
            if (err.status === 401) {
                // Check if this looks like a session expiry (not just missing auth)
                const isSessionExpiry = (err.message === 'Authentication required' || 
                                        err.details?.error === 'Authentication required');
                if (isSessionExpiry && typeof window !== 'undefined') {
                    // Only redirect if not already on login page
                    if (!window.location.pathname.startsWith('/login')) {
                        window.location.href = '/login?expired=true';
                    }
                }
            }
            throw err;
        }
    };
}

// -- Auth ----------------------------------------------------------------------

export async function login(username, password) {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        body,
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.error || 'Invalid credentials');
        err.status = res.status;
        throw err;
    }
    return res.json();
}

export const register = (username, password, email) =>
    request('POST', '/auth/register', { username, password, email });

export const logout = () =>
    request('POST', '/auth/logout');

export const getMe = () =>
    request('GET', '/auth/me');

// -- Forms ---------------------------------------------------------------------

export const getForms = () =>
    request('GET', '/forms');

export const getDashboardStats = () =>
    request('GET', '/forms/stats');

export const getForm = (id, versionId = null) =>
    request('GET', `/forms/${id}${versionId ? `?versionId=${versionId}` : ''}`);

export const getFormVersions = (id) =>
    request('GET', `/forms/${id}/versions`);

export const getRenderForm = (id) =>
    request('GET', `/forms/${id}/render`);

export const getFormRender = (id, versionId = null) =>
    versionId
        ? request('GET', `/forms/${id}/render/admin?versionId=${versionId}`)
        : request('GET', `/forms/${id}/render`);

export const getFormRenderAdmin = (id, versionId = null) =>
    request('GET', `/forms/${id}/render/admin${versionId ? `?versionId=${versionId}` : ''}`);

export const createForm = (dto) =>
    request('POST', '/forms', dto);

export const checkFormCodeUniqueness = (code) =>
    request('GET', `/forms/check-code?code=${code}`);

export const assignBuilder = (id, builderId) =>
    request('PATCH', `/forms/${id}/assign-builder`, { builderId });

export const updateForm = (id, versionId, dto) =>
    request('PUT', `/forms/${id}${versionId ? `?versionId=${versionId}` : ''}`, dto);

export const deleteForm = (id) =>
    request('DELETE', `/forms/${id}`);

export const publishForm = (id) =>
    request('PATCH', `/forms/${id}/publish`);

export const publishVersion = (formId, versionId) =>
    request('PATCH', `/forms/${formId}/versions/${versionId}/publish`);

export const unpublishForm = (id) =>
    request('PATCH', `/forms/${id}/unpublish`);

export const deleteFormVersion = (id, versionId) =>
    request('DELETE', `/forms/${id}/versions/${versionId}`);

export const getDeletedForms = () =>
    request('GET', '/forms/trash');

export const restoreForm = (id) =>
    request('POST', `/forms/${id}/restore`);

export const permanentlyDeleteForm = (id) =>
    request('DELETE', `/forms/${id}/permanent`);

// -- Custom Validation Rules ----------------------------------------------------

export const getCustomValidations = (formId, versionId) =>
    request('GET', `/forms/${formId}/versions/${versionId}/custom-validations`);

export const addCustomValidation = (formId, versionId, dto) =>
    request('POST', `/forms/${formId}/versions/${versionId}/custom-validations`, dto);

export const deleteCustomValidation = (formId, versionId, ruleId) =>
    request('DELETE', `/forms/${formId}/versions/${versionId}/custom-validations/${ruleId}`);

export const updateCustomValidation = (formId, versionId, ruleId, dto) =>
    request('PUT', `/forms/${formId}/versions/${versionId}/custom-validations/${ruleId}`, dto);

// -- Submissions ----------------------------------------------------------------

export async function submitForm(formId, data, submissionId = null, formVersionId = null) {
    const opts = {
        method: 'POST',
        credentials: 'include',
    };

    const payload = { data, formVersionId };
    if (submissionId) payload.submissionId = submissionId;

    if (data instanceof FormData) {
        if (submissionId) data.append('submissionId', submissionId);
        if (formVersionId) data.append('formVersionId', formVersionId);
        opts.body = data;
    } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(payload);
    }

    const res = await fetch(`${BASE}/runtime/forms/${formId}/submit`, opts);

    if (!res.ok) {
        const responseData = await res.json().catch(() => ({ error: res.statusText }));
        const err = new Error(responseData?.error || responseData?.message || 'Submission failed');
        err.status = res.status;
        err.errorCode = responseData?.errorCode;
        err.errors = responseData?.errors;
        err.details = responseData;
        throw err;
    }

    return res.json();
}

export const getDraft = (formId) =>
    request('GET', `/runtime/forms/${formId}/draft`);

export const saveDraft = (formId, data, submissionId = null) =>
    request('POST', `/runtime/forms/${formId}/draft`, { data, submissionId });

export const getSubmissions = (formId, versionId = null) =>
    request('GET', `/runtime/${formId}/submissions${versionId ? `?versionId=${versionId}` : ''}`);

export const getSubmission = (formId, submissionId) =>
    request('GET', `/runtime/${formId}/submissions/${submissionId}`);

export const deleteSubmission = (formId, submissionId) =>
    request('DELETE', `/runtime/${formId}/submissions/${submissionId}`);

export const updateSubmission = (formId, submissionId, data) =>
    request('PUT', `/runtime/${formId}/submissions/${submissionId}`, data);

export const getDeletedSubmissions = (formId) =>
    request('GET', `/runtime/${formId}/submissions/trash`);

export const restoreSubmission = (formId, submissionId) =>
    request('POST', `/runtime/${formId}/submissions/${submissionId}/restore`);

// -- Shared Options -------------------------------------------------------------

export const createSharedOptions = (optionsJson) =>
    request('POST', '/shared-options', { optionsJson });

export const getSharedOptions = (id) =>
    request('GET', `/shared-options/${id}`);

export const updateSharedOptions = (id, optionsJson) =>
    request('PUT', `/shared-options/${id}`, { optionsJson });

// -- File Operations ------------------------------------------------------------

export async function downloadFile(filename) {
    const url = `${BASE}/files/download/${encodeURIComponent(filename)}`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });

        if (!res.ok) {
            throw new Error('File download failed');
        }

        const contentDisposition = res.headers.get('Content-Disposition');
        let downloadFilename = filename;

        if (contentDisposition) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
            if (matches && matches[1]) {
                downloadFilename = matches[1].replace(/['"]/g, '');
            }
        }

        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

        return true;
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    }
}

export function getFileViewUrl(filename) {
    return `${BASE}/files/view/${encodeURIComponent(filename)}`;
}

export function getFileDownloadUrl(filename) {
    return `${BASE}/files/download/${encodeURIComponent(filename)}`;
}

// -- RBAC: Roles ----------------------------------------------------------------

export const getRoles = async (params = null) => {
    const data = await request('GET', `/roles${toQueryString(params || {})}`);
    return hasPagingParams(params) ? data : extractContent(data);
};

export const getRole = (id) =>
    request('GET', '/roles').then(roles => {
        const role = roles.find(r => r.id === Number(id));
        if (!role) throw Object.assign(new Error('Role not found'), { status: 404 });
        return role;
    });

export const createRole = (name, permissions) =>
    request('POST', '/roles', { name, permissions });

export const updateRole = (id, data) =>
    request('PUT', `/roles/${id}`, data);

export const deleteRole = (id) =>
    request('DELETE', `/roles/${id}`);

export const assignPermissionsToRole = (id, permissions) =>
    request('POST', `/roles/${id}/permissions`, { permissions });

// -- RBAC: Users ----------------------------------------------------------------

export const getUsers = async (params = null) => {
    const data = await request('GET', `/users${toQueryString(params || {})}`);
    return hasPagingParams(params) ? data : extractContent(data);
};

export const getUser = (id) =>
    request('GET', `/users/${id}`);

export const createUser = (username, name, email) =>
    request('POST', '/users', { username, name, email });

export const updateUser = (id, data) =>
    request('PUT', `/users/${id}`, data);

export const deleteUser = (id) =>
    request('DELETE', `/users/${id}`);

export const assignRoleToUser = (userId, roleId) =>
    request('POST', `/users/${userId}/roles`, { roleId });

export const removeRoleFromUser = (userId, roleId) =>
    request('DELETE', `/users/${userId}/roles/${roleId}`);

// -- Profile --------------------------------------------------------------------

export const getProfile = () =>
    request('GET', '/profile');

export const updateProfile = (data) =>
    request('PUT', '/profile', data);

export const changePassword = (data) =>
    request('PUT', '/profile/password', data);

export const uploadProfilePhoto = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('POST', '/profile/photo', formData);
};

export const getUserPermissions = (userId) =>
    request('GET', `/users/${userId}/permissions`);

// -- Audit Logs -----------------------------------------------------------------

export const getAdminLogs = (filters = {}) => {
    return request('GET', `/logs/admin${toQueryString(filters)}`);
};

export const getRoleAssignmentLogs = (filters = {}) => {
    return request('GET', `/logs/role-assignments${toQueryString(filters)}`);
};

// -- Workflow Engine -------------------------------------------------------------

export const getVisibilityCandidates = () =>
    request('GET', '/forms/visibility-candidates');

export const getWorkflowCandidates = () =>
    request('GET', '/workflows/candidates');

export const initiateWorkflow = (formId, targetBuilderId, intermediateAuthorityIds = []) =>
    request('POST', '/workflows/initiate', { formId, targetBuilderId, intermediateAuthorityIds });

export const getMyPendingWorkflowSteps = () =>
    request('GET', '/workflows/my-pending');

export const approveWorkflowStep = (stepId, comments) =>
    request('POST', `/workflows/steps/${stepId}/approve`, { comments: comments || null });

export const rejectWorkflowStep = (stepId, comments) =>
    request('POST', `/workflows/steps/${stepId}/reject`, { comments: comments || null });

export const getMyWorkflowStatus = () =>
    request('GET', '/workflows/my-status');

export const getPendingWorkflowReviews = () =>
    request('GET', '/workflows/pending-reviews');

export const getOverallWorkflowReviews = () =>
    request('GET', '/workflows/overall-reviews');

export const approveWorkflowById = (workflowId, comments) =>
    request('POST', `/workflows/${workflowId}/approve`, { comments: comments || null });

export const rejectWorkflowById = (workflowId, comments) =>
    request('POST', `/workflows/${workflowId}/reject`, { comments: comments || null });

export const getAdminWorkflowStatus = (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.creator) params.set('creator', filters.creator);
    if (filters.status) params.set('status', filters.status);
    if (filters.step != null && filters.step !== '') params.set('step', String(filters.step));
    if (filters.fromDate) params.set('fromDate', filters.fromDate);
    if (filters.toDate) params.set('toDate', filters.toDate);
    const qs = params.toString();
    return request('GET', `/admin/workflows/status${qs ? `?${qs}` : ''}`);
};

export const getAllWorkflowStatus = () =>
    request('GET', '/workflows/all-status');

// -- RBAC: Modules & Menu -------------------------------------------------------

export const getMenu = () =>
    request('GET', '/menus');

export const getAllModules = async (params = null) => {
    const data = await request('GET', `/modules${toQueryString(params || {})}`);
    return hasPagingParams(params) ? data : extractContent(data);
};

export const createModule = (data) =>
    request('POST', '/modules', data);

export const updateModule = (id, data) =>
    request('PUT', `/modules/${id}`, data);

export const assignModulesToRole = (roleId, moduleIds) =>
    request('POST', `/modules/role/${roleId}`, moduleIds);

export const getModulesByRole = (roleId) =>
    request('GET', `/modules/role/${roleId}`);

// -- Drift helpers ---------------------------------------------------------------

export function isSchemaDriftError(err) {
    return err?.errorCode === 'SCHEMA_DRIFT';
}

export function saveSchemaDriftReport(report) {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(SCHEMA_DRIFT_STORAGE_KEY, JSON.stringify(report || {}));
    } catch {
        // best-effort cache for redirect-based UX
    }
}

export function readSchemaDriftReport() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(SCHEMA_DRIFT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearSchemaDriftReport() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(SCHEMA_DRIFT_STORAGE_KEY);
}
