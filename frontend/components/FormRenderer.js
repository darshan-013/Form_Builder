import { useState, useRef, useEffect, useMemo } from 'react';
import ValidationEngine from '../services/validation';
import RuleEngine, { setDefaultValues } from '../services/RuleEngine';

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
    setDefaultValues(initial); // snapshot for 'changed' operator (v2)
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

    // 2. Update file ref — store FileList or single File
    if (field.fieldType === 'file') {
      if (value instanceof FileList) {
        filesRef.current = { ...filesRef.current, [field.fieldKey]: value };
      } else if (value instanceof File) {
        filesRef.current = { ...filesRef.current, [field.fieldKey]: value };
      }
    }

    // 3. Re-evaluate all rules — cascading setValue handled internally (MAX_PASSES = 5)
    const newStates = RuleEngine.applyRules(fields, newValues);
    setFieldStates(newStates);

    // 4. Apply any setValue / copyValue overrides from rules back into values (cascade result)
    let finalValues = { ...newValues };
    for (const [key, st] of Object.entries(newStates)) {
      if (st.setValue !== null && String(finalValues[key] ?? '') !== String(st.setValue)) {
        finalValues[key] = st.setValue;
      }
      // NEW (v2): copyValue override
      if (st.copyValue !== null && String(finalValues[key] ?? '') !== String(st.copyValue)) {
        finalValues[key] = st.copyValue;
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
        (f) => f.fieldType === 'file' &&
          (filesRef.current[f.fieldKey] instanceof File ||
           filesRef.current[f.fieldKey] instanceof FileList)
      );

      if (hasFile) {
        const fd = new FormData();
        for (const [key, val] of Object.entries(currentValues)) {
          const fileVal = filesRef.current[key];
          if (fileVal instanceof FileList) {
            // Append every file with the same key so backend receives all
            for (let i = 0; i < fileVal.length; i++) {
              fd.append(key, fileVal[i]);
            }
          } else if (fileVal instanceof File) {
            fd.append(key, fileVal);
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

                // Effective value: copyValue > setValue > user input (priority order)
                const effectiveValue =
                  st.copyValue !== null && st.copyValue !== undefined
                    ? st.copyValue
                    : st.setValue !== null && st.setValue !== undefined
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
                    filterOptions={st.filterOptions ?? null}
                    min={st.min ?? null}
                    max={st.max ?? null}
                    labelOverride={st.label ?? null}
                    placeholderOverride={st.placeholder ?? null}
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
 * errors            = string[]      (all validation messages for this field)
 * touched           = boolean       (true once user has interacted)
 * filterOptions     = string[]|null (NEW v2) allowed option values; null = show all
 * min/max           = number|null   (NEW v2) dynamic bounds for number/date fields
 * labelOverride     = string|null   (NEW v2) runtime label override
 * placeholderOverride = string|null (NEW v2) runtime placeholder override
 *
 * Shows the FIRST (highest-priority) error only for clean UX.
 */
function FieldInput({ field, value, errors, touched, onChange, onBlur, disabled,
                      filterOptions, min, max, labelOverride, placeholderOverride }) {
  const id         = `field-${field.fieldKey}`;
  const errorList  = Array.isArray(errors) ? errors : [];
  const shownError = touched && errorList.length > 0 ? errorList[0] : null;
  const hasError   = !!shownError;
  const inputClass = `form-input${hasError ? ' input-error' : ''}`;

  // ── NEW (v2): resolve effective label and placeholder ──────────────────────
  const effectiveLabel       = labelOverride       ?? field.label;
  const effectivePlaceholder = placeholderOverride
    ?? (field.defaultValue ? `e.g. ${field.defaultValue}` : `Enter ${field.label.toLowerCase()}…`);

  // ── NEW (v2): filter helper for dropdown / radio ───────────────────────────
  function filterOpts(rawOpts) {
    if (!filterOptions || filterOptions.length === 0) return rawOpts;
    return rawOpts.filter(o =>
      filterOptions.includes(o.value) || filterOptions.includes(o.label)
    );
  }

  return (
    <div className="form-field-group" style={{ animationDelay: `${(field.fieldOrder || 0) * 40}ms` }}>

      {/* Label */}
      {field.fieldType !== 'boolean' && (
        <label className="form-field-label" htmlFor={id}>
          {effectiveLabel}
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
          placeholder={effectivePlaceholder}
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
          placeholder={placeholderOverride ?? (field.defaultValue || '')}
          min={min ?? undefined}
          max={max ?? undefined}
          disabled={disabled}
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        />
      )}

      {/* ── date ───────────────────────────────────────────────── */}
      {field.fieldType === 'date' && (() => {
        // Parse the configured display format from validationJson
        let customFormat = 'YYYY-MM-DD';
        try {
          const rules = JSON.parse(field.validationJson || '{}');
          if (rules.customFormat) customFormat = rules.customFormat;
        } catch {}

        return (
          <>
            <input
              id={id}
              type="date"
              className={inputClass}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={(e)   => onBlur(e.target.value)}
              min={min ?? undefined}
              max={max ?? undefined}
              disabled={disabled}
              aria-describedby={hasError ? `${id}-err` : undefined}
              aria-invalid={hasError || undefined}
            />
            {customFormat && customFormat !== 'YYYY-MM-DD' && (
              <span className="form-field-hint">
                📅 Display format: {customFormat}
              </span>
            )}
          </>
        );
      })()}

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
            {effectiveLabel}
            {field.required && <span className="form-field-required-star"> *</span>}
          </span>
        </label>
      )}

      {/* ── dropdown (single <select>) ─────────────────────────── */}
      {field.fieldType === 'dropdown' && (
        <select
          id={id}
          className={`form-select${hasError ? ' input-error' : ''}`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e)   => onBlur(e.target.value)}
          disabled={disabled}
          aria-describedby={hasError ? `${id}-err` : undefined}
          aria-invalid={hasError || undefined}
        >
          <option value="">— Select {effectiveLabel} —</option>
          {filterOpts(parseOptions(field.optionsJson, field.options)).map((opt, i) => (
            <option key={i} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {/* ── radio (single-select radio buttons) ────────────────── */}
      {field.fieldType === 'radio' && (
        <div
          className={`radio-group${hasError ? ' radio-group-error' : ''}`}
          role="radiogroup"
          aria-describedby={hasError ? `${id}-err` : undefined}
        >
          {filterOpts(parseOptions(field.optionsJson, field.options)).map((opt, i) => (
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

      {/* ── multiple_choice (multi-select checkboxes) ─────────── */}
      {field.fieldType === 'multiple_choice' && (
        <div
          className={`radio-group${hasError ? ' multiple-choice-error' : ''}`}
          role="group"
          aria-describedby={hasError ? `${id}-err` : undefined}
        >
          {filterOpts(parseOptions(field.optionsJson, field.options)).map((opt, i) => {
            // value stored as JSON array string e.g. '["Red","Blue"]'
            let selected = [];
            if (value) {
              const str = String(value).trim();
              if (str.startsWith('[')) {
                try { selected = JSON.parse(str); } catch { selected = []; }
              } else {
                selected = str.split(',').map(v => v.trim()).filter(Boolean);
              }
            }
            const isChecked = selected.includes(opt.value);
            const handleCheckChange = (e) => {
              e.stopPropagation();
              // Always re-parse current value fresh to avoid stale closure
              let currentSelected = [];
              if (value) {
                const str = String(value).trim();
                if (str.startsWith('[')) {
                  try { currentSelected = JSON.parse(str); } catch { currentSelected = []; }
                } else {
                  currentSelected = str.split(',').map(v => v.trim()).filter(Boolean);
                }
              }
              const checked = e.target.checked;
              const next = checked
                ? [...currentSelected, opt.value]
                : currentSelected.filter(v => v !== opt.value);
              const unique = [...new Set(next)];
              // Store as JSON array string
              onChange(JSON.stringify(unique));
            };
            return (
              <label key={i} className="radio-option checkbox-style">
                <input
                  type="checkbox"
                  name={id}
                  value={opt.value}
                  checked={isChecked}
                  onChange={handleCheckChange}
                  disabled={disabled}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* ── multiple_choice_grid ────────────────────────────────── */}
      {field.fieldType === 'multiple_choice_grid' && (() => {
        // gridJson comes from /render endpoint: {"rows":[...],"columns":[...]}
        let rows = [], cols = [];
        if (field.gridJson) {
          try {
            const g = JSON.parse(field.gridJson);
            rows = g.rows    || [];
            cols = g.columns || [];
          } catch {}
        }
        // Current value is a JSON object {"Row":"Col"}
        let selected = {};
        if (value && typeof value === 'string') {
          try { selected = JSON.parse(value); } catch {}
        } else if (value && typeof value === 'object') {
          selected = value;
        }
        const handleGridChange = (row, col) => {
          if (disabled) return;
          const next = { ...selected, [row]: col };
          onChange(JSON.stringify(next));
          onBlur(JSON.stringify(next));
        };
        return (
          <div className={`mcg-wrapper${hasError ? ' input-error-group' : ''}`}>
            <table className="mcg-table">
              <thead>
                <tr className="mcg-header-row">
                  <th></th>
                  {cols.map((col, ci) => <th key={ci}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="mcg-row">
                    <td className="mcg-row-label">{row}</td>
                    {cols.map((col, ci) => (
                      <td key={ci} className="mcg-cell">
                        <label className={`mcg-radio-wrap${disabled ? ' disabled' : ''}`}>
                          <input
                            type="radio"
                            name={`${id}-row-${ri}`}
                            value={col}
                            checked={selected[row] === col}
                            onChange={() => handleGridChange(row, col)}
                            disabled={disabled}
                          />
                          <span className="mcg-radio-circle">
                            <span className="mcg-radio-dot" />
                          </span>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── linear_scale ───────────────────────────────────────── */}
      {field.fieldType === 'linear_scale' && (() => {
        // Parse ui_config_json for scale bounds and labels
        let uiCfg = {};
        if (field.uiConfigJson) {
          try { uiCfg = JSON.parse(field.uiConfigJson); } catch {}
        }
        const scaleMin   = uiCfg.scaleMin   ?? 1;
        const scaleMax   = uiCfg.scaleMax   ?? 5;
        const labelLeft  = uiCfg.labelLeft  || '';
        const labelRight = uiCfg.labelRight || '';
        const steps = [];
        for (let i = scaleMin; i <= scaleMax; i++) steps.push(i);
        const selected = value !== '' && value !== null && value !== undefined ? Number(value) : null;
        return (
          <div className={`linear-scale-wrapper${hasError ? ' input-error-group' : ''}`}>
            <div className="linear-scale-inner">
              <div className="linear-scale-track" role="group" aria-label={effectiveLabel}>
                {steps.map((step) => {
                  const isActive = selected === step;
                  return (
                    <button
                      key={step}
                      type="button"
                      className={`linear-scale-btn${isActive ? ' active' : ''}`}
                      onClick={() => { if (!disabled) { onChange(step); onBlur(step); } }}
                      disabled={disabled}
                      aria-pressed={isActive}
                      aria-label={`${step}`}
                    >
                      {step}
                    </button>
                  );
                })}
              </div>
              {(labelLeft || labelRight) && (
                <div className="linear-scale-labels">
                  <span className="linear-scale-label-left">{labelLeft}</span>
                  <span className="linear-scale-label-right">{labelRight}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── file ───────────────────────────────────────────────── */}
      {field.fieldType === 'file' && (
        <input
          id={id}
          type="file"
          className={inputClass}
          multiple={getMultiple(field.validationJson)}
          accept={getAllowedAccept(field.validationJson)}
          onChange={(e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            // Pass full FileList so multi-file validation works
            const payload = files.length === 1 ? files[0] : files;
            onChange(payload);
            onBlur(payload);
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

/**
 * Build the `accept` attribute from validationJson.
 * Uses allowedExtensions (e.g. ".pdf,.png") and/or mimeTypeValidation.
 * Returns empty string if no restriction (browser shows all files).
 */
function getAllowedAccept(validationJson) {
  try {
    const rules = JSON.parse(validationJson || '{}');
    const parts = [];
    if (rules.allowedExtensions) {
      rules.allowedExtensions.split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
        .forEach(ext => parts.push(ext.startsWith('.') ? ext : `.${ext}`));
    }
    if (rules.mimeTypeValidation) {
      rules.mimeTypeValidation.split(',')
        .map(m => m.trim())
        .filter(Boolean)
        .forEach(m => { if (!parts.includes(m)) parts.push(m); });
    }
    return parts.join(',');
  } catch { return ''; }
}

