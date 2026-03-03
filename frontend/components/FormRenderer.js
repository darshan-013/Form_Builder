import { useState } from 'react';
import ValidationRules from '../services/validation';

/**
 * FormRenderer — dynamically renders a form from its config and handles submission.
 *
 * Props:
 *   form       — form metadata object (name, description, fields[])
 *   isPreview  — boolean; if true shows preview banner and disables real submission
 *   onSubmit   — async (data: {[fieldKey]: value}) → called on valid submit
 */
export default function FormRenderer({ form, isPreview = false, onSubmit }) {
    const fields = form?.fields || [];

    // ── State ────────────────────────────────────────────────────────────────

    // Initialize values: use defaultValue if set, otherwise '' / false
    const initialValues = () =>
        Object.fromEntries(
            fields.map((f) => [
                f.fieldKey,
                f.fieldType === 'boolean'
                    ? f.defaultValue === 'true' || f.defaultValue === true
                    : f.defaultValue || '',
            ])
        );

    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});           // per-fieldKey error messages
    const [serverError, setServerError] = useState('');       // top-level server error banner
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // ── Validation ───────────────────────────────────────────────────────────

    async function validate() {
        const errs = {};

        // Collect all file objects for validation
        const files = {};
        for (const field of fields) {
            if (field.fieldType === 'file') {
                const fileValue = values[field.fieldKey];
                if (fileValue instanceof File) {
                    files[field.fieldKey] = fileValue;
                }
            }
        }

        // Validate all fields using advanced validation
        const validationErrors = await ValidationRules.validateForm(fields, values, files);

        // Convert validation errors to format expected by component
        for (const [fieldKey, fieldErrors] of Object.entries(validationErrors)) {
            if (fieldErrors.length > 0) {
                errs[fieldKey] = fieldErrors[0]; // Show first error
            }
        }

        return errs;
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isPreview) return; // preview mode — block real submission

        // 1. Client-side validation first — fast, no round-trip
        const errs = await validate();
        setErrors(errs);
        setServerError('');

        if (Object.keys(errs).length > 0) {
            // Scroll to first error
            const firstErrorField = Object.keys(errs)[0];
            const element = document.querySelector(`[name="${firstErrorField}"]`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.focus();
            }
            return;
        }

        setSubmitting(true);
        try {
            // Check if any field actually has a file uploaded (not just file field exists)
            const hasUploadedFile = fields.some(f => {
                const fieldValue = values[f.fieldKey];
                const isFile = f.fieldType === 'file';
                const isFileInstance = fieldValue instanceof File;
                const hasSize = isFileInstance && fieldValue.size > 0;

                console.log(`Field check:`, {
                    fieldKey: f.fieldKey,
                    fieldType: f.fieldType,
                    isFile,
                    valueType: typeof fieldValue,
                    isFileInstance,
                    hasSize,
                    value: fieldValue
                });

                return isFile && isFileInstance && hasSize;
            });

            console.log('Submission decision:', {
                hasUploadedFile,
                willUseMultipart: hasUploadedFile,
                allValues: values
            });

            if (hasUploadedFile) {
                console.log('Using FormData (multipart)');
                // Use FormData for file uploads
                const formData = new FormData();
                for (const [key, val] of Object.entries(values)) {
                    if (val instanceof File) {
                        formData.append(key, val);
                    } else if (val !== null && val !== undefined) {
                        formData.append(key, val);
                    }
                }
                await onSubmit(formData);
            } else {
                console.log('Using JSON');
                // Use regular JSON for non-file submissions
                await onSubmit(values);
            }

            setSubmitted(true);
        } catch (err) {
            // 2. Backend returned validation errors in structured format
            //    { errors: [ { field: "fieldName", message: "error message" } ] }
            console.log('Submission error:', err);

            if (err?.errors && Array.isArray(err.errors)) {
                const fieldErrs = {};
                const unmatched = [];

                for (const error of err.errors) {
                    if (error.field && error.message) {
                        // Find field by label or fieldKey
                        const matchedField = fields.find((f) =>
                            f.label === error.field || f.fieldKey === error.field
                        );

                        if (matchedField) {
                            fieldErrs[matchedField.fieldKey] = error.message;
                        } else {
                            unmatched.push(error.message);
                        }
                    }
                }

                if (Object.keys(fieldErrs).length > 0) {
                    setErrors(fieldErrs);
                    // Scroll to first error
                    const firstErrorField = Object.keys(fieldErrs)[0];
                    const element = document.querySelector(`[name="${firstErrorField}"]`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.focus();
                    }
                }
                if (unmatched.length > 0) {
                    setServerError(unmatched.join(' · '));
                }
            } else if (Array.isArray(err?.errors)) {
                // Legacy format: array of error messages
                const fieldErrs = {};
                const unmatched = [];
                for (const msg of err.errors) {
                    const matchedField = fields.find((f) => msg.startsWith(f.label));
                    if (matchedField) {
                        fieldErrs[matchedField.fieldKey] = msg;
                    } else {
                        unmatched.push(msg);
                    }
                }
                if (Object.keys(fieldErrs).length > 0) setErrors(fieldErrs);
                if (unmatched.length > 0) setServerError(unmatched.join(' · '));
            } else {
                setServerError(err?.message || 'Submission failed. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };


    // ── Field value change ────────────────────────────────────────────────────

    const change = (key, value) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        // Clear both inline error and server banner on any change
        if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e; });
        if (serverError) setServerError('');
    };

    // ── Success screen ────────────────────────────────────────────────────────

    if (submitted) {
        return (
            <div className="form-renderer-card">
                <div className="form-success-state">
                    <div className="success-icon-ring">✓</div>
                    <h2>Submitted Successfully!</h2>
                    <p>Thank you — your response has been recorded.</p>
                    <button
                        className="btn btn-secondary success-another-btn"
                        onClick={() => { setValues(initialValues()); setSubmitted(false); }}
                    >
                        Submit another response
                    </button>
                </div>
            </div>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="form-renderer-card">
            {/* Preview banner */}
            {isPreview && (
                <div className="preview-banner">
                    👁&nbsp;<strong>Preview Mode</strong> — submissions are disabled
                </div>
            )}

            {/* Header */}
            <div className="form-renderer-header">
                <h1 className="form-renderer-title">{form.name}</h1>
                {form.description && (
                    <p className="form-renderer-desc">{form.description}</p>
                )}
                <div className="form-renderer-meta">
                    <span className="form-renderer-meta-item">
                        🔲 {fields.length} field{fields.length !== 1 ? 's' : ''}
                    </span>
                    {fields.some((f) => f.required) && (
                        <span className="form-renderer-meta-item">
                            <span className="form-field-required-star">*</span> Required fields marked
                        </span>
                    )}
                </div>
            </div>

            {/* Server-side error banner (unmatched backend errors) */}
            {serverError && (
                <div className="auth-error" style={{ margin: '0 32px 0', borderRadius: 10 }}>
                    <span>⚠</span> {serverError}
                </div>
            )}

            {/* Fields */}
            <form onSubmit={handleSubmit} noValidate>
                {fields.length === 0 ? (
                    <div className="form-empty-state">
                        This form has no fields yet.
                    </div>
                ) : (
                    <div className="form-renderer-body">
                        {[...fields]
                            .sort((a, b) => a.fieldOrder - b.fieldOrder)
                            .map((field) => (
                                <FieldInput
                                    key={field.id || field.fieldKey}
                                    field={field}
                                    value={values[field.fieldKey]}
                                    error={errors[field.fieldKey]}
                                    onChange={(val) => change(field.fieldKey, val)}
                                    disabled={isPreview}
                                />
                            ))}
                    </div>
                )}

                {/* Submit */}
                <div className="form-renderer-footer">
                    <button
                        type="submit"
                        id="form-submit-btn"
                        className="form-submit-btn"
                        disabled={submitting || isPreview || fields.length === 0}
                    >
                        {submitting ? (
                            <><span className="spinner" style={{ borderTopColor: '#fff', width: 18, height: 18 }} /> Submitting…</>
                        ) : isPreview ? (
                            '👁 Preview Mode — Submit Disabled'
                        ) : (
                            'Submit Form →'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

/* ── Individual field renderer ──────────────────────────────────────────── */

function FieldInput({ field, value, error, onChange, disabled }) {
    const inputId = `field-${field.fieldKey}`;

    return (
        <div className="form-field-group" style={{ animationDelay: `${field.fieldOrder * 40}ms` }}>
            {/* Label */}
            {field.fieldType !== 'boolean' && (
                <label className="form-field-label" htmlFor={inputId}>
                    {field.label}
                    {field.required && <span className="form-field-required-star" title="Required">*</span>}
                </label>
            )}

            {/* Input by type */}
            {field.fieldType === 'text' && (
                <input
                    id={inputId}
                    type="text"
                    className={`form-input ${error ? 'input-error' : ''}`}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.defaultValue ? `e.g. ${field.defaultValue}` : `Enter ${field.label.toLowerCase()}…`}
                    required={field.required}
                    disabled={disabled}
                />
            )}

            {field.fieldType === 'number' && (
                <input
                    id={inputId}
                    type="number"
                    className={`form-input ${error ? 'input-error' : ''}`}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.defaultValue || '0'}
                    required={field.required}
                    disabled={disabled}
                />
            )}

            {field.fieldType === 'date' && (
                <input
                    id={inputId}
                    type="date"
                    className={`form-input ${error ? 'input-error' : ''}`}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    required={field.required}
                    disabled={disabled}
                />
            )}

            {field.fieldType === 'boolean' && (
                <label className={`bool-toggle-wrap ${disabled ? 'opacity-50' : ''}`} htmlFor={inputId}>
                    <input
                        id={inputId}
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                        disabled={disabled}
                    />
                    <span className="bool-toggle-label">
                        {field.label}
                        {field.required && <span className="form-field-required-star"> *</span>}
                    </span>
                </label>
            )}

            {field.fieldType === 'dropdown' && (
                <select
                    id={inputId}
                    className={`form-input ${error ? 'input-error' : ''}`}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    required={field.required}
                    disabled={disabled}
                >
                    <option value="">-- Select {field.label} --</option>
                    {(() => {
                        if (!field.optionsJson || field.optionsJson === 'null' || field.optionsJson === '') {
                            console.warn(`Dropdown field "${field.label}" has no options configured`);
                            return <option value="" disabled>No options configured</option>;
                        }
                        try {
                            const opts = JSON.parse(field.optionsJson);
                            if (Array.isArray(opts) && opts.length > 0) {
                                return opts.map((opt, i) => (
                                    <option key={i} value={opt}>{opt}</option>
                                ));
                            }
                            console.warn('Dropdown options empty or invalid:', field.optionsJson);
                            return <option value="" disabled>No options configured</option>;
                        } catch (e) {
                            console.error('Failed to parse dropdown options:', field.optionsJson, e);
                            return <option value="" disabled>Invalid options</option>;
                        }
                    })()}
                </select>
            )}

            {field.fieldType === 'radio' && (
                <div className="radio-group">
                    {(() => {
                        if (!field.optionsJson || field.optionsJson === 'null' || field.optionsJson === '') {
                            console.warn(`Radio field "${field.label}" has no options configured`);
                            return <span className="form-field-error">No options configured</span>;
                        }
                        try {
                            const opts = JSON.parse(field.optionsJson);
                            if (Array.isArray(opts) && opts.length > 0) {
                                return opts.map((opt, i) => (
                                    <label key={i} className="radio-option">
                                        <input
                                            type="radio"
                                            name={inputId}
                                            value={opt}
                                            checked={value === opt}
                                            onChange={(e) => onChange(e.target.value)}
                                            disabled={disabled}
                                            required={field.required}
                                        />
                                        <span>{opt}</span>
                                    </label>
                                ));
                            }
                            console.warn('Radio options empty or invalid:', field.optionsJson);
                            return <span className="form-field-error">No options configured</span>;
                        } catch (e) {
                            console.error('Failed to parse radio options:', field.optionsJson, e);
                            return <span className="form-field-error">Invalid options configuration</span>;
                        }
                    })()}
                </div>
            )}

            {field.fieldType === 'file' && (
                <input
                    id={inputId}
                    type="file"
                    className={`form-input ${error ? 'input-error' : ''}`}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            onChange(file);
                        }
                    }}
                    required={field.required}
                    disabled={disabled}
                />
            )}

            {/* Inline error */}
            {error && <span className="form-field-error">{error}</span>}
        </div>
    );
}
