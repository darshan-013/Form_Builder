import { useState, useRef, useEffect, useMemo } from 'react';
import ValidationEngine from '../services/validation';
import RuleEngine from '../services/RuleEngine';

/**
 * FormRenderer — enterprise dynamic form renderer with Conditional Rule Engine.
 *
 * Rule Engine lifecycle:
 *   Fields load  → withParsedRules()    pre-parses all rulesJson ONCE (not per keystroke)
 *                → buildDependencyMap() maps source→target field relationships
 *                → applyRules()         sets initial field states
 *   onChange     → applyRules() re-evaluates all rules with new values
 *                → cascading setValue handled internally (MAX_PASSES = 5)
 *                → fieldStates drives visible / required / disabled / setValue per field
 *   onSubmit     → validates VISIBLE fields only (hidden = skip validation)
 *                → hidden field VALUES preserved in state and sent to backend
 *                → backend validates independently — never trusts frontend rule state
 *
 * Priority: ascending fieldOrder. Higher order = evaluated later = wins conflicts.
 */
export default function FormRenderer({ form, isPreview = false, onSubmit }) {
  const rawFields = form?.fields || [];

  // Pre-parse rulesJson once — avoids repeated JSON.parse inside evaluation loops
  const fields = useMemo(() => RuleEngine.withParsedRules(rawFields), [rawFields]);

  // Dependency map: { sourceKey → Set<targetKey> }
  // eslint-disable-next-line no-unused-vars
  const depMap = useMemo(() => RuleEngine.buildDependencyMap(fields), [fields]);

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
  const [fieldStates, setFieldStates] = useState(() => RuleEngine.applyRules(fields, makeInitialValues()));
  const [serverError, setServerError] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  // File objects stored in ref (avoids stale-closure issues in async handlers)
  const filesRef = useRef({});

  // Keep a ref to current values so async handlers always read the latest
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);

  // Re-initialise when fields change (async load or form switch)
  useEffect(() => {
    const initial = makeInitialValues();
    setValues(initial);
    valuesRef.current = initial;
    filesRef.current  = {};
    setErrors({});
    setTouched({});
    setFieldStates(RuleEngine.applyRules(fields, initial));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  // ── onChange — live validation + rule re-evaluation on every keystroke ─────
  function handleChange(field, value) {
    // 1. Update raw value
    const newValues = { ...valuesRef.current, [field.fieldKey]: value };

    // 2. Update file ref
    if (field.fieldType === 'file' && value instanceof File) {
      filesRef.current = { ...filesRef.current, [field.fieldKey]: value };
    }

    // 3. Re-evaluate all rules — cascading setValue handled internally (MAX_PASSES = 5)
    const newStates = RuleEngine.applyRules(fields, newValues);
    setFieldStates(newStates);

    // 4. Apply any setValue overrides from rules back into values (cascade result)
    let finalValues = { ...newValues };
    for (const [key, st] of Object.entries(newStates)) {
      if (st.setValue !== null && String(finalValues[key] ?? '') !== String(st.setValue)) {
        finalValues[key] = st.setValue;
      }
    }
    setValues(finalValues);
    valuesRef.current = finalValues;

    // 5. Validate changed field using rule-adjusted required flag
    const effectiveField = {
      ...field,
      required: newStates[field.fieldKey]?.required ?? field.required,
    };
    const errs = ValidationEngine.validateFieldSync(
      effectiveField, finalValues[field.fieldKey], finalValues, filesRef.current
    );
    setErrors((prev) => ({ ...prev, [field.fieldKey]: errs }));

    // 6. Mark field touched (so error stays visible)
    setTouched((prev) => ({ ...prev, [field.fieldKey]: true }));

    // 7. Clear server banner
    if (serverError) setServerError('');
  }

  // ── onBlur — ensure touched is set so error persists ──────────────────────
  function handleBlur(field, value) {
    setTouched((prev) => ({ ...prev, [field.fieldKey]: true }));
    // Re-run validation on blur (catches paste/autofill that skips onChange)
    const effectiveField = {
      ...field,
      required: fieldStates[field.fieldKey]?.required ?? field.required,
    };
    const errs = ValidationEngine.validateFieldSync(effectiveField, value, valuesRef.current, filesRef.current);
    setErrors((prev) => ({ ...prev, [field.fieldKey]: errs }));
  }

  // ── onSubmit — full async validation, block if any errors ─────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) return;

    // Mark all fields as touched so all errors become visible
    const allTouched = Object.fromEntries(fields.map((f) => [f.fieldKey, true]));
    setTouched(allTouched);

    // Validate VISIBLE fields only — hidden fields skip validation.
    // Hidden field VALUES are preserved in state and sent to backend.
    // Backend validates all required constraints independently of rule state.
    const visibleFields = fields
      .filter(f => fieldStates[f.fieldKey]?.visible !== false)
      .map(f => ({
        ...f,
        required: fieldStates[f.fieldKey]?.required ?? f.required,
      }));

    const allErrors = await ValidationEngine.validateForm(visibleFields, valuesRef.current, filesRef.current);
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
              setFieldStates(RuleEngine.applyRules(fields, fresh));
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
              .sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0))
              .map((field) => {
                const st = fieldStates[field.fieldKey] || {};

                // Hidden fields — render nothing, value preserved in state
                // (enterprise standard: keep value, skip validation, include in payload)
                if (st.visible === false) return null;

                // Effective value: rule setValue override takes precedence over user input
                const effectiveValue = (st.setValue !== null && st.setValue !== undefined)
                  ? st.setValue
                  : values[field.fieldKey];

                return (
                  <FieldInput
                    key={field.id || field.fieldKey}
                    field={{ ...field, required: st.required ?? field.required }}
                    value={effectiveValue}
                    errors={errors[field.fieldKey] || []}
                    touched={!!touched[field.fieldKey]}
                    onChange={(val) => handleChange(field, val)}
                    onBlur={(val)   => handleBlur(field, val)}
                    disabled={isPreview || !!st.disabled}
                  />
                );
              })}
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
