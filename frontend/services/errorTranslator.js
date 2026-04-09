/**
 * ════════════════════════════════════════════════════════════════════════════
 * errorTranslator.js — Decision 9.2 Implementation
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Maps technical API error codes to user-friendly messages.
 * Implements Decision 9.2: API responses are technical and structured.
 * Frontend is responsible for rendering user-friendly messages.
 */
const ERROR_CODE_MESSAGES = {
    'VALIDATION_ERROR': 'Please fix the errors below and try again.',
    'NOT_FOUND': 'The item you requested was not found. It may have been deleted.',
    'SUBMISSION_NOT_FOUND': 'This submission was not found. It may have been deleted.',
    'NO_ACTIVE_VERSION': 'This form has no active version. Please contact your administrator.',
    'UNAUTHORIZED': 'Your session has expired. Please log in again.',
    'FORBIDDEN': 'You do not have permission to perform this action.',
    'CONFLICT': 'This action cannot be completed. Please refresh and try again.',
    'SCHEMA_DRIFT': 'The form structure has changed. Please reload the page.',
    'INVALID_ARGUMENT': 'The request was invalid. Please check your input.',
    'TYPE_MISMATCH': 'Invalid data type provided. Please check your input.',
    'EXPRESSION_ERROR': 'A form rule or calculation has an error. Please contact support.',
    'DATABASE_ERROR': 'A database error occurred. Please try again later.',
    'SERVER_ERROR': 'An unexpected error occurred. Please try again later.',
};
export function translateApiError(error) {
    if (!error) return 'An unexpected error occurred.';
    const userMessage = ERROR_CODE_MESSAGES[error?.errorCode];
    if (userMessage) return userMessage;
    return error?.message || 'An unexpected error occurred. Please try again.';
}
export function isValidationError(error) {
    return error?.errorCode === 'VALIDATION_ERROR' && Array.isArray(error?.errors) && error.errors.length > 0;
}
export function isAuthError(error) {
    return error?.status === 401 || error?.errorCode === 'UNAUTHORIZED';
}
export function isPermissionError(error) {
    return error?.status === 403 || error?.errorCode === 'FORBIDDEN';
}
export function isConflictError(error) {
    return error?.status === 409 || error?.errorCode === 'CONFLICT' || error?.errorCode === 'SCHEMA_DRIFT' || error?.errorCode === 'NO_ACTIVE_VERSION';
}
export function isServerError(error) {
    return error?.status >= 500 || error?.errorCode === 'SERVER_ERROR' || error?.errorCode === 'DATABASE_ERROR';
}
export function categorizeError(error) {
    if (isValidationError(error)) return 'validation';
    if (isAuthError(error)) return 'auth';
    if (isPermissionError(error)) return 'permission';
    if (isConflictError(error)) return 'conflict';
    if (isServerError(error)) return 'server';
    return 'unknown';
}
export function getFieldErrorMessage(fieldError) {
    return fieldError?.message || 'Invalid input';
}
export function getErrorHandlingStrategy(error) {
    const category = categorizeError(error);
    switch (category) {
        case 'validation':
            return {
                shouldShowToast: false,
                shouldShowFields: true,
                message: 'Please fix the highlighted fields.',
                severity: 'error',
            };
        case 'auth':
            return {
                shouldShowToast: false,
                shouldShowFields: false,
                message: 'Session expired.',
                severity: 'error',
            };
        case 'permission':
        case 'conflict':
            return {
                shouldShowToast: true,
                shouldShowFields: false,
                message: translateApiError(error),
                severity: 'error',
            };
        case 'server':
            return {
                shouldShowToast: true,
                shouldShowFields: false,
                message: 'Something went wrong. Please try again.',
                severity: 'error',
            };
        default:
            return {
                shouldShowToast: true,
                shouldShowFields: false,
                message: translateApiError(error),
                severity: 'error',
            };
    }
}
export const ErrorTranslator = {
    translateApiError,
    isValidationError,
    isAuthError,
    isPermissionError,
    isConflictError,
    isServerError,
    categorizeError,
    getFieldErrorMessage,
    getErrorHandlingStrategy,
};
export default ErrorTranslator;
