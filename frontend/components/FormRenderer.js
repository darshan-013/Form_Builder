import { useState, useRef, useEffect } from 'react';
import ValidationEngine from '../services/validation';

/**
 * FormRenderer — enterprise dynamic form renderer.
 *
 * Validation lifecycle:
 *   onChange → live sync validation on EVERY keystroke (shows errors as you type)
 *   onBlur   → marks field touched so errors stay visible even if emptied
 *   onSubmit → full async validation (image dimensions etc.) + blocks if any error
 */
export default function FormRenderer({ form, isPreview = false, onSubmit }) {
  const fields = form?.fields || [];

  // ── Build initial values from field defaults ───────────────────────────────
  function makeInitialValues() {
    return Object.fromEntries(
      fields.map((f) => [
        f.fieldKey,
        f.fieldType === 'boolean'
          ? (f.defaultValue === 'true' || f.defaultValue === true)
          : (f.defaultValue || ''),
      ])
    );
  }

  const [values,      setValues]      = useState(makeInitialValues);
  const [errors,      setErrors]      = useState({});  // { fieldKey: string[] }
  const [touched,     setTouched]     = useState({});  // { fieldKey: boolean }
  const [serverError, setServerError] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  // File objects stored in ref (avoids stale-closure issues in async handlers)
  const filesRef = useRef({});

  // Keep a ref to current values so async handlers always read the latest
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);

  // ── onChange — live validation on every keystroke ──────────────────────────
  function handleChange(field, value) {
    // 1. Update value in state
    const newValues = { ...valuesRef.current, [field.fieldKey]: value };
    setValues(newValues);
    valuesRef.current = newValues;

    // 2. Update file ref
    if (field.fieldType === 'file' && value instanceof File) {
      filesRef.current = { ...filesRef.current, [field.fieldKey]: value };
    }

    // 3. Run sync validation immediately — show errors AS the user types
    const errs = ValidationEngine.validateFieldSync(field, value, newValues, filesRef.current);
    setErrors((prev) => ({ ...prev, [field.fieldKey]: errs }));

    // 4. Mark field touched (so error stays visible)
    setTouched((prev) => ({ ...prev, [field.fieldKey]: true }));

    // 5. Clear server banner
    if (serverError) setServerError('');
  }

  // ── onBlur — ensure touched is set so error persists ──────────────────────
  function handleBlur(field, value) {
    setTouched((prev) => ({ ...prev, [field.fieldKey]: true }));
    // Re-run validation on blur too (catches paste/autofill that skips onChange)
    const errs = ValidationEngine.validateFieldSync(field, value, valuesRef.current, filesRef.current);
    setErrors((prev) => ({ ...prev, [field.fieldKey]: errs }));
  }

  // ── onSubmit — full async validation, block if any errors ─────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) return;

    // Mark all fields as touched so all errors become visible
    const allTouched = Object.fromEntries(fields.map((f) => [f.fieldKey, true]));
    setTouched(allTouched);

    // Full async validation (covers image dimensions, etc.)
    const allErrors = await ValidationEngine.validateForm(fields, valuesRef.current, filesRef.current);
    setErrors(allErrors);
    setServerError('');

    if (Object.keys(allErrors).length > 0) {
      // Scroll + focus first error field
      const firstKey = Object.keys(allErrors)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
      return;
    }

    // ── All valid — submit ───────────────────────────────────────────────────
    setSubmitting(true);
    try {
      const currentValues = valuesRef.current;
      const hasFile = fields.some(
        (f) => f.fieldType === 'file' && filesRef.current[f.fieldKey] instanceof File
      );

      if (hasFile) {
        const fd = new FormData();
        for (const [key, val] of Object.entries(currentValues)) {
          if (filesRef.current[key] instanceof File) {
            fd.append(key, filesRef.current[key]);
          } else if (val != null) {
            fd.append(key, val);
          }
        }
        await onSubmit(fd);
      } else {
        await onSubmit(currentValues);
      }

      setSubmitted(true);
    } catch (err) {
      if (err?.errors && Array.isArray(err.errors)) {
        const fieldErrs = {};
        const unmatched = [];

        for (const error of err.errors) {
          // Backend sends { field: fieldKey, message: string }
          if (error && typeof error === 'object' && error.field && error.message) {
            const key = error.field;
            if (key === '__general__') {
              unmatched.push(error.message);
            } else {
              // Match by fieldKey directly (primary) or label (fallback)
              const matchedField = fields.find(
                (f) => f.fieldKey === key || f.label === key
              );
              const targetKey = matchedField ? matchedField.fieldKey : key;
              if (!fieldErrs[targetKey]) fieldErrs[targetKey] = [];
              fieldErrs[targetKey].push(error.message);
            }
          } else if (typeof error === 'string') {
            unmatched.push(error);
          }
        }

        if (Object.keys(fieldErrs).length) {
          setErrors(fieldErrs);
          // Mark all backend-errored fields as touched so errors show
          const newTouched = Object.fromEntries(Object.keys(fieldErrs).map((k) => [k, true]));
          setTouched((prev) => ({ ...prev, ...newTouched }));
          const firstKey = Object.keys(fieldErrs)[0];
          const el = document.getElementById(`field-${firstKey}`);
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
        }
        if (unmatched.length) setServerError(unmatched.join(' · '));
      } else {
        setServerError(err?.message || 'Submission failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="form-renderer-card">
        <div className="form-success-state">
          <div className="success-icon-ring">✓</div>
          <h2>Submitted Successfully!</h2>
          <p>Thank you — your response has been recorded.</p>
          <button
            className="btn btn-secondary success-another-btn"
            onClick={() => {
              const fresh = makeInitialValues();
              setValues(fresh);
              valuesRef.current = fresh;
              filesRef.current = {};
              setErrors({});
              setTouched({});
              setSubmitted(false);
            }}
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="form-renderer-card">
      {isPreview && (
        <div className="preview-banner">
          👁&nbsp;<strong>Preview Mode</strong> — submissions are disabled
        </div>
      )}

      <div className="form-renderer-header">
        <h1 className="form-renderer-title">{form.name}</h1>
        {form.description && <p className="form-renderer-desc">{form.description}</p>}
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

      {serverError && (
        <div className="auth-error" style={{ margin: '0 32px 16px', borderRadius: 10 }}>
          <span>⚠</span> {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {fields.length === 0 ? (
          <div className="form-empty-state">This form has no fields yet.</div>
        ) : (
          <div className="form-renderer-body">
            {[...fields]
              .sort((a, b) => a.fieldOrder - b.fieldOrder)
              .map((field) => (
                <FieldInput
                  key={field.id || field.fieldKey}
                  field={field}
                  value={values[field.fieldKey]}
                  errors={errors[field.fieldKey] || []}
                  touched={!!touched[field.fieldKey]}
                  onChange={(val) => handleChange(field, val)}
                  onBlur={(val)   => handleBlur(field, val)}
                  disabled={isPreview}
                />
              ))}
          </div>
        )}

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

// ─── FieldInput ───────────────────────────────────────────────────────────────
/**
 * Renders a single form field.
 *
 * errors   = string[]  (all validation messages for this field)
 * touched  = boolean   (true once user has interacted — controls whether to show errors)
 *
 * Shows the FIRST (highest-priority) error only for clean UX.
 */
function FieldInput({ field, value, errors, touched, onChange, onBlur, disabled }) {
  const id         = `field-${field.fieldKey}`;
  const errorList  = Array.isArray(errors) ? errors : [];
  // Show error only after the user has touched the field (typed or left it)
  const shownError = touched && errorList.length > 0 ? errorList[0] : null;
  const hasError   = !!shownError;
  const inputClass = `form-input${hasError ? ' input-error' : ''}`;

  return (
    <div className="form-field-group" style={{ animationDelay: `${(field.fieldOrder || 0) * 40}ms` }}>

      {/* Label */}
      {field.fieldType !== 'boolean' && (
        <label className="form-field-label" htmlFor={id}>
          {field.label}
          {field.required && <span className="form-field-required-star" title="Required"> *</span>}
        </label>
      )}

      {/* ── text ───────────────────────────────────────────────── */}
      {field.fieldType === 'text' && (
        <input
          id={id}
          type="text"
          className={inputClass}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e)   => onBlur(e.target.value)}
          placeholder={field.defaultValue ? `e.g. ${field.defaultValue}` : `Enter ${field.label.toLowerCase()}…`}
          disabled={disabled}
          autoComplete="off"
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        />
      )}

      {/* ── number ─────────────────────────────────────────────── */}
      {field.fieldType === 'number' && (
        <input
          id={id}
          type="number"
          className={inputClass}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e)   => onBlur(e.target.value)}
          placeholder={field.defaultValue || ''}
          disabled={disabled}
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        />
      )}

      {/* ── date ───────────────────────────────────────────────── */}
      {field.fieldType === 'date' && (
        <input
          id={id}
          type="date"
          className={inputClass}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e)   => onBlur(e.target.value)}
          disabled={disabled}
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        />
      )}

      {/* ── boolean ────────────────────────────────────────────── */}
      {field.fieldType === 'boolean' && (
        <label
          className={`bool-toggle-wrap${disabled ? ' opacity-50' : ''}${hasError ? ' bool-toggle-error' : ''}`}
          htmlFor={id}
        >
          <input
            id={id}
            type="checkbox"
            checked={!!value}
            onChange={(e) => { onChange(e.target.checked); onBlur(e.target.checked); }}
            disabled={disabled}
            aria-invalid={hasError || undefined}
          />
          <span className="bool-toggle-label">
            {field.label}
            {field.required && <span className="form-field-required-star"> *</span>}
          </span>
        </label>
      )}

      {/* ── dropdown ───────────────────────────────────────────── */}
      {field.fieldType === 'dropdown' && (
        <select
          id={id}
          className={inputClass}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e)   => onBlur(e.target.value)}
          disabled={disabled}
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        >
          <option value="">— Select {field.label} —</option>
          {parseOptions(field.optionsJson, field.options).map((opt, i) => (
            <option key={i} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {/* ── radio ──────────────────────────────────────────────── */}
      {field.fieldType === 'radio' && (
        <div
          className={`radio-group${hasError ? ' radio-group-error' : ''}`}
          role="radiogroup"
          aria-describedby={hasError ? `${id}-err` : undefined}
        >
          {parseOptions(field.optionsJson, field.options).map((opt, i) => (
            <label key={i} className="radio-option">
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={value === opt.value}
                onChange={(e) => { onChange(e.target.value); onBlur(e.target.value); }}
                disabled={disabled}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* ── file ───────────────────────────────────────────────── */}
      {field.fieldType === 'file' && (
        <input
          id={id}
          type="file"
          className={inputClass}
          multiple={getMultiple(field.validationJson)}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onChange(f); onBlur(f); }
          }}
          disabled={disabled}
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        />
      )}

      {/* ── Error (shows after first interaction, highest-priority only) ── */}
      {hasError && (
        <span id={`${id}-err`} className="form-field-error" role="alert" aria-live="polite">
          {shownError}
        </span>
      )}
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseOptions(optionsJson, resolvedOptions) {
  // Priority 1: pre-resolved [{label, value}] objects from /render endpoint
  if (Array.isArray(resolvedOptions) && resolvedOptions.length > 0) {
    return resolvedOptions; // already [{label, value}]
  }
  // Priority 2: inline optionsJson string ["Opt1","Opt2"]
  if (!optionsJson || optionsJson === 'null') return [];
  try {
    const parsed = JSON.parse(optionsJson);
    if (!Array.isArray(parsed)) return [];
    // Could be strings or objects
    return parsed.map(o =>
      typeof o === 'string' ? { label: o, value: o } : o
    );
  } catch { return []; }
}

function getMultiple(validationJson) {
  try {
    return JSON.parse(validationJson || '{}').singleOrMultiple === 'multiple';
  } catch { return false; }
}
