import { useState, useRef, useEffect, useMemo } from 'react';
import ValidationEngine from '../services/validation';
import RuleEngine, { setDefaultValues } from '../services/RuleEngine';
import CalculationEngine from '../services/CalculationEngine';
import { getDraft, saveDraft } from '../services/api';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Spinner from './ui/Spinner';

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
          const calculated = CalculationEngine.recalculateCalculatedFields(fields, draftValues);
          const finalStates = RuleEngine.applyRules(fields, calculated);

          setValues(calculated);
          valuesRef.current = calculated;
          setFieldStates(finalStates);
          setLastSaved(new Date(draft.updated_at || Date.now()));
        }
      } catch (err) {
        console.warn('Failed to fetch draft:', err);
      }
    }
    fetchDraft();
  }, [form?.id, isPreview]);

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
        await saveDraft(form.id, currentValues);
        setLastSaved(new Date());
        lastSavedValuesRef.current = currentValues;
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
        // Use sendBeacon for more reliable fire-and-forget save on exit if possible,
        // but since saveDraft is a regular fetch, we just try our best.
        saveDraft(form.id, currentValues).catch(() => {});
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
      <Card className="max-w-2xl mx-auto overflow-hidden">
        <div className="flex flex-col items-center justify-center text-center py-16 px-8">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8 ring-4 ring-emerald-500/10 animate-pulse">
            <span className="text-4xl text-emerald-500">✓</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Submission Complete</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-10 max-w-sm">
            Thank you! Your response has been securely recorded and processed.
          </p>
          <Button
            variant="outline"
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
            Submit Another Response
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border-none shadow-2xl">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />
      
      {isPreview && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 text-xs font-bold text-amber-500 uppercase tracking-widest justify-center">
          <span className="animate-pulse">●</span> Preview Mode — Submissions Disabled
        </div>
      )}

      <div className="p-8 md:p-12">
        <div className="mb-12">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
              {form.name}
            </h1>
            {lastSaved && (
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {saving ? (
                  <><Spinner size="xs" /> Saving...</>
                ) : (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Saved
                  </span>
                )}
              </div>
            )}
          </div>
          
          {form.description && (
            <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-3xl">
              {form.description}
            </p>
          )}

          <div className="flex flex-wrap gap-4 mt-8 pt-8 border-t border-gray-100 dark:border-white/5">
            <Badge variant="ghost">
              <span className="mr-1 opacity-60">FIELDS:</span> {fields.length}
            </Badge>
            {fields.some((f) => f.required) && (
              <Badge variant="ghost" className="text-rose-500">
                <span className="mr-1 opacity-60">*</span> REQUIRED FIELDS
              </Badge>
            )}
          </div>
        </div>

        {serverError && (
          <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium flex items-center gap-3">
            <span className="text-lg">⚠️</span> {serverError}
          </div>
        )}

        {/* ── Wizard Progress Bar ── */}
        {isMultiStep && (
          <div className="mb-12 px-4">
            <div className="flex items-center justify-between mb-8">
              {pages.map((page, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center gap-3 relative z-10">
                    <div className={`
                      w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-500
                      ${idx < currentPage ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 
                        (idx === currentPage ? 'bg-primary text-white shadow-[0_0_15px_var(--primary-glow)] scale-110' : 'bg-gray-100 dark:bg-white/5 text-gray-400')}
                    `}>
                      {idx < currentPage ? '✓' : idx + 1}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${idx === currentPage ? 'text-primary' : 'text-gray-400'}`}>
                      {page.title || `Part ${idx + 1}`}
                    </span>
                  </div>
                  {idx < totalPages - 1 && (
                    <div className="flex-1 h-[2px] mx-[-10px] mb-7 bg-gray-100 dark:bg-white/5 relative overflow-hidden">
                      <div className={`
                        absolute inset-0 bg-primary transition-all duration-700 ease-in-out
                        ${idx < currentPage ? 'w-full' : 'w-0'}
                      `} />
                    </div>
                  )}
                </React.Fragment>
              ))}
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

        <div className="mt-12 pt-8 border-t border-gray-100 dark:border-white/5 flex items-center justify-between gap-4">
          {isMultiStep && !isFirstPage && (
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={submitting}
            >
              ← Back
            </Button>
          )}

          <div className="ml-auto flex items-center gap-4">
            {isMultiStep && !isLastPage ? (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={submitting}
              >
                Next Step →
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                disabled={submitting || isPreview || fields.length === 0}
                onClick={() => {
                  const hidden = document.getElementById('__form-submit-hidden__');
                  if (hidden) hidden.click();
                }}
              >
                {submitting ? (
                  <><Spinner size="sm" className="mr-2" light /> Submitting...</>
                ) : isPreview ? (
                  'Preview Mode Enabled'
                ) : (
                  'Submit Form'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── StaticElement ────────────────────────────────────────────────────────────
/**
 * Renders a static UI element — section_header, label_text, description_block.
 * Never collects input, never validated, never included in submission payload.
 */
function StaticElement({ field }) {
  const content = field.staticData || field.label || field.data || '';

  if (field.fieldType === 'section_header') {
    return (
      <div className="mt-12 mb-6">
        <div className="flex items-center gap-4 mb-2">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">{content}</h3>
          <div className="h-[1px] flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
        </div>
      </div>
    );
  }

  if (field.fieldType === 'label_text') {
    return (
      <div className="mb-4">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-widest opacity-70">{content}</p>
      </div>
    );
  }

  if (field.fieldType === 'description_block') {
    return (
      <div className="mb-6 p-4 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5">
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed italic">{content}</p>
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
    <div className="group mb-8 transition-all duration-300" style={{
      animationDelay: `${(field.fieldOrder || 0) * 40}ms`,
    }}>
      {/* Label */}
      {field.fieldType !== 'boolean' && (
        <label className="flex items-center gap-2 mb-3 px-1 transition-colors group-focus-within:text-primary" htmlFor={id}>
          <span className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">
            {effectiveLabel}
          </span>
          {field.required && (
            <span className="text-rose-500 text-sm font-black animate-pulse" title="Required">
              *
            </span>
          )}
          {field.isCalculated && (
            <Badge variant="primary" size="xs" className="text-[9px] px-1 py-0 opacity-80">
              ∑ CALC
            </Badge>
          )}
        </label>
      )}

      {/* ── text ───────────────────────────────────────────────── */}
      {field.fieldType === 'text' && (
        <input
          id={id}
          type="text"
          className={`
            w-full px-5 py-3.5 rounded-2xl border transition-all duration-300 outline-none
            bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5
            text-gray-900 dark:text-white placeholder-gray-400
            focus:border-primary/50 focus:bg-white dark:focus:bg-primary/[0.02] focus:shadow-[0_0_20px_var(--primary-glow-subtle)]
            ${hasError ? 'border-rose-500/50 bg-rose-500/[0.02] shadow-[0_0_15px_rgba(244,63,94,0.1)]' : ''}
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
          `}
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
          className={`
            w-full px-5 py-3.5 rounded-2xl border transition-all duration-300 outline-none
            bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5
            text-gray-900 dark:text-white placeholder-gray-400
            focus:border-primary/50 focus:bg-white dark:focus:bg-primary/[0.02] focus:shadow-[0_0_20px_var(--primary-glow-subtle)]
            ${hasError ? 'border-rose-500/50 bg-rose-500/[0.02] shadow-[0_0_15px_rgba(244,63,94,0.1)]' : ''}
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
          `}
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
              className={`
                w-full px-5 py-3.5 rounded-2xl border transition-all duration-300 outline-none
                bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5
                text-gray-900 dark:text-white
                focus:border-primary/50 focus:bg-white dark:focus:bg-primary/[0.02] focus:shadow-[0_0_20px_var(--primary-glow-subtle)]
                ${hasError ? 'border-rose-500/50 bg-rose-500/[0.02] shadow-[0_0_15px_rgba(244,63,94,0.1)]' : ''}
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
              `}
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
          className={`flex items-center gap-4 cursor-pointer group/bool ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          htmlFor={id}
        >
          <div className="relative inline-flex items-center cursor-pointer">
            <input
              id={id}
              type="checkbox"
              className="sr-only peer"
              checked={!!value}
              onChange={(e) => { onChange(e.target.checked); onBlur(e.target.checked); }}
              disabled={disabled}
            />
            <div className={`
              w-12 h-6 bg-gray-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer 
              peer-checked:after:translate-x-full peer-checked:after:border-white 
              after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
              after:bg-white after:border-gray-300 after:border after:rounded-full 
              after:h-5 after:w-5 after:transition-all dark:border-gray-600 
              peer-checked:bg-primary peer-checked:shadow-[0_0_10px_var(--primary-glow)]
            `} />
          </div>
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover/bool:text-gray-900 dark:group-hover/bool:text-white transition-colors">
            {effectiveLabel}
            {field.required && <span className="text-rose-500 ml-1 font-black">*</span>}
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
              className={`
                w-full px-5 py-3.5 rounded-2xl border transition-all duration-300 outline-none appearance-none
                bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5
                text-gray-900 dark:text-white
                focus:border-primary/50 focus:bg-white dark:focus:bg-primary/[0.02] focus:shadow-[0_0_20px_var(--primary-glow-subtle)]
                ${hasError ? 'border-rose-500/50 bg-rose-500/[0.02] shadow-[0_0_15px_rgba(244,63,94,0.1)]' : ''}
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
              `}
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
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
          role="radiogroup"
          aria-describedby={hasError ? `${id}-err` : undefined}
        >
          {filterOpts(parseOptions(field.optionsJson, field.options)).map((opt, i) => {
            const isChecked = value === opt.value;
            return (
              <label key={i} className={`
                flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-300
                ${isChecked ? 'bg-primary/5 border-primary shadow-[0_0_15px_var(--primary-glow-subtle)]' : 'bg-gray-50 dark:bg-white/[0.02] border-gray-100 dark:border-white/5 hover:border-primary/30'}
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
              `}>
                <div className="relative flex items-center justify-center">
                  <input
                    type="radio"
                    name={id}
                    className="sr-only peer"
                    value={opt.value}
                    checked={isChecked}
                    onChange={(e) => { onChange(e.target.value); onBlur(e.target.value); }}
                    disabled={disabled}
                  />
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-white/20 peer-checked:border-primary peer-checked:bg-primary transition-all after:content-[''] after:absolute after:w-2 after:h-2 after:bg-white after:rounded-full after:opacity-0 peer-checked:after:opacity-100" />
                </div>
                <span className={`text-sm font-medium ${isChecked ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* ── multiple_choice (multi-select checkboxes) ─────────── */}
      {field.fieldType === 'multiple_choice' && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
          role="group"
          aria-describedby={hasError ? `${id}-err` : undefined}
        >
          {filterOpts(parseOptions(field.optionsJson, field.options)).map((opt, i) => {
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
              onChange(JSON.stringify(unique));
            };
            return (
              <label key={i} className={`
                flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-300
                ${isChecked ? 'bg-primary/5 border-primary shadow-[0_0_15px_var(--primary-glow-subtle)]' : 'bg-gray-50 dark:bg-white/[0.02] border-gray-100 dark:border-white/5 hover:border-primary/30'}
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
              `}>
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    value={opt.value}
                    checked={isChecked}
                    onChange={handleCheckChange}
                    disabled={disabled}
                  />
                  <div className="w-5 h-5 rounded-lg border-2 border-gray-300 dark:border-white/20 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center after:content-['✓'] after:text-white after:text-[10px] after:font-bold after:opacity-0 peer-checked:after:opacity-100" />
                </div>
                <span className={`text-sm font-medium ${isChecked ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>
                  {opt.label}
                </span>
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
          <div className={`overflow-hidden rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01] ${hasError ? 'ring-1 ring-rose-500/50' : ''}`}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100/50 dark:bg-white/[0.03]">
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Row</th>
                  {cols.map((col, ci) => <th key={ci} className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-gray-500">{col}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-primary/[0.02] transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-300">{row}</td>
                    {cols.map((col, ci) => (
                      <td key={ci} className="px-6 py-4 text-center">
                        <label className={`inline-flex items-center justify-center cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                          <input
                            type="radio"
                            className="sr-only peer"
                            name={`${id}-row-${ri}`}
                            value={col}
                            checked={selected[row] === col}
                            onChange={() => handleGridChange(row, col)}
                            disabled={disabled}
                          />
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-white/20 peer-checked:border-primary peer-checked:bg-primary transition-all after:content-[''] after:absolute after:w-2 after:h-2 after:bg-white after:rounded-full after:opacity-0 peer-checked:after:opacity-100 scale-125" />
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
          <div className={`p-6 rounded-3xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 ${hasError ? 'ring-1 ring-rose-500/50' : ''}`}>
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-center gap-2" role="group" aria-label={effectiveLabel}>
                {steps.map((step) => {
                  const isActive = selected === step;
                  return (
                    <button
                      key={step}
                      type="button"
                      className={`
                        w-12 h-12 rounded-xl border font-bold text-sm transition-all duration-300
                        ${isActive ? 'bg-primary border-primary text-white shadow-[0_0_15px_var(--primary-glow)] scale-110' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 hover:border-primary/50 hover:text-primary'}
                        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
                      `}
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
                <div className="flex justify-between px-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{labelLeft}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{labelRight}</span>
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
          <div className={`p-6 rounded-3xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 ${hasError ? 'ring-1 ring-rose-500/50' : ''}`}>
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-center gap-1" role="group" aria-label={effectiveLabel}>
                {steps.map((step) => {
                  const isActive = selected >= step;
                  const isCurrent = selected === step;
                  return (
                    <button
                      key={step}
                      type="button"
                      className={`
                        text-3xl transition-all duration-300 hover:scale-125
                        ${isActive ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-gray-300 dark:text-white/10'}
                        ${isCurrent ? 'scale-125' : ''}
                        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                      onClick={() => { if (!disabled) { onChange(step); onBlur(step); } }}
                      disabled={disabled}
                      aria-pressed={isCurrent}
                      aria-label={`${step} stars`}
                    >
                      ★
                    </button>
                  );
                })}
              </div>
              {(labelLeft || labelRight) && (
                <div className="flex justify-between px-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{labelLeft}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{labelRight}</span>
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
        <div className={`
          relative border-2 border-dashed rounded-3xl p-8 transition-all duration-300 text-center
          ${disabled ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-white/5' : 'hover:border-primary/50 hover:bg-primary/[0.01] cursor-pointer'}
          ${hasError ? 'border-rose-500/50 bg-rose-500/[0.01]' : 'border-gray-200 dark:border-white/10'}
        `}>
          <input
            id={id}
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            multiple={getMultiple(field.validationJson)}
            accept={getAllowedAccept(field.validationJson)}
            onChange={(e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              const payload = files.length === 1 ? files[0] : files;
              onChange(payload);
              onBlur(payload);
            }}
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-xl">
              📂
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {value ? (Array.isArray(value) || value instanceof FileList ? `${value.length} files selected` : value.name) : 'Drop files here or click to upload'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {getAllowedAccept(field.validationJson) || 'All file types supported'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Error (shows after first interaction, highest-priority only) ── */}
      {hasError && (
        <span id={`${id}-err`} className="flex items-center gap-2 mt-3 px-1 text-xs font-bold text-rose-500 animate-in slide-in-from-top-1 duration-300" role="alert" aria-live="polite">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
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

