import { useState, useRef, useEffect, useMemo } from 'react';
import ValidationEngine from '../services/validation';
import RuleEngine, { setDefaultValues } from '../services/RuleEngine';
import CalculationEngine from '../services/CalculationEngine';

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
const STATIC_FIELD_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

export default function FormRenderer({ form, isPreview = false, onSubmit }) {
  const rawFields = form?.fields || [];

  // Static elements — identified purely by fieldType (isStatic from backend was mis-serialized as "static")
  const staticFields = useMemo(
    () => rawFields.filter(f => STATIC_FIELD_TYPES.has(f.fieldType)),
    [rawFields]
  );

  // Dynamic fields only — everything that is NOT a known static type
  const dynamicRawFields = useMemo(
    () => rawFields.filter(f => !STATIC_FIELD_TYPES.has(f.fieldType)),
    [rawFields]
  );

  // Pre-parse rulesJson once — avoids repeated JSON.parse inside evaluation loops
  const fields = useMemo(() => {
    const withRules = RuleEngine.withParsedRules(dynamicRawFields);
    // Map g.id to fieldKey so RuleEngine can track it, and map groupOrder to fieldOrder for priority
    const groupsWithRules = RuleEngine.withParsedRules((form?.groups || []).map(g => ({
      ...g,
      fieldKey: g.id,
      fieldOrder: g.groupOrder ?? 0
    })));
    return [...withRules, ...groupsWithRules];
  }, [dynamicRawFields, form?.groups]);

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

  const [values, setValues] = useState(makeInitialValues);
  const [errors, setErrors] = useState({});  // { fieldKey: string[] }
  const [touched, setTouched] = useState({});  // { fieldKey: boolean }
  const [fieldStates, setFieldStates] = useState(() => RuleEngine.applyRules(fields, makeInitialValues()));
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Wizard (multi-step) state ──────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);

  /**
   * Split all renderable items (dynamic + static) sorted by fieldOrder into pages.
   * A page_break static element acts as the divider — it is consumed and NOT rendered.
   * pages = [ { items: [...], title: string|null }, ... ]
   *
   * Detection: item.fieldType === 'page_break' (works for both render-endpoint
   * responses where isStatic=true AND builder-preview where field comes through staticFields).
   */
  const pages = useMemo(() => {
    // Merge dynamic fields + ALL static fields (including page_break) + groups, sort by fieldOrder
    const allItems = [
      ...fields.map(f => ({ ...f, _renderType: 'dynamic' })),
      ...staticFields.map(f => ({ ...f, _renderType: 'static' })),
      ...(form?.groups || []).map(g => ({ ...g, _renderType: 'group', fieldOrder: g.groupOrder }))
    ].sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));

    const result = [];
    let currentPageItems = [];
    let currentPageTitle = null;

    for (const item of allItems) {
      // Detect page break by fieldType (primary) — works regardless of isStatic flag
      if (item.fieldType === 'page_break') {
        // Push everything collected so far as a completed page
        result.push({ items: currentPageItems, title: currentPageTitle });
        currentPageItems = [];
        // The page_break's data/staticData becomes the NEXT page's title
        currentPageTitle = item.staticData || item.data || item.label || null;
      } else {
        currentPageItems.push(item);
      }
    }
    // Always push the final (or only) page
    result.push({ items: currentPageItems, title: currentPageTitle });

    return result;
  }, [fields, staticFields]);

  const totalPages = pages.length;
  const isMultiStep = totalPages > 1;
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === totalPages - 1;

  // File objects stored in ref (avoids stale-closure issues in async handlers)
  const filesRef = useRef({});

  // Keep a ref to current values so async handlers always read the latest
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);

  // Re-initialise when fields change (async load or form switch)
  useEffect(() => {
    const initial = makeInitialValues();

    // 1. Initial Rules
    const initialStates = RuleEngine.applyRules(fields, initial);
    let currentValues = { ...initial };
    for (const [key, st] of Object.entries(initialStates)) {
      if (st.setValue !== null) currentValues[key] = st.setValue;
      if (st.copyValue !== null) currentValues[key] = st.copyValue;
    }

    // 2. Initial Calculations
    const calculated = CalculationEngine.recalculateCalculatedFields(fields, currentValues);

    // 3. Re-run rules if calculations changed values (cascade)
    const finalStates = RuleEngine.applyRules(fields, calculated);

    setDefaultValues(calculated); // snapshot for 'changed' operator (v2)
    setValues(calculated);
    valuesRef.current = calculated;
    filesRef.current = {};
    setErrors({});
    setTouched({});
    setFieldStates(finalStates);
    setCurrentPage(0); // reset wizard to first page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  // ── onChange — live validation + rule re-evaluation on every keystroke ─────
  function handleChange(field, value) {
    // 1. Update formValues state (stage 1)
    let currentValues = { ...valuesRef.current, [field.fieldKey]: value };

    // 2. Update file ref — store FileList or single File
    if (field.fieldType === 'file') {
      if (value instanceof FileList) {
        filesRef.current = { ...filesRef.current, [field.fieldKey]: value };
      } else if (value instanceof File) {
        filesRef.current = { ...filesRef.current, [field.fieldKey]: value };
      }
    }

    // 3. Run RuleEngine.applyRules() (Rules before Calc)
    let currentStates = RuleEngine.applyRules(fields, currentValues);

    // 4. Apply setValue/copyValue overrides from rules
    for (const [key, st] of Object.entries(currentStates)) {
      if (st.setValue !== null && String(currentValues[key] ?? '') !== String(st.setValue)) {
        currentValues[key] = st.setValue;
      }
      if (st.copyValue !== null && String(currentValues[key] ?? '') !== String(st.copyValue)) {
        currentValues[key] = st.copyValue;
      }
    }

    // 5. Run CalculationEngine.recalculate()
    const calculatedValues = CalculationEngine.recalculateCalculatedFields(fields, currentValues);

    // If calculations changed values, we might need a quick re-run of rules to update UI state (visible/required)
    // based on the new calculated values.
    if (JSON.stringify(calculatedValues) !== JSON.stringify(currentValues)) {
      currentStates = RuleEngine.applyRules(fields, calculatedValues);
      currentValues = calculatedValues;
    }

    // 6. Final State Updates
    setFieldStates(currentStates);
    setValues(currentValues);
    valuesRef.current = currentValues;

    // 7. Validate changed field using rule-adjusted required flag
    const effectiveField = {
      ...field,
      required: currentStates[field.fieldKey]?.required ?? field.required,
    };
    const errs = ValidationEngine.validateFieldSync(
      effectiveField, currentValues[field.fieldKey], currentValues, filesRef.current
    );
    setErrors((prev) => ({ ...prev, [field.fieldKey]: errs }));

    // 8. Mark field touched
    setTouched((prev) => ({ ...prev, [field.fieldKey]: true }));

    // 9. Clear server banner
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

  // ── Wizard Next — validate current page's visible dynamic fields then advance ─
  const handleNext = async () => {
    if (isPreview) { setCurrentPage(p => Math.min(p + 1, totalPages - 1)); return; }

    // Mark only current page's dynamic fields as touched
    const currentDynamic = (pages[currentPage]?.items || []).filter(f => f._renderType === 'dynamic');
    const pageTouched = Object.fromEntries(currentDynamic.map(f => [f.fieldKey, true]));
    setTouched(prev => ({ ...prev, ...pageTouched }));

    // Validate only visible fields on current page
    const visiblePageFields = currentDynamic
      .filter(f => {
        if (fieldStates[f.fieldKey]?.visible === false) return false;
        if (f.groupId && fieldStates[f.groupId]?.visible === false) return false;
        return true;
      })
      .map(f => {
        const fieldSt = fieldStates[f.fieldKey] || {};
        const groupSt = f.groupId ? fieldStates[f.groupId] : null;
        const effectiveRequired =
          groupSt?.required === true ? true :
            groupSt?.required === false ? false :
              (fieldSt.required ?? f.required);
        return { ...f, required: effectiveRequired };
      });

    const pageErrors = await ValidationEngine.validateForm(visiblePageFields, valuesRef.current, filesRef.current);
    setErrors(prev => ({ ...prev, ...pageErrors }));

    if (Object.keys(pageErrors).length > 0) {
      const firstKey = Object.keys(pageErrors)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
      return;
    }

    // Advance to next page and scroll to top of form
    setCurrentPage(p => Math.min(p + 1, totalPages - 1));
    setServerError('');
    const card = document.querySelector('.form-renderer-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBack = () => {
    setCurrentPage(p => Math.max(p - 1, 0));
    setServerError('');
    const card = document.querySelector('.form-renderer-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── onSubmit — full async validation, block if any errors ─────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) return;

    // Guard: never submit if there are more pages ahead (wizard safety net)
    if (isMultiStep && !isLastPage) {
      handleNext();
      return;
    }

    // Mark all fields as touched so all errors become visible
    const allTouched = Object.fromEntries(fields.map((f) => [f.fieldKey, true]));
    setTouched(allTouched);

    // Validate VISIBLE fields only — hidden fields skip validation.
    // Hidden field VALUES are preserved in state and sent to backend.
    // Backend validates all required constraints independently of rule state.
    const visibleFields = fields
      .filter(f => {
        if (fieldStates[f.fieldKey]?.visible === false) return false;
        if (f.groupId && fieldStates[f.groupId]?.visible === false) return false;
        return true;
      })
      .map(f => {
        const fieldSt = fieldStates[f.fieldKey] || {};
        const groupSt = f.groupId ? fieldStates[f.groupId] : null;
        const effectiveRequired =
          groupSt?.required === true ? true :
            groupSt?.required === false ? false :
              (fieldSt.required ?? f.required);
        return { ...f, required: effectiveRequired };
      });

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

      {/* ── Wizard Progress Bar (only when multi-step) ────────────────────── */}
      {isMultiStep && (
        <div className="wizard-progress-bar">
          <div className="wizard-steps-track">
            {pages.map((page, idx) => (
              <div key={idx} className="wizard-step-wrapper">
                <div className={`wizard-step-dot ${idx < currentPage ? 'completed' : ''} ${idx === currentPage ? 'active' : ''}`}>
                  {idx < currentPage ? <span>✓</span> : <span>{idx + 1}</span>}
                </div>
                {idx < totalPages - 1 && (
                  <div className={`wizard-step-connector ${idx < currentPage ? 'completed' : ''}`} />
                )}
              </div>
            ))}
          </div>
          <div className="wizard-page-label">
            {pages[currentPage]?.title
              ? <span className="wizard-page-title">Step {currentPage + 1}: {pages[currentPage].title}</span>
              : <span>Page {currentPage + 1} of {totalPages}</span>
            }
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {fields.length === 0 && staticFields.length === 0 ? (
          <div className="form-empty-state">This form has no fields yet.</div>
        ) : (
          <div className="form-renderer-body">
            {/* Render fields with group hierarchy support */}
            {(() => {
              const currentItems = pages[currentPage]?.items || [];
              const topLevelItems = currentItems.filter(f => !f.parentGroupKey && !f.groupId);
              const childrenByParent = {};

              currentItems.forEach(f => {
                const parentId = f.groupId || f.parentGroupKey;
                if (parentId) {
                  if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
                  childrenByParent[parentId].push(f);
                }
              });

              // Ensure children are sorted correctly within the group
              Object.values(childrenByParent).forEach(arr => arr.sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0)));

              const renderField = (field) => {
                // ── Group Container (New Architecture) ───────────────────
                if (field._renderType === 'group') {
                  const children = childrenByParent[field.id] || [];
                  const groupSt = fieldStates[field.id] || {};

                  // If the group itself is hidden by a rule, skip it and all children
                  if (groupSt.visible === false) return null;

                  return (
                    <div key={field.id} className="field-group-container">
                      <h3 className="field-group-title">{field.groupTitle || 'Untitled Section'}</h3>
                      {field.groupDescription && <p className="field-group-desc">{field.groupDescription}</p>}
                      <div className="field-group-children">
                        {children.map(renderField)}
                      </div>
                    </div>
                  );
                }

                // ── Static elements — display only ───────────────────────
                if (field._renderType === 'static') {
                  return (
                    <StaticElement
                      key={field.fieldKey || field.id || `static-${field.fieldOrder}`}
                      field={field}
                    />
                  );
                }

                // ── Dynamic fields ───────────────────────────────────────
                const st = fieldStates[field.fieldKey] || {};

                // Hidden fields — render nothing, value preserved in state
                if (st.visible === false) return null;

                // Also check if this field belongs to a group that is currently hidden
                if (field.groupId && fieldStates[field.groupId]?.visible === false) {
                  return null;
                }

                // ── Field Group Container (Legacy Support) ───────────────
                if (field.fieldType === 'field_group') {
                  const children = childrenByParent[field.fieldKey] || [];
                  return (
                    <div key={field.id || field.fieldKey} className="field-group-container">
                      {field.label && <h3 className="field-group-title">{st.label ?? field.label}</h3>}
                      <div className="field-group-children">
                        {children.map(renderField)}
                      </div>
                    </div>
                  );
                }

                // Effective value: copyValue > setValue > user input (priority order)
                const effectiveValue =
                  st.copyValue !== null && st.copyValue !== undefined
                    ? st.copyValue
                    : st.setValue !== null && st.setValue !== undefined
                      ? st.setValue
                      : values[field.fieldKey];

                const groupSt = field.groupId ? fieldStates[field.groupId] : null;
                const effectiveRequired =
                  groupSt?.required === true ? true :
                    groupSt?.required === false ? false :
                      (st.required ?? field.required);

                return (
                  <FieldInput
                    key={field.id || field.fieldKey}
                    field={{ ...field, required: effectiveRequired }}
                    value={effectiveValue}
                    errors={errors[field.fieldKey] || []}
                    touched={!!touched[field.fieldKey]}
                    onChange={(val) => handleChange(field, val)}
                    onBlur={(val) => handleBlur(field, val)}
                    disabled={
                      isPreview ||
                      !!st.disabled ||
                      !!field.disabled ||
                      !!field.readOnly ||
                      !!field.lockAfterCalculation ||
                      (field.groupId && fieldStates[field.groupId]?.disabled === true)
                    }
                    filterOptions={st.filterOptions ?? null}
                    min={st.min ?? null}
                    max={st.max ?? null}
                    labelOverride={st.label ?? null}
                    placeholderOverride={st.placeholder ?? null}
                  />
                );
              };

              return topLevelItems.map(renderField);
            })()}
          </div>
        )}

        {/* Hidden submit trigger — only used on last page */}
        <button type="submit" id="__form-submit-hidden__" style={{ display: 'none' }} aria-hidden="true" />
      </form>

      {/* ── Footer: Back / Next / Submit — OUTSIDE <form> to prevent accidental submission ── */}
      <div className={`form-renderer-footer${isMultiStep ? ' wizard-footer' : ''}`}>
        {isMultiStep && !isFirstPage && (
          <button
            type="button"
            className="btn btn-secondary wizard-back-btn"
            onClick={handleBack}
            disabled={submitting}
          >
            ← Back
          </button>
        )}

        {isMultiStep && !isLastPage ? (
          /* Next button — validates current page then advances */
          <button
            type="button"
            id="wizard-next-btn"
            className="form-submit-btn"
            onClick={handleNext}
            disabled={submitting}
            style={{ marginLeft: 'auto' }}
          >
            Next →
          </button>
        ) : (
          /* Submit button — triggers the hidden submit inside <form> */
          <button
            type="button"
            id="form-submit-btn"
            className="form-submit-btn"
            disabled={submitting || isPreview || fields.length === 0}
            style={isMultiStep ? { marginLeft: 'auto' } : undefined}
            onClick={() => {
              const hidden = document.getElementById('__form-submit-hidden__');
              if (hidden) hidden.click();
            }}
          >
            {submitting ? (
              <><span className="spinner" style={{ borderTopColor: '#fff', width: 18, height: 18 }} /> Submitting…</>
            ) : isPreview ? (
              '👁 Preview Mode — Submit Disabled'
            ) : (
              'Submit Form →'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── StaticElement ────────────────────────────────────────────────────────────
/**
 * Renders a static UI element — section_header, label_text, description_block.
 * Never collects input, never validated, never included in submission payload.
 */
function StaticElement({ field }) {
  // staticData from /render endpoint, or label as fallback (legacy)
  const content = field.staticData || field.label || field.data || '';

  if (field.fieldType === 'section_header') {
    return (
      <div className="static-section-header">
        <h3 className="static-section-header-text">{content}</h3>
        <div className="static-section-header-line" />
      </div>
    );
  }

  if (field.fieldType === 'label_text') {
    return (
      <div className="static-label-text">
        <p className="static-label-text-content">{content}</p>
      </div>
    );
  }

  if (field.fieldType === 'description_block') {
    return (
      <div className="static-description-block">
        <p className="static-description-block-content">{content}</p>
      </div>
    );
  }

  return null;
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
  const id = `field-${field.fieldKey}`;
  const errorList = Array.isArray(errors) ? errors : [];
  const shownError = touched && errorList.length > 0 ? errorList[0] : null;
  const hasError = !!shownError;
  const inputClass = `form-input${hasError ? ' input-error' : ''}`;

  // ── NEW (v2): resolve effective label and placeholder ──────────────────────
  const effectiveLabel = labelOverride ?? field.label;
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
          {field.isCalculated && <span className="badge badge-text" style={{ marginLeft: 8, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontSize: '0.7em', padding: '2px 6px' }}>∑ Calculated</span>}
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
          onBlur={(e) => onBlur(e.target.value)}
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
          onBlur={(e) => onBlur(e.target.value)}
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
        } catch { }

        return (
          <>
            <input
              id={id}
              type="date"
              className={inputClass}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={(e) => onBlur(e.target.value)}
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
          onBlur={(e) => onBlur(e.target.value)}
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
            rows = g.rows || [];
            cols = g.columns || [];
          } catch { }
        }
        // Current value is a JSON object {"Row":"Col"}
        let selected = {};
        if (value && typeof value === 'string') {
          try { selected = JSON.parse(value); } catch { }
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
          try { uiCfg = JSON.parse(field.uiConfigJson); } catch { }
        }
        const scaleMin = uiCfg.scaleMin ?? 1;
        const scaleMax = uiCfg.scaleMax ?? 5;
        const labelLeft = uiCfg.labelLeft || '';
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

      {/* ── star_rating ────────────────────────────────────────── */}
      {field.fieldType === 'star_rating' && (() => {
        // Parse ui_config_json for scale bounds and labels
        let uiCfg = {};
        if (field.uiConfigJson) {
          try { uiCfg = JSON.parse(field.uiConfigJson); } catch { }
        }
        const scaleMin = uiCfg.scaleMin ?? 1;
        const scaleMax = uiCfg.scaleMax ?? 5;
        const labelLeft = uiCfg.labelLeft || '';
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
                      className={`linear-scale-btn star-rating-btn${isActive ? ' active' : ''}`}
                      onClick={() => { if (!disabled) { onChange(step); onBlur(step); } }}
                      disabled={disabled}
                      aria-pressed={isActive}
                      aria-label={`${step}`}
                    >
                      {isActive ? '★' : '☆'}
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

      {/* ── checkbox_grid ──────────────────────────────────────── */}
      {field.fieldType === 'checkbox_grid' && (() => {
        // gridJson comes from /render endpoint: {"rows":[...],"columns":[...]}
        let rows = [], cols = [];
        if (field.gridJson) {
          try {
            const g = JSON.parse(field.gridJson);
            rows = g.rows || [];
            cols = g.columns || [];
          } catch { }
        }
        // Current value: {"Row":["ColA","ColB"]} — arrays per row (multi-select)
        let selected = {};
        if (value && typeof value === 'string') {
          try { selected = JSON.parse(value); } catch { }
        } else if (value && typeof value === 'object') {
          selected = value;
        }
        const handleCbChange = (row, col, checked) => {
          if (disabled) return;
          const cur = Array.isArray(selected[row]) ? selected[row] : (selected[row] ? [selected[row]] : []);
          const next = checked ? [...new Set([...cur, col])] : cur.filter(v => v !== col);
          const updated = { ...selected, [row]: next };
          onChange(JSON.stringify(updated));
          onBlur(JSON.stringify(updated));
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
                {rows.map((row, ri) => {
                  const rowSel = Array.isArray(selected[row]) ? selected[row] : (selected[row] ? [selected[row]] : []);
                  return (
                    <tr key={ri} className="mcg-row">
                      <td className="mcg-row-label">{row}</td>
                      {cols.map((col, ci) => (
                        <td key={ci} className="mcg-cell">
                          <label className={`mcg-checkbox-wrap${disabled ? ' disabled' : ''}`}>
                            <input
                              type="checkbox"
                              value={col}
                              checked={rowSel.includes(col)}
                              onChange={(e) => handleCbChange(row, col, e.target.checked)}
                              disabled={disabled}
                            />
                            <span className="mcg-checkbox-box">
                              <span className="mcg-checkbox-tick">✓</span>
                            </span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

