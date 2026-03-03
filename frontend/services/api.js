/**
 * API service layer.
 * All requests go through Next.js rewrite proxy → Spring Boot :8080
 * Session cookie (JSESSIONID) is carried automatically via credentials:'include'.
 */

const BASE = '/api';

// ── Core fetch helper ─────────────────────────────────────────

async function request(method, path, body) {
    const opts = {
        method,
        credentials: 'include',   // send/receive JSESSIONID cookie
        headers: {},
    };

    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE}${path}`, opts);

    // No-content responses
    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({ error: res.statusText }));

    if (!res.ok) {
        const err = new Error(data?.error || data?.message || 'Request failed');
        err.status = res.status;
        err.errors = data?.errors;    // field-level validation errors array
        throw err;
    }

    return data;
}

// ── Auth ──────────────────────────────────────────────────────

/**
 * Login via Spring Security formLogin().
 * Must send application/x-www-form-urlencoded (not JSON).
 */
export async function login(username, password) {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        body,
        // No Content-Type header — let browser set it to application/x-www-form-urlencoded
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.error || 'Invalid credentials');
        err.status = res.status;
        throw err;
    }
    return res.json();
}

export const register = (username, password) =>
    request('POST', '/auth/register', { username, password });

export const logout = () =>
    request('POST', '/auth/logout');

export const getMe = () =>
    request('GET', '/auth/me');

// ── Forms ─────────────────────────────────────────────────────

export const getForms = () =>
    request('GET', '/forms');

export const getForm = (id) =>
    request('GET', `/forms/${id}`);

export const createForm = (dto) =>
    request('POST', '/forms', dto);

export const updateForm = (id, dto) =>
    request('PUT', `/forms/${id}`, dto);

export const deleteForm = (id) =>
    request('DELETE', `/forms/${id}`);

// ── Submissions ───────────────────────────────────────────────

export async function submitForm(formId, data) {
    const opts = {
        method: 'POST',
        credentials: 'include',
    };

    // Check if data is FormData (for file uploads)
    if (data instanceof FormData) {
        // Don't set Content-Type header - browser will set it with boundary
        opts.body = data;
    } else {
        // Regular JSON submission
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify({ data });
    }

    const res = await fetch(`${BASE}/forms/${formId}/submit`, opts);

    if (!res.ok) {
        const responseData = await res.json().catch(() => ({ error: res.statusText }));
        const err = new Error(responseData?.error || responseData?.message || 'Submission failed');
        err.status = res.status;
        err.errors = responseData?.errors;
        throw err;
    }

    return res.json();
}

export const getSubmissions = (formId) =>
    request('GET', `/forms/${formId}/submissions`);

// ── Form Render (public) ──────────────────────────────────────

export const getFormRender = (formId) =>
    request('GET', `/forms/${formId}/render`);

// ── Dropdown Schemas ──────────────────────────────────────────

// ── Shared Options ────────────────────────────────────────────
// Manages the shared_options table — canonical option lists shared across form fields.

/** Create a new shared_options row. Returns {id, optionsJson, createdAt, updatedAt}. */
export const createSharedOptions = (optionsJson) =>
    request('POST', '/shared-options', { optionsJson });

/** Get a single shared_options row by id. */
export const getSharedOptions = (id) =>
    request('GET', `/shared-options/${id}`);

/** Update the options_json of a shared_options row. All linked fields reflect this instantly. */
export const updateSharedOptions = (id, optionsJson) =>
    request('PUT', `/shared-options/${id}`, { optionsJson });

// ── File Operations ───────────────────────────────────────────

/**
 * Download a file by filename.
 * Opens download prompt in browser.
 */
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

        // Get filename from Content-Disposition header or use provided filename
        const contentDisposition = res.headers.get('Content-Disposition');
        let downloadFilename = filename;

        if (contentDisposition) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
            if (matches && matches[1]) {
                downloadFilename = matches[1].replace(/['"]/g, '');
            }
        }

        // Create blob and trigger download
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

/**
 * Get file URL for viewing/linking.
 * Returns the URL to view file inline (for images, PDFs, etc.)
 */
export function getFileViewUrl(filename) {
    return `${BASE}/files/view/${encodeURIComponent(filename)}`;
}

/**
 * Get file download URL.
 * Returns the URL for direct download link.
 */
export function getFileDownloadUrl(filename) {
    return `${BASE}/files/download/${encodeURIComponent(filename)}`;
}


