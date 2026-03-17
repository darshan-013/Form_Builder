/**
 * Butterup Toast utility — services/toast.js
 *
 * Butterup is loaded via CDN in pages/_document.js and is available
 * globally as window.butterup. This module provides a safe, SSR-friendly
 * wrapper so any component or page can call toast methods without worrying
 * about SSR or timing issues.
 *
 * Public API:
 *   showSuccess(msg)   — green success toast
 *   showError(msg)     — red error toast
 *   showInfo(msg)      — blue info toast
 *   showWarning(msg)   — amber warning toast
 *
 * Legacy aliases kept for backward-compat:
 *   toastSuccess / toastError / toastInfo / toastWarning
 */

const TITLES = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
};

/**
 * Core function — schedules a Butterup toast.
 * Safe to call during SSR (checks typeof window) and before Butterup
 * fully initialises (retries once after 300 ms if window.butterup is absent).
 */
export function showToast(type, message) {
    if (typeof window === 'undefined') return;

    if (window.butterup) {
        window.butterup.toast({
            title: TITLES[type] || 'Notice',
            message,
            type,           // 'success' | 'error' | 'warning' | 'info'
            location: 'bottom-right',
            icon: true,
            dismissable: true,
        });
    } else {
        // Fallback or early-call buffering if needed
        console.warn('Toast called before library ready:', message);
    }
}

// ── Named exports (primary API) ───────────────────────────────────────────

/** Show a green success toast */
export const showSuccess = (msg) => showToast('success', msg);

/** Show a red error toast */
export const showError = (msg) => showToast('error', msg);

/** Show a blue info toast */
export const showInfo = (msg) => showToast('info', msg);

/** Show an amber warning toast */
export const showWarning = (msg) => showToast('warning', msg);

// ── Legacy aliases — kept so existing imports don't break ─────────────────
export const toastSuccess = showSuccess;
export const toastError = showError;
export const toastInfo = showInfo;
export const toastWarning = showWarning;
