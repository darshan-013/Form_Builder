import { useState, useRef, useEffect, useMemo } from 'react';
import ValidationEngine from '../services/validation';
import RuleEngine, { setDefaultValues } from '../services/RuleEngine';
import CalculationEngine from '../services/CalculationEngine';
import { getDraft, saveDraft } from '../services/api';
import { toastInfo, showWarning } from '../services/toast';
import { translateApiError } from '../services/errorTranslator';

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
  const [lastSaved, setLastSaved] = useState(null); // timestamp of last autosave
  const [saving, setSaving] = useState(false);

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
    // Use dynamicRawFields instead of fields to prevent mapping the groups inside fields array
    const allItems = [
      ...dynamicRawFields.map(f => ({ ...f, _renderType: 'dynamic' })),
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
    let calculated = currentValues;
    try {
      calculated = CalculationEngine.recalculateCalculatedFields(fields, currentValues);
    } catch (err) {
      console.warn('[FormRenderer] Initial calculation error:', err.message);
    }

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

  // ── Draft Retrieval ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isPreview || !form?.id) return;

    async function fetchDraft() {
      try {
        const draft = await getDraft(form.id);
        if (draft && Object.keys(draft).length > 0) {
          // Merge draft values with initial values (in case form schema changed)
          const draftValues = { ...valuesRef.current };
          for (const field of fields) {
            if (draft[field.fieldKey] !== undefined && draft[field.fieldKey] !== null) {
              draftValues[field.fieldKey] = draft[field.fieldKey];
            }
          }

          // Re-apply rules and calculations based on draft data
          const states = RuleEngine.applyRules(fields, draftValues);
          let calculated = draftValues;
          try {
            calculated = CalculationEngine.recalculateCalculatedFields(fields, draftValues);
          } catch (err) {
            console.warn('[FormRenderer] Draft calculation error:', err.message);
          }
          const finalStates = RuleEngine.applyRules(fields, calculated);

          setValues(calculated);
          valuesRef.current = calculated;
          setFieldStates(finalStates);
          setLastSaved(new Date(draft.updated_at || Date.now()));
          
          // Ensure flag is set if we successfully loaded a draft
          localStorage.setItem(`draft_form_${form.id}`, 'true');
        } else {
          // No draft returned from backend. Check if we EXPECTED one (F2 requirement)
          const hadDraft = localStorage.getItem(`draft_form_${form.id}`);
          if (hadDraft) {
            showWarning('Your previous draft was discarded because the form was updated to a new version. Please review the fields.');
            localStorage.removeItem(`draft_form_${form.id}`);
          }
        }
      } catch (err) {
        if (err?.status === 404) {
           const hadDraft = localStorage.getItem(`draft_form_${form.id}`);
           if (hadDraft) {
             showWarning('Your previous draft was discarded because the form was updated to a new version.');
             localStorage.removeItem(`draft_form_${form.id}`);
           }
        }
        console.warn('Failed to fetch draft:', err);
      }
    }
    fetchDraft();
  }, [form?.id, isPreview, form?.formVersionId]);

  // ── Autosave Logic ───────────────────────────────────────────────────────
  const lastSavedValuesRef = useRef(values);

  useEffect(() => {
    if (isPreview || submitted || !form?.id) return;

    const timer = setInterval(async () => {
      const currentValues = valuesRef.current;
      // Only save if data has actually changed
      if (JSON.stringify(currentValues) === JSON.stringify(lastSavedValuesRef.current)) {
        return;
      }

      setSaving(true);
      try {
        // [F3] Compliance: formVersionId from React state (form object) only
        await saveDraft(form.id, currentValues, null, form.formVersionId);
        setLastSaved(new Date());
        lastSavedValuesRef.current = currentValues;
        // Signal that a draft now exists for this form
        localStorage.setItem(`draft_form_${form.id}`, 'true');
      } catch (err) {
        console.warn('Autosave failed:', err);
      } finally {
        setSaving(false);
      }
    }, 10000); // 10 seconds

    return () => clearInterval(timer);
  }, [form?.id, isPreview, submitted]);

  // Handle manual save on page navigate away
  useEffect(() => {
    if (isPreview || submitted || !form?.id) return;

    const handleBeforeUnload = () => {
      const currentValues = valuesRef.current;
      if (JSON.stringify(currentValues) !== JSON.stringify(lastSavedValuesRef.current)) {
        // [F3] Compliance: formVersionId from React state only
        saveDraft(form.id, currentValues, null, form.formVersionId).catch(() => { });
        localStorage.setItem(`draft_form_${form.id}`, 'true');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form?.id, isPreview, submitted]);

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
    let calculatedValues = currentValues;
    try {
      calculatedValues = CalculationEngine.recalculateCalculatedFields(fields, currentValues);
    } catch (err) {
      // Logic: if a formula results in division by zero (e.g. while typing), just keep the current values.
      console.warn('[FormRenderer] Calculation error:', err.message);
    }

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
    if (isPreview) {
      toastInfo("👁 Preview Mode: Form validation passed! Actual submission is disabled in preview mode.");
      return;
    }

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
      localStorage.removeItem(`draft_form_${form.id}`); // Requirement [E9]
    } catch (err) {
      if (err?.errors && Array.isArray(err.errors)) {
        const fieldErrs = {};
        const unmatched = [];

        for (const error of err.errors) {
          // Backend sends { field: fieldKey, message: string }
          if (error && typeof error === 'object' && error.field && error.message) {
            const key = error.field;
            if (key === '__general__' || key === 'form' || key === 'general') {
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
        if (unmatched.length) {
          setServerError(unmatched.join(' · '));
        } else if (Object.keys(fieldErrs).length) {
          // If we have field errors but no unmatched, still show a friendly top-level reminder
          const count = Object.keys(fieldErrs).length;
          setServerError(`Please fix the ${count} field${count > 1 ? 's' : ''} highlighted below.`);
        }
      } else {
        setServerError(translateApiError(err));
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
          {lastSaved && (
            <span className="form-renderer-meta-item draft-indicator">
              {saving ? (
                <><span className="spinner-micro" /> Saving draft…</>
              ) : (
                <>✔ Draft saved at {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
              )}
            </span>
          )}
        </div>
      </div>

      {serverError && (
        <div className={`auth-error ${serverError.includes('fixed') || serverError.includes('highlighted') ? 'validation-summary-banner' : ''}`} 
             style={{ margin: '0 32px 24px', borderRadius: 12, padding: '16px 20px', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '4px', color: '#ff8e8e', fontSize: '15px' }}>
                Form Validation Failed
              </strong>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>{serverError}</div>
            </div>
          </div>
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

              const renderField = (field, index = 0) => {
                // ── Group Container (New Architecture) ───────────────────
                if (field._renderType === 'group') {
                  const children = childrenByParent[field.id] || [];
                  const groupSt = fieldStates[field.id] || {};

                  // If the group itself is hidden by a rule, skip it and all children
                  if (groupSt.visible === false) return null;

                  return (
                    <div key={field.id} className="field-group-container" style={{ position: 'relative', zIndex: 100 - index }}>
                      <h3 className="field-group-title">{field.groupTitle || 'Untitled Section'}</h3>
                      {field.groupDescription && <p className="field-group-desc">{field.groupDescription}</p>}
                      <div className="field-group-children">
                        {children.map((f, i) => renderField(f, i))}
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
                    <div key={field.id || field.fieldKey} className="field-group-container" style={{ position: 'relative', zIndex: 100 - index }}>
                      {field.label && <h3 className="field-group-title">{st.label ?? field.label}</h3>}
                      <div className="field-group-children">
                        {children.map((f, i) => renderField(f, i))} // Recursive mapping with descending zIndexes
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
                  <div key={field.id || field.fieldKey} style={{ position: 'relative', zIndex: 100 - index }}>
                    <FieldInput
                      field={{ ...field, required: effectiveRequired }}
                      value={effectiveValue}
                      errors={errors[field.fieldKey] || []}
                      touched={!!touched[field.fieldKey]}
                      onChange={(val) => handleChange(field, val)}
                      onBlur={(val) => handleBlur(field, val)}
                      disabled={
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
                  </div>
                );
              };

              return topLevelItems.map((f, i) => renderField(f, i));
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
            disabled={submitting || fields.length === 0}
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
    <div className="form-field-group" style={{
      animationDelay: `${(field.fieldOrder || 0) * 40}ms`,
      position: 'relative',
      zIndex: 100 - (field.fieldOrder || 0)
    }}>

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

      {/* ── time ───────────────────────────────────────────────── */}
      {field.fieldType === 'time' && (
        <input
          id={id}
          type="time"
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
      )}

      {/* ── date_time ──────────────────────────────────────────── */}
      {field.fieldType === 'date_time' && (
        <input
          id={id}
          type="datetime-local"
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
            {effectiveLabel}
            {field.required && <span className="form-field-required-star"> *</span>}
          </span>
        </label>
      )}

      {/* ── dropdown (single or multi) ─────────────────────────── */}
      {field.fieldType === 'dropdown' && (() => {
        let isMulti = false;
        try {
          const uiCfg = JSON.parse(field.uiConfigJson || '{}');
          isMulti = !!uiCfg.multiple;
        } catch { }

        const options = filterOpts(parseOptions(field.optionsJson, field.options));

        if (!isMulti) {
          return (
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
              {options.map((opt, i) => (
                <option key={i} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          );
        }

        // ── Custom Multi-Select Dropdown ──
        // Parse current value string array
        let selected = [];
        if (value) {
          const str = String(value).trim();
          if (str.startsWith('[')) {
            try { selected = JSON.parse(str); } catch { selected = []; }
          } else {
            selected = str.split(',').map(v => v.trim()).filter(Boolean);
          }
        }

        const [isOpen, setIsOpen] = useState(false);
        const dropdownRef = useRef(null);

        // Handle outside click
        useEffect(() => {
          const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
              setIsOpen(false);
              onBlur(value);
            }
          };
          if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
          } else {
            document.removeEventListener("mousedown", handleClickOutside);
          }
          return () => document.removeEventListener("mousedown", handleClickOutside);
        }, [isOpen, onBlur, value]);

        const handleRemove = (e, valToRemove) => {
          e.stopPropagation();
          if (disabled) return;
          const nextSelected = selected.filter(v => v !== valToRemove);
          onChange(nextSelected); // Pass the array directly, not stringified
        };

        const handleSelect = (valToAdd) => {
          if (disabled) return;
          let nextSelected;
          if (selected.includes(valToAdd)) {
            nextSelected = selected.filter(v => v !== valToAdd);
          } else {
            nextSelected = [...selected, valToAdd];
          }
          onChange(nextSelected); // Pass the array directly
          // keep open to allow multiple selections
        };

        return (
          <div ref={dropdownRef} style={{ position: 'relative', zIndex: isOpen ? 99 : 1 }}>
            <div
              className={`form-select${hasError ? ' input-error' : ''}`}
              style={{
                display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '44px', paddingBottom: '7px', paddingTop: '7px',
                alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1
              }}
              onClick={() => !disabled && setIsOpen(!isOpen)}
            >
              {selected.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>— Select {effectiveLabel} —</span>
              ) : (
                selected.map((val) => {
                  const optLabel = options.find(o => o.value === val)?.label || val;
                  return (
                    <span key={val} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '13px',
                      background: 'rgba(99,102,241,0.15)', color: '#EDE9FF', border: '1px solid rgba(99,102,241,0.3)',
                    }}>
                      {optLabel}
                      <button
                        type="button"
                        onClick={(e) => handleRemove(e, val)}
                        style={{
                          background: 'none', border: 'none', color: '#9899BA', cursor: 'pointer', fontSize: '12px',
                          padding: 0, marginLeft: '2px', lineHeight: 1
                        }}
                      >✕</button>
                    </span>
                  );
                })
              )}
            </div>

            {isOpen && !disabled && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                marginTop: '6px', padding: '6px', background: '#13112b',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.55)', maxHeight: '250px', overflowY: 'auto', listStyle: 'none'
              }}>
                {options.length === 0 ? (
                  <li style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}>No options</li>
                ) : (
                  options.map((opt, i) => {
                    const isSelected = selected.includes(opt.value);
                    return (
                      <li
                        key={i}
                        onClick={() => handleSelect(opt.value)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontFamily: "'Inter', sans-serif",
                          display: 'flex', alignItems: 'center', gap: '10px',
                          background: isSelected ? '#2a2060' : 'transparent',
                          color: isSelected ? '#ffffff' : '#EDE9FF',
                        }}
                        onMouseOver={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        }}
                        onMouseOut={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{ accentColor: 'var(--accent)', width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer' }}
                        />
                        {opt.label}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        );
      })()}

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

