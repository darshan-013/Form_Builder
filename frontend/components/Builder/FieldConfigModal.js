import { useState, useEffect } from 'react';
import { getForms, getForm, createSharedOptions, updateSharedOptions, getSharedOptions } from '../../services/api';
import { toastError } from '../../services/toast';
import RuleBuilder from './RuleBuilder';
import CalculationEngine from '../../services/CalculationEngine';


/**
 * FieldConfigModal — Slide-up modal to edit all field properties.
 * Options for dropdown/radio are loaded from the shared_options table via sharedOptionsId.
 * "Use Existing Dropdown" lets admin link to another field's shared_options row.
 * siblingFields: all OTHER fields on the form — used by RuleBuilder as condition sources.
 */
export default function FieldConfigModal({ field, onSave, onClose, siblingFields = [] }) {
    const [local, setLocal] = useState({ ...field });
    const [options, setOptions] = useState(['Option 1', 'Option 2']);

    const [validationRules, setValidationRules] = useState(() => {
        if (field.validationJson) {
            try { return JSON.parse(field.validationJson); } catch { return {}; }
        }
        return {};
    });

    // ui_config_json state — used for linear_scale min/max/labels
    const [uiConfig, setUiConfig] = useState(() => {
        if (field.uiConfigJson) {
            try { return JSON.parse(field.uiConfigJson); } catch { return {}; }
        }
        return {};
    });
    const setUiCfg = (key, value) => setUiConfig(prev => {
        const updated = { ...prev };
        if (value === '' || value === null || value === undefined) delete updated[key];
        else updated[key] = value;
        return updated;
    });

    // Grid state — for multiple_choice_grid
    // gridConfig is stored in shared_options as {"rows":[...],"columns":[...]}
    const [gridRows, setGridRows] = useState(() => {
        if (field.gridJson) {
            try { const p = JSON.parse(field.gridJson); return p.rows || ['Row 1', 'Row 2']; } catch { }
        }
        return ['Row 1', 'Row 2'];
    });
    const [gridColumns, setGridColumns] = useState(() => {
        if (field.gridJson) {
            try { const p = JSON.parse(field.gridJson); return p.columns || ['Option 1', 'Option 2', 'Option 3']; } catch { }
        }
        return ['Option 1', 'Option 2', 'Option 3'];
    });

    const [validationExpanded, setValidationExpanded] = useState(false);
    const [rulesExpanded, setRulesExpanded] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [sharedOptionsId, setSharedOptionsId] = useState(field.sharedOptionsId || null);
    const [unlinkNotice, setUnlinkNotice] = useState(false);
    const [showAllFields, setShowAllFields] = useState(false);

    /**
     * Sibling fields enriched with resolved options[] arrays.
     * RuleBuilder's ValueInput needs options:[{label,value}] on dropdown/radio fields
     * so the "— select —" dropdown is populated. We fetch from shared_options API
     * for every sibling that is a dropdown/radio with a sharedOptionsId.
     */
    const [enrichedSiblings, setEnrichedSiblings] = useState([]);

    useEffect(() => {
        let cancelled = false;

        async function enrichSiblings() {
            const result = await Promise.all(
                siblingFields.map(async (f) => {
                    const isChoice = f.fieldType === 'dropdown' || f.fieldType === 'radio' || f.fieldType === 'multiple_choice';
                    if (!isChoice) return f;

                    // Priority 1: in-memory options already stored on the field from last save
                    if (Array.isArray(f._resolvedOptions) && f._resolvedOptions.length > 0) {
                        return { ...f, options: f._resolvedOptions };
                    }

                    // Priority 2: fetch from shared_options API via sharedOptionsId
                    if (f.sharedOptionsId) {
                        try {
                            const shared = await getSharedOptions(f.sharedOptionsId);
                            const parsed = JSON.parse(shared.optionsJson || '[]');
                            const opts = parsed.map(o =>
                                typeof o === 'string'
                                    ? { label: o, value: o }
                                    : { label: o.label || o.value || '', value: o.value || o.label || '' }
                            );
                            return { ...f, options: opts };
                        } catch {
                            return f; // API failed — text input fallback in ValueInput
                        }
                    }

                    // Priority 3: no options available — ValueInput shows text input fallback
                    return f;
                })
            );
            if (!cancelled) setEnrichedSiblings(result);
        }

        enrichSiblings();
        return () => { cancelled = true; };
    }, [siblingFields]);

    // Load options from shared_options API whenever sharedOptionsId changes
    useEffect(() => {
        if (!sharedOptionsId) {
            // New field with no shared options yet — start with defaults
            setOptions(['Option 1', 'Option 2']);
            return;
        }
        getSharedOptions(sharedOptionsId)
            .then(shared => {
                try {
                    const parsed = JSON.parse(shared.optionsJson || '[]');
                    const labels = parsed.map(o => (typeof o === 'string' ? o : (o.label || o.value || '')));
                    setOptions(labels.filter(l => l.trim()) || ['Option 1', 'Option 2']);
                } catch {
                    setOptions(['Option 1', 'Option 2']);
                }
            })
            .catch(() => setOptions(['Option 1', 'Option 2']));
    }, [sharedOptionsId]);

    // Sync when field prop changes (e.g. switching which field is being edited)
    useEffect(() => {
        setLocal({ ...field });
        setSharedOptionsId(field.sharedOptionsId || null);
        setUnlinkNotice(false);
        setRulesExpanded(false);
        if (field.validationJson) {
            try { setValidationRules(JSON.parse(field.validationJson)); } catch { setValidationRules({}); }
        } else {
            setValidationRules({});
        }
    }, [field]);

    const set = (key, value) => setLocal(prev => ({ ...prev, [key]: value }));

    const setValidation = (key, value) => {
        setValidationRules(prev => {
            const updated = { ...prev };
            if (value === '' || value === false || value === null || value === undefined) {
                delete updated[key];
            } else {
                updated[key] = value;
            }
            return updated;
        });
    };

    const handleLabelChange = (e) => {
        const label = e.target.value;
        set('label', label);
        const autoKey = toKey(field.label);
        if (!local.fieldKey || local.fieldKey === toKey(field.label) || local.fieldKey === autoKey) {
            set('fieldKey', toKey(label));
        }
    };

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const handleSave = async () => {
        if (!local.label || !local.label.trim()) {
            toastError("Field label is required.");
            return;
        }
        setSaving(true);
        setSaveError(null);

        // Validation for Calculated Fields
        if (local.isCalculated) {
            const formulaErr = CalculationEngine.validateFormula(local.fieldKey || toKey(local.label), local.formulaExpression, [...siblingFields, local]);
            if (formulaErr) {
                setSaveError(formulaErr);
                setSaving(false);
                return;
            }
        }

        try {
            let finalSharedOptionsId = sharedOptionsId || null;

            // Flat options (dropdown / radio / multiple_choice)
            if (local.fieldType === 'dropdown' || local.fieldType === 'radio' || local.fieldType === 'multiple_choice') {
                const filtered = options.filter(o => o.trim());
                const optionsJson = JSON.stringify(filtered.map(o => ({ label: o, value: o })));
                if (finalSharedOptionsId) {
                    await updateSharedOptions(finalSharedOptionsId, optionsJson);
                } else {
                    const created = await createSharedOptions(optionsJson);
                    finalSharedOptionsId = created.id;
                }
            }

            // Grid config (multiple_choice_grid & checkbox_grid) — stored as {"rows":[...],"columns":[...]} in shared_options
            if (local.fieldType === 'multiple_choice_grid' || local.fieldType === 'checkbox_grid') {
                const filteredRows = gridRows.filter(r => r.trim());
                const filteredCols = gridColumns.filter(c => c.trim());
                const gridJson = JSON.stringify({ rows: filteredRows, columns: filteredCols });
                if (finalSharedOptionsId) {
                    await updateSharedOptions(finalSharedOptionsId, gridJson);
                } else {
                    const created = await createSharedOptions(gridJson);
                    finalSharedOptionsId = created.id;
                }
            }

            const isChoice = local.fieldType === 'dropdown' || local.fieldType === 'radio' || local.fieldType === 'multiple_choice';
            const isGrid = local.fieldType === 'multiple_choice_grid' || local.fieldType === 'checkbox_grid';

            const updatedField = {
                ...local,
                fieldKey: local.fieldKey || toKey(local.label),
                sharedOptionsId: finalSharedOptionsId,
                optionsJson: undefined,
                gridJson: undefined, // not sent to backend — lives in shared_options
                _resolvedOptions: isChoice
                    ? options.filter(o => o.trim()).map(o => ({ label: o, value: o }))
                    : isGrid
                        ? { rows: gridRows.filter(r => r.trim()), columns: gridColumns.filter(c => c.trim()) }
                        : undefined,
                // Calculated field settings
                isCalculated: local.isCalculated || false,
                formulaExpression: local.isCalculated ? local.formulaExpression : null,
                dependencies: local.isCalculated ? CalculationEngine.extractDependencies(local.formulaExpression, siblingFields.map(f => f.fieldKey)) : [],
                precision: local.isCalculated ? local.precision : null,
                lockAfterCalculation: local.isCalculated ? local.lockAfterCalculation : false,
                disabled: local.disabled || false,
                readOnly: local.readOnly || false,
            };

            updatedField.validationJson = Object.keys(validationRules).length > 0
                ? JSON.stringify(validationRules) : null;

            updatedField.uiConfigJson = Object.keys(uiConfig).length > 0
                ? JSON.stringify(uiConfig) : null;

            onSave(updatedField);
        } catch (err) {
            setSaveError('Failed to save: ' + (err.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }
    };

    // Called by ExistingDropdownPicker — receives {optionsJson, sharedOptionsId}
    const handlePickOptions = ({ optionsJson: rawOptionsJson, sharedOptionsId: sid }) => {
        try {
            const parsed = JSON.parse(rawOptionsJson || '[]');
            const labels = parsed.map(o => (typeof o === 'string' ? o : (o.label || o.value || '')));
            setOptions(labels.filter(l => l.trim()));
        } catch { /* keep existing */ }
        setSharedOptionsId(sid);
        setUnlinkNotice(false);
        setPickerOpen(false);
    };

    // When admin manually edits an option — keep sharedOptionsId linked.
    // On save, updateSharedOptions() will push the new options to the same row.
    // All other forms sharing this row will see the updated options instantly.
    const handleOptionEdit = (idx, val) => {
        const newOpts = [...options];
        newOpts[idx] = val;
        setOptions(newOpts);
        // DO NOT clear sharedOptionsId — the same shared_options row gets updated on save
    };

    const TYPE_ICONS = { text: '𝐓', number: '#', date: '📅', boolean: '✓', dropdown: '▼', radio: '◉', file: '📎' };

    return (
        <>
            <div className="config-panel-container">
                <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                    {/* Header */}
                    <div className="modal-header">
                        <div className="modal-title" id="modal-title">
                            Configure Field
                            <span className="modal-type-badge">
                                {TYPE_ICONS[local.fieldType]} {local.fieldType}
                            </span>
                        </div>
                        <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>
                    </div>

                    {/* Body */}
                    <div className="modal-body">
                        {/* Label */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="cfg-label">Label *</label>
                            <input
                                id="cfg-label"
                                className="form-input"
                                value={local.label || ''}
                                onChange={handleLabelChange}
                                placeholder="e.g. Full Name"
                                autoFocus
                            />
                        </div>

                        {/* Field Key */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="cfg-key">Field Key</label>
                            <input
                                id="cfg-key"
                                className="form-input"
                                value={local.fieldKey}
                                onChange={(e) => set('fieldKey', toKey(e.target.value))}
                                placeholder="e.g. full_name"
                            />
                            <p className="form-help">Snake_case identifier — becomes the database column name. Auto-generated from label.</p>
                        </div>



                        {/* Default Value */}
                        {local.fieldType !== 'boolean' && local.fieldType !== 'field_group' && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="cfg-default">Default Value</label>
                                <input
                                    id="cfg-default"
                                    className="form-input"
                                    type={local.fieldType === 'number' ? 'number' : local.fieldType === 'date' ? 'date' : 'text'}
                                    value={local.defaultValue || ''}
                                    onChange={(e) => set('defaultValue', e.target.value)}
                                    placeholder="Optional default"
                                />
                            </div>
                        )}

                        {/* Validation Regex & Message */}
                        {(local.fieldType === 'text' || local.fieldType === 'number') && local.fieldType !== 'field_group' && (
                            <>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="cfg-regex">Validation Regex</label>
                                    <input
                                        id="cfg-regex"
                                        className="form-input"
                                        value={local.validationRegex || ''}
                                        onChange={(e) => set('validationRegex', e.target.value)}
                                        placeholder="e.g. ^[A-Za-z ]+$"
                                        style={{ fontFamily: 'Courier New, monospace' }}
                                    />
                                    <p className="form-help">Applied on both frontend and backend. Leave blank to skip.</p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Validation Error Message</label>
                                    <input
                                        className="form-input"
                                        value={validationRules.message || ''}
                                        onChange={(e) => setValidation('message', e.target.value)}
                                        placeholder="Custom text to show on error"
                                    />
                                    <p className="form-help">Custom text shown if the regex or other rules fail.</p>
                                </div>
                            </>
                        )}

                        {/* ── Calculated Field Settings — Visual Formula Builder ── */}
                        {local.fieldType !== 'field_group' && (local.fieldType === 'text' || local.fieldType === 'number' || local.fieldType === 'date') && (() => {
                            // Live validation feedback while user types
                            const formulaError = local.isCalculated && local.formulaExpression
                                ? CalculationEngine.validateFormula(
                                    local.fieldKey || '__this__',
                                    local.formulaExpression,
                                    siblingFields
                                )
                                : null;

                            // Cursor-aware insert helper
                            const insertAtCursor = (text) => {
                                const el = document.getElementById('fcm-formula-input');
                                const cur = local.formulaExpression || '';
                                if (!el) { set('formulaExpression', cur + text); return; }
                                const start = el.selectionStart ?? cur.length;
                                const end = el.selectionEnd ?? cur.length;
                                // Surround operators with spaces for readability
                                const isArithOp = '+-*/'.includes(text) && text.length === 1;
                                const chunk = isArithOp ? ` ${text} ` : text;
                                const next = cur.slice(0, start) + chunk + cur.slice(end);
                                set('formulaExpression', next);
                                requestAnimationFrame(() => {
                                    el.focus();
                                    const pos = start + chunk.length;
                                    el.setSelectionRange(pos, pos);
                                });
                            };

                            const detectedDeps = local.isCalculated && local.formulaExpression
                                ? CalculationEngine.extractDependencies(local.formulaExpression, siblingFields.map(f => f.fieldKey))
                                : [];

                            const typeBadge = (ft) => ({
                                bg: ft === 'number' ? 'rgba(99,102,241,0.15)' : ft === 'date' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                color: ft === 'number' ? '#818cf8' : ft === 'date' ? '#34d399' : '#fbbf24',
                                label: ft === 'number' ? 'num' : ft === 'date' ? 'date' : 'txt',
                            });

                            const OPERATORS = [
                                { display: '+', insert: '+', title: 'Add / concatenate' },
                                { display: '−', insert: '-', title: 'Subtract / date diff' },
                                { display: '×', insert: '*', title: 'Multiply' },
                                { display: '÷', insert: '/', title: 'Divide' },
                                { display: '(', insert: '(', title: 'Open parenthesis' },
                                { display: ')', insert: ')', title: 'Close parenthesis' },
                            ];

                            const EXAMPLES = [
                                { title: 'Arithmetic', code: 'price * quantity', desc: 'Multiplies price by quantity.' },
                                { title: 'Precedence', code: '(price * quantity) + tax', desc: 'Multiply first, then add tax.' },
                                { title: 'String concat', code: 'first_name + " " + last_name', desc: 'Join text fields. Missing → empty string.' },
                                { title: 'Date difference', code: 'end_date - start_date', desc: 'Returns days between two dates.' },
                                { title: 'Division', code: 'total / qty', desc: 'Zero / empty divisor → blank result.' },
                            ];

                            return (
                                <div className="validation-section" style={{ marginTop: 20 }}>
                                    {/* ── Toggle ── */}
                                    <div className="form-group" style={{ marginBottom: 14 }}>
                                        <label className="form-checkbox-row" style={{ fontWeight: 600, fontSize: 14 }}>
                                            <input
                                                type="checkbox"
                                                checked={local.isCalculated || false}
                                                onChange={(e) => set('isCalculated', e.target.checked)}
                                            />
                                            <span>∑&nbsp; Enable Calculated Field</span>
                                        </label>
                                        <p className="form-help" style={{ marginTop: 4, marginLeft: 26 }}>
                                            Value is computed automatically — no user input needed.
                                        </p>
                                    </div>

                                    {local.isCalculated && (
                                        <div className="animate-in" style={{ padding: '18px', background: 'rgba(99,102,241,0.04)', borderRadius: 14, border: '1px solid rgba(99,102,241,0.18)', display: 'flex', flexDirection: 'column', gap: 14 }}>

                                            {/* ── SECTION 1: Formula Input ── */}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <label className="form-label" style={{ margin: 0 }}>
                                                        Formula Expression
                                                        <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>(type directly or use the buttons below)</span>
                                                    </label>
                                                    {local.formulaExpression && (
                                                        <button type="button" onClick={() => set('formulaExpression', '')}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '2px 6px' }}
                                                            title="Clear formula">✕ Clear</button>
                                                    )}
                                                </div>
                                                <input
                                                    id="fcm-formula-input"
                                                    className="form-input"
                                                    value={local.formulaExpression || ''}
                                                    onChange={(e) => set('formulaExpression', e.target.value)}
                                                    placeholder={
                                                        local.fieldType === 'date' ? 'e.g.  end_date - start_date' :
                                                            local.fieldType === 'text' ? 'e.g.  first_name + " " + last_name' :
                                                                'e.g.  price * quantity'
                                                    }
                                                    style={{
                                                        fontFamily: 'Courier New, monospace', fontSize: 14,
                                                        borderColor: formulaError ? 'rgba(239,68,68,0.55)' : 'rgba(99,102,241,0.25)',
                                                        background: 'rgba(0,0,0,0.12)'
                                                    }}
                                                    autoComplete="off" spellCheck={false}
                                                />
                                                {formulaError && (
                                                    <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', fontSize: 12, color: '#f87171', display: 'flex', gap: 6 }}>
                                                        <span>⚠</span><span>{formulaError}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ── SECTION 2: Operator Buttons ── */}
                                            <div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 7 }}>Operators</div>
                                                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                                    {OPERATORS.map(op => (
                                                        <button key={op.display} type="button" title={op.title}
                                                            onClick={() => insertAtCursor(op.insert)}
                                                            style={{ width: 40, height: 36, borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: 'var(--accent,#818cf8)', fontSize: 17, fontWeight: 700, cursor: 'pointer', transition: 'background 0.13s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.22)'}
                                                            onMouseOut={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                                                        >{op.display}</button>
                                                    ))}
                                                    <button type="button" title='Insert a text literal (e.g. a space between names)'
                                                        onClick={() => insertAtCursor('" "')}
                                                        style={{ padding: '0 12px', height: 36, borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Courier New, monospace', transition: 'background 0.13s' }}
                                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
                                                        onMouseOut={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                                                    >&quot; &quot;</button>
                                                </div>
                                            </div>

                                            {/* ── SECTION 3: Field Pills ── */}
                                            {siblingFields.length > 0 && (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                                            {showAllFields ? 'All Fields' : `Suggested ${local.fieldType === 'number' ? 'Numeric' : local.fieldType === 'date' ? 'Date' : 'Relevant'} Fields`} — click to insert
                                                        </div>
                                                        <label style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <input type="checkbox" checked={showAllFields} onChange={e => setShowAllFields(e.target.checked)} style={{ width: 12, height: 12 }} />
                                                            Show all
                                                        </label>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                        {siblingFields
                                                            .filter(f => showAllFields ||
                                                                (local.fieldType === 'number' ? f.fieldType === 'number' :
                                                                    local.fieldType === 'date' ? f.fieldType === 'date' :
                                                                        true)) // text/others show all by default
                                                            .map(f => {
                                                                const b = typeBadge(f.fieldType);
                                                                const active = detectedDeps.includes(f.fieldKey);
                                                                return (
                                                                    <button key={f.fieldKey} type="button"
                                                                        title={`${f.fieldType} — ${f.label || f.fieldKey}`}
                                                                        onClick={() => insertAtCursor(f.fieldKey)}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20,
                                                                            border: active ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(99,102,241,0.25)',
                                                                            background: active ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.06)',
                                                                            cursor: 'pointer', transition: 'all 0.13s', fontSize: 12
                                                                        }}
                                                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                                                                        onMouseOut={e => e.currentTarget.style.background = active ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.06)'}
                                                                    >
                                                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: b.bg, color: b.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</span>
                                                                        <span style={{ color: 'var(--text-primary)', fontFamily: 'Courier New, monospace', fontSize: 12 }}>{f.fieldKey}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── SECTION 4 + 5: Precision & Lock ── */}
                                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                                {local.fieldType === 'number' && (
                                                    <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
                                                        <label className="form-label" style={{ marginBottom: 5 }}>
                                                            Decimal Precision
                                                            <span className="form-help" style={{ marginLeft: 5 }}>(numeric only)</span>
                                                        </label>
                                                        <input type="number" className="form-input"
                                                            value={local.precision ?? 2}
                                                            onChange={(e) => set('precision', parseInt(e.target.value, 10) || 0)}
                                                            min="0" max="10" style={{ maxWidth: 90 }}
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 4 }}>
                                                    <label className="form-checkbox-row compact" style={{ margin: 0 }}>
                                                        <input type="checkbox"
                                                            checked={local.lockAfterCalculation || false}
                                                            onChange={(e) => set('lockAfterCalculation', e.target.checked)}
                                                        />
                                                        <span>🔒 Lock field (Read-only for users)</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Detected dependencies */}
                                            {detectedDeps.length > 0 && (
                                                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>Depends on:</span>
                                                    <span style={{ fontFamily: 'Courier New, monospace', color: '#34d399' }}>{detectedDeps.join(', ')}</span>
                                                </div>
                                            )}

                                            {/* ── SECTION 6: Syntax Reference ── */}
                                            <details style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                                                <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', display: 'flex', gap: 6, alignItems: 'center', listStyle: 'none' }}>
                                                    <span>📖</span><span>Formula Syntax Reference</span>
                                                </summary>
                                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 11 }}>
                                                    {EXAMPLES.map(item => (
                                                        <div key={item.title} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.title}</span>
                                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                <code style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(99,102,241,0.1)', color: '#a78bfa', fontSize: 12, fontFamily: 'Courier New, monospace' }}>{item.code}</code>
                                                                <button type="button" onClick={() => set('formulaExpression', item.code)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: 0 }}
                                                                >Use ↑</button>
                                                            </div>
                                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ── Dropdown Selection Type (Single / Multi) ── */}
                        {local.fieldType === 'dropdown' && (
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Dropdown Selection Type</label>
                                <div style={{ display: 'flex', gap: 16 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="dropdown-type"
                                            checked={!uiConfig.multiple}
                                            onChange={() => setUiCfg('multiple', false)}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        Single Select (Default)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="dropdown-type"
                                            checked={!!uiConfig.multiple}
                                            onChange={() => setUiCfg('multiple', true)}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        Multi Select
                                    </label>
                                </div>
                                <p className="form-help" style={{ marginTop: 6 }}>
                                    {uiConfig.multiple ? 'Users can select multiple options (displayed as chips).' : 'Users can select only one option.'}
                                </p>
                            </div>
                        )}

                        {/* ── Options Editor (dropdown / radio / multiple_choice only) ── */}
                        {(local.fieldType === 'dropdown' || local.fieldType === 'radio' || local.fieldType === 'multiple_choice') && (
                            <div className="form-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <label className="form-label" style={{ margin: 0 }}>Options</label>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setPickerOpen(true)}
                                        title="Copy options from an existing form's dropdown or radio field"
                                    >
                                        📋 Use Existing Options
                                    </button>
                                </div>

                                {/* Live-link banner */}
                                {sharedOptionsId && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 12px', marginBottom: 10, borderRadius: 8,
                                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                                        fontSize: 12, color: 'var(--accent, #6366f1)',
                                    }}>
                                        <span>🔗 Shared options — any edits here will update ALL forms using this option list</span>
                                        <button
                                            type="button"
                                            onClick={() => { setSharedOptionsId(null); setUnlinkNotice(true); setTimeout(() => setUnlinkNotice(false), 3000); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'inherit', padding: '0 0 0 8px', fontWeight: 700 }}
                                            title="Unlink — create a new independent copy of these options"
                                        >× Unlink</button>
                                    </div>
                                )}

                                {/* Unlink notice */}
                                {unlinkNotice && (
                                    <div style={{
                                        padding: '6px 12px', marginBottom: 8, borderRadius: 8,
                                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)',
                                        fontSize: 12, color: '#92400e',
                                    }}>
                                        ⚠ Link removed — options are now a static copy.
                                    </div>
                                )}

                                {options.map((opt, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                        <input
                                            className="form-input"
                                            value={opt}
                                            onChange={(e) => handleOptionEdit(idx, e.target.value)}
                                            placeholder={`Option ${idx + 1}`}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                                            disabled={options.length <= 1}
                                            title="Remove option"
                                        >×</button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
                                >+ Add Option</button>
                                <p className="form-help">Define choices, or link to an existing field — linked options update automatically.</p>
                            </div>
                        )}

                        {/* ── Grid Config Editor (multiple_choice_grid only) ── */}
                        {local.fieldType === 'multiple_choice_grid' && (
                            <div className="form-group">
                                <label className="form-label" style={{ marginBottom: 12, display: 'block' }}>⊞ Grid Configuration</label>

                                {/* Shared options link banner */}
                                {sharedOptionsId && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 12px', marginBottom: 10, borderRadius: 8,
                                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                                        fontSize: 12, color: 'var(--accent, #6366f1)',
                                    }}>
                                        <span>🔗 Shared grid config — edits update all forms using this grid</span>
                                        <button
                                            type="button"
                                            onClick={() => { setSharedOptionsId(null); setUnlinkNotice(true); setTimeout(() => setUnlinkNotice(false), 3000); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'inherit', padding: '0 0 0 8px', fontWeight: 700 }}
                                        >× Unlink</button>
                                    </div>
                                )}

                                {/* ROWS */}
                                <div style={{ marginBottom: 16 }}>
                                    <p className="form-label" style={{ marginBottom: 8 }}>Rows (questions)</p>
                                    {gridRows.map((row, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                            <input
                                                className="form-input"
                                                value={row}
                                                onChange={(e) => {
                                                    const updated = [...gridRows];
                                                    updated[idx] = e.target.value;
                                                    setGridRows(updated);
                                                }}
                                                placeholder={`Row ${idx + 1} (e.g. Service Quality)`}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setGridRows(gridRows.filter((_, i) => i !== idx))}
                                                disabled={gridRows.length <= 1}
                                                title="Remove row"
                                            >×</button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setGridRows([...gridRows, `Row ${gridRows.length + 1}`])}
                                    >+ Add Row</button>
                                </div>

                                {/* COLUMNS */}
                                <div>
                                    <p className="form-label" style={{ marginBottom: 8 }}>Columns (options per row)</p>
                                    {gridColumns.map((col, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                            <input
                                                className="form-input"
                                                value={col}
                                                onChange={(e) => {
                                                    const updated = [...gridColumns];
                                                    updated[idx] = e.target.value;
                                                    setGridColumns(updated);
                                                }}
                                                placeholder={`Column ${idx + 1} (e.g. Poor / Good)`}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setGridColumns(gridColumns.filter((_, i) => i !== idx))}
                                                disabled={gridColumns.length <= 2}
                                                title="Remove column"
                                            >×</button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setGridColumns([...gridColumns, `Option ${gridColumns.length + 1}`])}
                                    >+ Add Column</button>
                                </div>

                                <p className="form-help">Each row shows as a question; each column is a selectable option. Users pick one per row.</p>

                                {/* Live preview */}
                                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}></th>
                                                {gridColumns.filter(c => c.trim()).map((col, ci) => (
                                                    <th key={ci} style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gridRows.filter(r => r.trim()).map((row, ri) => (
                                                <tr key={ri} style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{row}</td>
                                                    {gridColumns.filter(c => c.trim()).map((_, ci) => (
                                                        <td key={ci} style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.4)' }} />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ── Checkbox Grid Config Editor (checkbox_grid) ── */}
                        {local.fieldType === 'checkbox_grid' && (
                            <div className="form-group">
                                <label className="form-label" style={{ marginBottom: 12, display: 'block' }}>⊡ Checkbox Grid Configuration</label>

                                {sharedOptionsId && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 12px', marginBottom: 10, borderRadius: 8,
                                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                                        fontSize: 12, color: 'var(--accent, #6366f1)',
                                    }}>
                                        <span>🔗 Shared grid config — edits update all forms using this grid</span>
                                        <button type="button"
                                            onClick={() => { setSharedOptionsId(null); setUnlinkNotice(true); setTimeout(() => setUnlinkNotice(false), 3000); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'inherit', padding: '0 0 0 8px', fontWeight: 700 }}
                                        >× Unlink</button>
                                    </div>
                                )}

                                {/* ROWS */}
                                <div style={{ marginBottom: 16 }}>
                                    <p className="form-label" style={{ marginBottom: 8 }}>Rows (questions)</p>
                                    {gridRows.map((row, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                            <input className="form-input" value={row}
                                                onChange={(e) => { const u = [...gridRows]; u[idx] = e.target.value; setGridRows(u); }}
                                                placeholder={`Row ${idx + 1} (e.g. Quality)`} />
                                            <button type="button" className="btn btn-secondary btn-sm"
                                                onClick={() => setGridRows(gridRows.filter((_, i) => i !== idx))}
                                                disabled={gridRows.length <= 1}>×</button>
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-secondary btn-sm"
                                        onClick={() => setGridRows([...gridRows, `Row ${gridRows.length + 1}`])}>+ Add Row</button>
                                </div>

                                {/* COLUMNS */}
                                <div>
                                    <p className="form-label" style={{ marginBottom: 8 }}>Columns (options per row — multiple selectable)</p>
                                    {gridColumns.map((col, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                            <input className="form-input" value={col}
                                                onChange={(e) => { const u = [...gridColumns]; u[idx] = e.target.value; setGridColumns(u); }}
                                                placeholder={`Column ${idx + 1} (e.g. Mon / Tue)`} />
                                            <button type="button" className="btn btn-secondary btn-sm"
                                                onClick={() => setGridColumns(gridColumns.filter((_, i) => i !== idx))}
                                                disabled={gridColumns.length <= 2}>×</button>
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-secondary btn-sm"
                                        onClick={() => setGridColumns([...gridColumns, `Option ${gridColumns.length + 1}`])}>+ Add Column</button>
                                </div>

                                <p className="form-help">Users can tick multiple columns per row (like Google Forms Checkbox Grid).</p>

                                {/* Preview */}
                                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}></th>
                                                {gridColumns.filter(c => c.trim()).map((col, ci) => (
                                                    <th key={ci} style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gridRows.filter(r => r.trim()).map((row, ri) => (
                                                <tr key={ri} style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{row}</td>
                                                    {gridColumns.filter(c => c.trim()).map((_, ci) => (
                                                        <td key={ci} style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                            <span style={{ display: 'inline-block', width: 13, height: 13, borderRadius: 3, border: '2px solid rgba(139,92,246,0.4)' }} />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ── Star Rating info (no config needed — always 1-5) ── */}
                        {local.fieldType === 'star_rating' && (
                            <div className="form-group">
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                    borderRadius: 10, fontSize: 14,
                                }}>
                                    <span style={{ fontSize: 24 }}>★★★★★</span>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#FCD34D' }}>5-Star Rating</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Fixed scale 1–5. Users click a star to rate. Value stored as integer.</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ========== VALIDATION SETTINGS SECTION ========== */}
                        <div className="validation-section">
                            <button
                                type="button"
                                className="validation-toggle"
                                onClick={() => setValidationExpanded(!validationExpanded)}
                            >
                                <span className="toggle-icon">{validationExpanded ? '▼' : '▶'}</span>
                                <span className="toggle-label">Validation Settings</span>
                                {Object.keys(validationRules).length > 0 && (
                                    <span className="validation-count">{Object.keys(validationRules).length} rule{Object.keys(validationRules).length !== 1 ? 's' : ''}</span>
                                )}
                            </button>

                            {validationExpanded && (
                                <div className="validation-content">

                                    <div className="validation-group" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 15, marginBottom: 15 }}>
                                        <h4 className="validation-group-title" style={{ color: 'var(--accent)' }}>General Error Message</h4>
                                        <div className="form-group">
                                            <label className="form-label">Custom Validation Message</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={local.validationMessage || ''}
                                                onChange={(e) => set('validationMessage', e.target.value)}
                                                placeholder="e.g. Please enter a valid 10-digit phone number"
                                            />
                                            <p className="form-help">If any validation rule fails, this message will be shown to the user.</p>
                                        </div>
                                    </div>
                                    {/* ========== TEXT FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'text' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Basic Length</h4>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="form-label">Min Length</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.minLength || ''}
                                                            onChange={(e) => setValidation('minLength', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 3"
                                                            min="0"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Max Length</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxLength || ''}
                                                            onChange={(e) => setValidation('maxLength', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 100"
                                                            min="0"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Exact Length</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.exactLength || ''}
                                                            onChange={(e) => setValidation('exactLength', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 10"
                                                            min="0"
                                                        />
                                                    </div>
                                                </div>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.trimWhitespace || false}
                                                        onChange={(e) => setValidation('trimWhitespace', e.target.checked)}
                                                    />
                                                    <span>Trim Whitespace</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.noLeadingTrailingSpaces || false}
                                                        onChange={(e) => setValidation('noLeadingTrailingSpaces', e.target.checked)}
                                                    />
                                                    <span>No Leading/Trailing Spaces</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.noConsecutiveSpaces || false}
                                                        onChange={(e) => setValidation('noConsecutiveSpaces', e.target.checked)}
                                                    />
                                                    <span>No Consecutive Spaces</span>
                                                </label>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Format Rules</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.alphabetOnly || false}
                                                        onChange={(e) => setValidation('alphabetOnly', e.target.checked)}
                                                    />
                                                    <span>Alphabet Only (A-Z, a-z)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.alphanumericOnly || false}
                                                        onChange={(e) => setValidation('alphanumericOnly', e.target.checked)}
                                                    />
                                                    <span>Alphanumeric Only (A-Z, 0-9)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.noSpecialCharacters || false}
                                                        onChange={(e) => setValidation('noSpecialCharacters', e.target.checked)}
                                                    />
                                                    <span>No Special Characters</span>
                                                </label>

                                                <div className="form-group">
                                                    <label className="form-label">Allow Specific Special Characters</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={validationRules.allowSpecificSpecialCharacters || ''}
                                                        onChange={(e) => setValidation('allowSpecificSpecialCharacters', e.target.value)}
                                                        placeholder="e.g. ._-@"
                                                    />
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Custom Regex</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={validationRules.customRegex || ''}
                                                        onChange={(e) => setValidation('customRegex', e.target.value)}
                                                        placeholder="e.g. ^[A-Z]{3}[0-9]{4}$"
                                                        style={{ fontFamily: 'monospace' }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Content Validation</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.emailFormat || false}
                                                        onChange={(e) => setValidation('emailFormat', e.target.checked)}
                                                    />
                                                    <span>Email Format</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.urlFormat || false}
                                                        onChange={(e) => setValidation('urlFormat', e.target.checked)}
                                                    />
                                                    <span>URL Format</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.passwordStrength || false}
                                                        onChange={(e) => setValidation('passwordStrength', e.target.checked)}
                                                    />
                                                    <span>Password Strength (Upper+Lower+Digit+Special)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.unique || false}
                                                        onChange={(e) => setValidation('unique', e.target.checked)}
                                                    />
                                                    <span>Unique Value (Database Check)</span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== NUMBER FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'number' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Basic Type</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.integerOnly || false}
                                                        onChange={(e) => setValidation('integerOnly', e.target.checked)}
                                                    />
                                                    <span>Integer Only (No Decimals)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.decimalAllowed || false}
                                                        onChange={(e) => setValidation('decimalAllowed', e.target.checked)}
                                                    />
                                                    <span>Allow Decimal</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.positiveOnly || false}
                                                        onChange={(e) => setValidation('positiveOnly', e.target.checked)}
                                                    />
                                                    <span>Positive Only (&gt; 0)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.negativeAllowed || false}
                                                        onChange={(e) => setValidation('negativeAllowed', e.target.checked)}
                                                    />
                                                    <span>Allow Negative</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.zeroAllowed || false}
                                                        onChange={(e) => setValidation('zeroAllowed', e.target.checked)}
                                                    />
                                                    <span>Allow Zero</span>
                                                </label>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Range</h4>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="form-label">Min Value</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.minValue || ''}
                                                            onChange={(e) => setValidation('minValue', e.target.value ? parseFloat(e.target.value) : '')}
                                                            placeholder="e.g. 0"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Max Value</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxValue || ''}
                                                            onChange={(e) => setValidation('maxValue', e.target.value ? parseFloat(e.target.value) : '')}
                                                            placeholder="e.g. 100"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Format</h4>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="form-label">Max Digits</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxDigits || ''}
                                                            onChange={(e) => setValidation('maxDigits', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 10"
                                                            min="1"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Max Decimal Places</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxDecimalPlaces || ''}
                                                            onChange={(e) => setValidation('maxDecimalPlaces', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 2"
                                                            min="0"
                                                        />
                                                    </div>
                                                </div>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.noLeadingZero || false}
                                                        onChange={(e) => setValidation('noLeadingZero', e.target.checked)}
                                                    />
                                                    <span>No Leading Zero</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.phoneNumberFormat || false}
                                                        onChange={(e) => setValidation('phoneNumberFormat', e.target.checked)}
                                                    />
                                                    <span>Phone Number Format (10 digits)</span>
                                                </label>

                                                <div className="form-group">
                                                    <label className="form-label">OTP Fixed Length</label>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={validationRules.otpFormat || ''}
                                                        onChange={(e) => setValidation('otpFormat', e.target.value ? parseInt(e.target.value) : '')}
                                                        placeholder="e.g. 6"
                                                        min="4"
                                                        max="10"
                                                    />
                                                </div>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Business Rules</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.uniqueNumber || false}
                                                        onChange={(e) => setValidation('uniqueNumber', e.target.checked)}
                                                    />
                                                    <span>Unique Number (Database Check)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.ageValidation || false}
                                                        onChange={(e) => setValidation('ageValidation', e.target.checked)}
                                                    />
                                                    <span>Age Validation (≥ 18)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.currencyFormat || false}
                                                        onChange={(e) => setValidation('currencyFormat', e.target.checked)}
                                                    />
                                                    <span>Currency Format</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.percentageRange || false}
                                                        onChange={(e) => setValidation('percentageRange', e.target.checked)}
                                                    />
                                                    <span>Percentage Range (0-100)</span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== DATE FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'date' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Basic</h4>

                                                <div className="form-group">
                                                    <label className="form-label">Custom Format</label>
                                                    <select
                                                        className="form-input"
                                                        value={validationRules.customFormat || ''}
                                                        onChange={(e) => setValidation('customFormat', e.target.value)}
                                                    >
                                                        <option value="">Default (YYYY-MM-DD)</option>
                                                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                                    </select>
                                                </div>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.pastOnly || false}
                                                        onChange={(e) => setValidation('pastOnly', e.target.checked)}
                                                    />
                                                    <span>Past Only (Before Today)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.futureOnly || false}
                                                        onChange={(e) => setValidation('futureOnly', e.target.checked)}
                                                    />
                                                    <span>Future Only (After Today)</span>
                                                </label>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Range</h4>

                                                <div className="form-group">
                                                    <label className="form-label">Min Date</label>
                                                    <input
                                                        type="date"
                                                        className="form-input"
                                                        value={validationRules.minDate || ''}
                                                        onChange={(e) => setValidation('minDate', e.target.value)}
                                                    />
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Max Date</label>
                                                    <input
                                                        type="date"
                                                        className="form-input"
                                                        value={validationRules.maxDate || ''}
                                                        onChange={(e) => setValidation('maxDate', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Logical Rules</h4>

                                                <div className="form-group">
                                                    <label className="form-label">Age Must Be ≥</label>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={validationRules.age18Plus || ''}
                                                        onChange={(e) => setValidation('age18Plus', e.target.value ? parseInt(e.target.value) : '')}
                                                        placeholder="e.g. 18"
                                                        min="0"
                                                    />
                                                </div>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.noWeekend || false}
                                                        onChange={(e) => setValidation('noWeekend', e.target.checked)}
                                                    />
                                                    <span>No Weekend (Saturday/Sunday)</span>
                                                </label>

                                                <div className="form-group">
                                                    <label className="form-label">Not Older Than (Years)</label>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={validationRules.notOlderThanXYears || ''}
                                                        onChange={(e) => setValidation('notOlderThanXYears', e.target.value ? parseInt(e.target.value) : '')}
                                                        placeholder="e.g. 100"
                                                        min="1"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== BOOLEAN FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'boolean' && (
                                        <div className="validation-group">
                                            <h4 className="validation-group-title">Boolean Rules</h4>

                                            <label className="form-checkbox-row compact">
                                                <input
                                                    type="checkbox"
                                                    checked={validationRules.mustBeTrue || false}
                                                    onChange={(e) => setValidation('mustBeTrue', e.target.checked)}
                                                />
                                                <span>Must Be True (Terms & Conditions)</span>
                                            </label>

                                            <label className="form-checkbox-row compact">
                                                <input
                                                    type="checkbox"
                                                    checked={validationRules.defaultValue || false}
                                                    onChange={(e) => setValidation('defaultValue', e.target.checked)}
                                                />
                                                <span>Default Checked</span>
                                            </label>
                                        </div>
                                    )}

                                    {/* ========== DROPDOWN FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'dropdown' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Selection Rules</h4>

                                                {/* Required is handled by the top-level Required toggle,
                                                but we expose optionExists so the admin explicitly
                                                enforces that the chosen value is one of the listed options */}
                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.optionExists !== false}
                                                        onChange={(e) => setValidation('optionExists', e.target.checked)}
                                                    />
                                                    <span>Validate Option Exists (reject unknown values)</span>
                                                </label>

                                                <div className="form-group" style={{ marginTop: 10 }}>
                                                    <label className="form-label">Reject Placeholder / Default Text</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={validationRules.defaultNotAllowed || ''}
                                                        onChange={(e) => setValidation('defaultNotAllowed', e.target.value)}
                                                        placeholder='e.g. -- Select -- or Choose an option'
                                                    />
                                                    <span className="form-hint">If user submits this exact text it will be rejected</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== RADIO FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'radio' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Selection Rules</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.validateSelectedOption !== false}
                                                        onChange={(e) => setValidation('validateSelectedOption', e.target.checked)}
                                                    />
                                                    <span>Validate Selected Option (reject unknown values)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.requireSelection || false}
                                                        onChange={(e) => setValidation('requireSelection', e.target.checked)}
                                                    />
                                                    <span>Require Selection (at least one must be chosen)</span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== MULTIPLE CHOICE FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'multiple_choice' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Selection Rules</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.validateSelectedOption !== false}
                                                        onChange={(e) => setValidation('validateSelectedOption', e.target.checked)}
                                                    />
                                                    <span>Validate Selected Option (reject unknown values)</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.requireSelection || false}
                                                        onChange={(e) => setValidation('requireSelection', e.target.checked)}
                                                    />
                                                    <span>Require Selection (at least one must be chosen)</span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== LINEAR SCALE FIELD CONFIG ========== */}
                                    {local.fieldType === 'linear_scale' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title" style={{ color: '#FCD34D' }}>⭐ Scale Configuration</h4>

                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    <div className="form-group" style={{ flex: 1, minWidth: 100 }}>
                                                        <label className="form-label">Min Value</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={uiConfig.scaleMin ?? 1}
                                                            min={0}
                                                            onChange={(e) => setUiCfg('scaleMin', e.target.value === '' ? '' : Number(e.target.value))}
                                                            placeholder="1"
                                                        />
                                                    </div>
                                                    <div className="form-group" style={{ flex: 1, minWidth: 100 }}>
                                                        <label className="form-label">Max Value</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={uiConfig.scaleMax ?? 5}
                                                            min={1}
                                                            onChange={(e) => setUiCfg('scaleMax', e.target.value === '' ? '' : Number(e.target.value))}
                                                            placeholder="5"
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    <div className="form-group" style={{ flex: 1 }}>
                                                        <label className="form-label">Left Label (Min)</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            value={uiConfig.labelLeft || ''}
                                                            onChange={(e) => setUiCfg('labelLeft', e.target.value)}
                                                            placeholder="e.g. Poor"
                                                        />
                                                    </div>
                                                    <div className="form-group" style={{ flex: 1 }}>
                                                        <label className="form-label">Right Label (Max)</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            value={uiConfig.labelRight || ''}
                                                            onChange={(e) => setUiCfg('labelRight', e.target.value)}
                                                            placeholder="e.g. Excellent"
                                                        />
                                                    </div>
                                                </div>

                                                <h4 className="validation-group-title" style={{ marginTop: 16 }}>Scale Validation</h4>
                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                    <div className="form-group" style={{ flex: 1, minWidth: 100 }}>
                                                        <label className="form-label">Min Allowed</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.minScale ?? ''}
                                                            onChange={(e) => setValidation('minScale', e.target.value === '' ? '' : Number(e.target.value))}
                                                            placeholder={`e.g. ${uiConfig.scaleMin ?? 1}`}
                                                        />
                                                    </div>
                                                    <div className="form-group" style={{ flex: 1, minWidth: 100 }}>
                                                        <label className="form-label">Max Allowed</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxScale ?? ''}
                                                            onChange={(e) => setValidation('maxScale', e.target.value === '' ? '' : Number(e.target.value))}
                                                            placeholder={`e.g. ${uiConfig.scaleMax ?? 5}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== MULTIPLE CHOICE GRID VALIDATIONS ========== */}
                                    {local.fieldType === 'multiple_choice_grid' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Grid Rules</h4>

                                                <label className="form-checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!validationRules.eachRowRequired}
                                                        onChange={(e) => setValidation('eachRowRequired', e.target.checked || '')}
                                                    />
                                                    <span>Each Row Required (every row must have a selection)</span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== STAR RATING VALIDATIONS ========== */}
                                    {local.fieldType === 'star_rating' && (
                                        <div className="validation-group">
                                            <h4 className="validation-group-title" style={{ color: '#FCD34D' }}>★ Star Rating Rules</h4>
                                            <p className="form-help" style={{ marginBottom: 0 }}>
                                                Scale is fixed 1–5. Backend always validates the submitted value is between 1 and 5.
                                                Use the Required toggle above to make this field mandatory.
                                            </p>
                                        </div>
                                    )}

                                    {/* ========== CHECKBOX GRID VALIDATIONS ========== */}
                                    {local.fieldType === 'checkbox_grid' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Checkbox Grid Rules</h4>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!validationRules.eachRowRequired}
                                                        onChange={(e) => setValidation('eachRowRequired', e.target.checked || '')}
                                                    />
                                                    <span>Each Row Required (every row must have at least one selection)</span>
                                                </label>

                                                <div className="form-row" style={{ marginTop: 10 }}>
                                                    <div className="form-group">
                                                        <label className="form-label">Min Per Row</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.minPerRow || ''}
                                                            onChange={(e) => setValidation('minPerRow', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 1"
                                                            min="1"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Max Per Row</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxPerRow || ''}
                                                            onChange={(e) => setValidation('maxPerRow', e.target.value ? parseInt(e.target.value) : '')}
                                                            placeholder="e.g. 3"
                                                            min="1"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* ========== FILE FIELD VALIDATIONS ========== */}
                                    {local.fieldType === 'file' && (
                                        <>
                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Basic</h4>

                                                <div className="form-group">
                                                    <label className="form-label">Upload Type</label>
                                                    <select
                                                        className="form-input"
                                                        value={validationRules.singleOrMultiple || 'single'}
                                                        onChange={(e) => setValidation('singleOrMultiple', e.target.value)}
                                                    >
                                                        <option value="single">Single File</option>
                                                        <option value="multiple">Multiple Files</option>
                                                    </select>
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Allowed Extensions</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={validationRules.allowedExtensions || ''}
                                                        onChange={(e) => setValidation('allowedExtensions', e.target.value)}
                                                        placeholder="e.g. .jpg,.png,.pdf"
                                                    />
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Allowed MIME Types</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={validationRules.mimeTypeValidation || ''}
                                                        onChange={(e) => setValidation('mimeTypeValidation', e.target.value)}
                                                        placeholder="e.g. image/jpeg,image/png"
                                                    />
                                                </div>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Size Limits</h4>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="form-label">Max File Size (MB)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.maxFileSize || ''}
                                                            onChange={(e) => setValidation('maxFileSize', e.target.value ? parseFloat(e.target.value) : '')}
                                                            placeholder="e.g. 5"
                                                            min="0"
                                                            step="0.1"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Min File Size (KB)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.minFileSize || ''}
                                                            onChange={(e) => setValidation('minFileSize', e.target.value ? parseFloat(e.target.value) : '')}
                                                            placeholder="e.g. 10"
                                                            min="0"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Total Size Limit (MB)</label>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={validationRules.totalSizeLimit || ''}
                                                        onChange={(e) => setValidation('totalSizeLimit', e.target.value ? parseFloat(e.target.value) : '')}
                                                        placeholder="e.g. 20"
                                                        min="0"
                                                    />
                                                </div>
                                            </div>

                                            <div className="validation-group">
                                                <h4 className="validation-group-title">Content Rules</h4>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="form-label">Min Image Width (px)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.imageDimensionCheck?.minWidth || ''}
                                                            onChange={(e) => {
                                                                const dimensions = { ...validationRules.imageDimensionCheck };
                                                                if (e.target.value) {
                                                                    dimensions.minWidth = parseInt(e.target.value);
                                                                    setValidation('imageDimensionCheck', dimensions);
                                                                } else {
                                                                    delete dimensions.minWidth;
                                                                    if (Object.keys(dimensions).length === 0) {
                                                                        setValidation('imageDimensionCheck', '');
                                                                    } else {
                                                                        setValidation('imageDimensionCheck', dimensions);
                                                                    }
                                                                }
                                                            }}
                                                            placeholder="e.g. 800"
                                                            min="1"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Max Image Width (px)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.imageDimensionCheck?.maxWidth || ''}
                                                            onChange={(e) => {
                                                                const dimensions = { ...validationRules.imageDimensionCheck };
                                                                if (e.target.value) {
                                                                    dimensions.maxWidth = parseInt(e.target.value);
                                                                    setValidation('imageDimensionCheck', dimensions);
                                                                } else {
                                                                    delete dimensions.maxWidth;
                                                                    if (Object.keys(dimensions).length === 0) {
                                                                        setValidation('imageDimensionCheck', '');
                                                                    } else {
                                                                        setValidation('imageDimensionCheck', dimensions);
                                                                    }
                                                                }
                                                            }}
                                                            placeholder="e.g. 1920"
                                                            min="1"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="form-label">Min Image Height (px)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.imageDimensionCheck?.minHeight || ''}
                                                            onChange={(e) => {
                                                                const dimensions = { ...validationRules.imageDimensionCheck };
                                                                if (e.target.value) {
                                                                    dimensions.minHeight = parseInt(e.target.value);
                                                                    setValidation('imageDimensionCheck', dimensions);
                                                                } else {
                                                                    delete dimensions.minHeight;
                                                                    if (Object.keys(dimensions).length === 0) {
                                                                        setValidation('imageDimensionCheck', '');
                                                                    } else {
                                                                        setValidation('imageDimensionCheck', dimensions);
                                                                    }
                                                                }
                                                            }}
                                                            placeholder="e.g. 600"
                                                            min="1"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label className="form-label">Max Image Height (px)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={validationRules.imageDimensionCheck?.maxHeight || ''}
                                                            onChange={(e) => {
                                                                const dimensions = { ...validationRules.imageDimensionCheck };
                                                                if (e.target.value) {
                                                                    dimensions.maxHeight = parseInt(e.target.value);
                                                                    setValidation('imageDimensionCheck', dimensions);
                                                                } else {
                                                                    delete dimensions.maxHeight;
                                                                    if (Object.keys(dimensions).length === 0) {
                                                                        setValidation('imageDimensionCheck', '');
                                                                    } else {
                                                                        setValidation('imageDimensionCheck', dimensions);
                                                                    }
                                                                }
                                                            }}
                                                            placeholder="e.g. 1080"
                                                            min="1"
                                                        />
                                                    </div>
                                                </div>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.fileNameValidation || false}
                                                        onChange={(e) => setValidation('fileNameValidation', e.target.checked)}
                                                    />
                                                    <span>File Name No Special Characters</span>
                                                </label>

                                                <label className="form-checkbox-row compact">
                                                    <input
                                                        type="checkbox"
                                                        checked={validationRules.duplicateFilePrevention || false}
                                                        onChange={(e) => setValidation('duplicateFilePrevention', e.target.checked)}
                                                    />
                                                    <span>Prevent Duplicate File Names</span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                </div>
                            )}
                        </div>

                        {/* Required, Disabled, Read-only row */}
                        <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                            <label className="form-checkbox-row" style={{ margin: 0 }}>
                                <input
                                    id="cfg-required"
                                    type="checkbox"
                                    checked={local.required}
                                    onChange={(e) => set('required', e.target.checked)}
                                />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Required</div>
                                    <div className="form-help" style={{ marginTop: 0 }}>Cannot be empty</div>
                                </div>
                            </label>

                            <label className="form-checkbox-row" style={{ margin: 0 }}>
                                <input
                                    id="cfg-disabled"
                                    type="checkbox"
                                    checked={local.disabled || false}
                                    onChange={(e) => set('disabled', e.target.checked)}
                                />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Disabled</div>
                                    <div className="form-help" style={{ marginTop: 0 }}>Greyed out & unselectable</div>
                                </div>
                            </label>

                            <label className="form-checkbox-row" style={{ margin: 0 }}>
                                <input
                                    id="cfg-readonly"
                                    type="checkbox"
                                    checked={local.readOnly || false}
                                    onChange={(e) => set('readOnly', e.target.checked)}
                                />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Read-only</div>
                                    <div className="form-help" style={{ marginTop: 0 }}>Cannot be edited</div>
                                </div>
                            </label>
                        </div>

                        {/* ── Conditional Rules ─────────────────────────── */}
                        <div className="validation-section" style={{ marginTop: 8 }}>
                            <button
                                type="button"
                                className="validation-toggle"
                                onClick={() => setRulesExpanded(r => !r)}
                            >
                                <span className="toggle-icon">{rulesExpanded ? '▼' : '▶'}</span>
                                <span className="toggle-label">Conditional Rules</span>
                                {local.rulesJson && (
                                    <span className="validation-count" style={{
                                        background: 'rgba(99,102,241,0.15)',
                                        color: '#818cf8',
                                        border: '1px solid rgba(99,102,241,0.3)',
                                    }}>active</span>
                                )}
                            </button>

                            {rulesExpanded && (
                                <div className="validation-content">
                                    <RuleBuilder
                                        fields={enrichedSiblings}
                                        rulesJson={local.rulesJson || null}
                                        onChange={json => set('rulesJson', json)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20 }}>
                        {saveError && (
                            <div className="error-message" style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
                                {saveError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                                style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }}
                            >
                                {saving ? 'Saving...' : 'Save Field'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Existing Dropdown Picker (modal) */}
            {pickerOpen && (
                <ExistingDropdownPicker
                    fieldType={local.fieldType}
                    onPick={handlePickOptions}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </>
    );
}

/** Convert a label string into a valid snake_case field key */
function toKey(label = '') {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '') // SRS Decision 4.1: Strip non-alphanumeric (except _)
        .substring(0, 100) || '';   // SRS Decision 4.1: max 100 characters
}

/**
 * ExistingDropdownPicker — shows all unique shared_options rows (by sharedOptionsId).
 * Groups by sharedOptionsId so duplicates never appear.
 * Fetches actual options from GET /api/shared-options/{id}.
 * On selection: passes back the sharedOptionsId so all forms sharing it stay in sync.
 */
function ExistingDropdownPicker({ onPick, onClose }) {
    const [rows, setRows] = useState([]); // [{sharedOptionsId, options:[{label,value}]}]
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [picking, setPicking] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        getForms()
            .then(async (forms) => {
                if (cancelled || !Array.isArray(forms)) return;

                // Fetch all form details in parallel
                const results = await Promise.allSettled(
                    forms.map(f => getForm(f.id).then(detail => detail.fields || []))
                );

                if (cancelled) return;

                // Collect all unique sharedOptionsIds from dropdown/radio fields
                const seenIds = new Set();
                const uniqueIds = [];
                results.forEach(r => {
                    if (r.status !== 'fulfilled') return;
                    r.value
                        .filter(fld => (fld.fieldType === 'dropdown' || fld.fieldType === 'radio' || fld.fieldType === 'multiple_choice') && fld.sharedOptionsId)
                        .forEach(fld => {
                            if (!seenIds.has(fld.sharedOptionsId)) {
                                seenIds.add(fld.sharedOptionsId);
                                uniqueIds.push(fld.sharedOptionsId);
                            }
                        });
                });

                // Fetch actual options for each unique sharedOptionsId
                const optionResults = await Promise.allSettled(
                    uniqueIds.map(id => getSharedOptions(id).then(shared => ({
                        sharedOptionsId: id,
                        options: (() => {
                            try {
                                const parsed = JSON.parse(shared.optionsJson || '[]');
                                return parsed.map(o => typeof o === 'string' ? o : (o.label || o.value || ''));
                            } catch { return []; }
                        })(),
                    })))
                );

                if (cancelled) return;

                const loaded = optionResults
                    .filter(r => r.status === 'fulfilled')
                    .map(r => r.value)
                    .filter(r => r.options.length > 0);

                setRows(loaded);
            })
            .catch(err => { if (!cancelled) setError(err.message || 'Failed to load'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, []);

    const handlePick = (row) => {
        setPicking(row.sharedOptionsId);
        const optionsJson = JSON.stringify(row.options.map(o => ({ label: o, value: o })));
        onPick({ optionsJson, sharedOptionsId: row.sharedOptionsId });
    };

    return (
        <div className="picker-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="picker-box">
                <div className="picker-header">
                    <span className="picker-title">📋 Use Existing Dropdown</span>
                    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <div className="picker-body">
                    {loading && (
                        <div className="picker-state"><span className="spinner" /> Loading…</div>
                    )}
                    {!loading && error && (
                        <div className="picker-state picker-error">⚠ {error}</div>
                    )}
                    {!loading && !error && rows.length === 0 && (
                        <div className="picker-state picker-empty">
                            No shared option lists found. Save a dropdown field first.
                        </div>
                    )}
                    {!loading && !error && rows.map((row) => (
                        <button
                            key={row.sharedOptionsId}
                            className="picker-field-row"
                            onClick={() => handlePick(row)}
                            disabled={picking !== null}
                            title={`Link to shared options: ${row.options.join(', ')}`}
                        >
                            <span className="picker-field-icon">▼</span>
                            <span className="picker-field-label" style={{ flex: 1, textAlign: 'left' }}>
                                {row.options.join(' · ')}
                            </span>
                            <span className="picker-field-badge">
                                {picking === row.sharedOptionsId ? '…' : `${row.options.length}`}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
