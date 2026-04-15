import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getForms, getForm, createSharedOptions, updateSharedOptions, getSharedOptions } from '../../services/api';
import { toastError } from '../../services/toast';
import RuleBuilder from './RuleBuilder';
import CalculationEngine from '../../services/CalculationEngine';
import { Settings, Zap, CheckCircle, GitBranch, Calculator, X, FileText, Type, Hash, Calendar, ChevronRight, Info, ShieldCheck, HelpCircle, Baseline, ToggleLeft, ToggleRight, Layout, Sliders, Code, Eye, List, MoreHorizontal, AlignLeft, AlignCenter, User } from 'lucide-react';

/**
 * Helper component for the new premium blocks (Switch + Text + Icon)
 */
function ConfigBlock({ icon: Icon, title, active, onChange, subtext }) {
    return (
        <div className={`cfg-block-v2 ${active ? 'active' : ''}`}>
            <div className="cfg-block-info">
                <div className="cfg-block-icon">
                    <Icon size={18} />
                </div>
                <div className="cfg-block-text-wrap">
                    <div className="cfg-block-text">{title}</div>
                    {subtext && <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{subtext}</div>}
                </div>
            </div>
            <label className="cfg-switch">
                <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked)} />
                <span className="cfg-slider"></span>
            </label>
        </div>
    );
}

const toKey = (label = '') => (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '') 
    .substring(0, 100) || '';

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
    const [activePillar, setActivePillar] = useState('properties'); // 'properties' or 'logic'
    const [activeTab, setActiveTab] = useState('general'); // sub-tabs

    const ICONS = {
        text: Type,
        number: Hash,
        date: Calendar,
        dropdown: List,
        radio: List,
        boolean: CheckCircle,
        file: Layout,
        multiple_choice: List,
        multiple_choice_grid: Sliders,
        checkbox_grid: Sliders,
        linear_scale: MoreHorizontal,
        star_rating: MoreHorizontal
    };
    const FieldIcon = ICONS[local.fieldType] || FileText;

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

    const TABS = [
        { id: 'general', label: 'General', icon: <Settings size={14} /> },
        { id: 'validation', label: 'Validation', icon: <CheckCircle size={14} /> },
        { id: 'conditional', label: 'Conditional', icon: <GitBranch size={14} /> },
    ];

    // Only show Calculation tab for supported types
    const supportsCalculation = (local.fieldType === 'text' || local.fieldType === 'number' || local.fieldType === 'date' || local.fieldType === 'date_time');
    if (supportsCalculation) {
        TABS.push({ id: 'calculation', label: 'Calculation', icon: <Calculator size={14} /> });
    }

    const renderGeneralTab = () => (
        <div className="cfg-body-v2 animate-in">
            {/* Essential Settings (Top Blocks) */}
            <div className="cfg-section">
                <div className="cfg-section-label"><Sliders size={12} /> BASIC CONFIGURATION</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <ConfigBlock 
                        icon={ShieldCheck} 
                        title="Required Field" 
                        subtext="User must provide a value before submitting"
                        active={local.required} 
                        onChange={(val) => {
                            if (val) {
                                // If enabling Required, disable Read-only and Disabled
                                set('required', true);
                                set('readOnly', false);
                                set('disabled', false);
                            } else {
                                set('required', false);
                            }
                        }}
                    />
                    <ConfigBlock 
                        icon={Eye} 
                        title="Make Read-only" 
                        subtext="Field is visible but cannot be modified"
                        active={local.readOnly} 
                        onChange={(val) => {
                            if (val) {
                                // If enabling Read-only, disable Required and Disabled
                                set('readOnly', true);
                                set('required', false);
                                set('disabled', false);
                            } else {
                                set('readOnly', false);
                            }
                        }}
                    />
                    <ConfigBlock
                        icon={ToggleLeft}
                        title="Disabled Field"
                        subtext="Field is grayed out and cannot be interacted with"
                        active={local.disabled}
                        onChange={(val) => {
                            if (val) {
                                // If enabling Disabled, disable Required and Read-only
                                set('disabled', true);
                                set('required', false);
                                set('readOnly', false);
                            } else {
                                set('disabled', false);
                            }
                        }}
                    />
                </div>
            </div>

            {/* Label & Key */}
            <div className="cfg-section">
                <div className="cfg-section-label"><Type size={12} /> IDENTIFICATION</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="cfg-input-wrap">
                        <Baseline className="cfg-field-icon" size={20} />
                        <input
                            className="cfg-field-input"
                            value={local.label || ''}
                            onChange={handleLabelChange}
                            placeholder="Field Label (e.g. Your Name)"
                            autoFocus
                        />
                    </div>
                    <div className="cfg-input-wrap">
                        <Code className="cfg-field-icon" size={20} />
                        <input
                            className="cfg-field-input"
                            value={local.fieldKey}
                            onChange={(e) => set('fieldKey', toKey(e.target.value))}
                            placeholder="Field Key (e.g. your_name)"
                        />
                    </div>
                </div>
            </div>

            {/* Content Helpers */}
            {(local.fieldType === 'text' || local.fieldType === 'number' || local.fieldType === 'date' || local.fieldType === 'date_time') && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><AlignLeft size={12} /> TEXT ASSISTANCE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="cfg-input-wrap">
                            <Info className="cfg-field-icon" size={20} />
                            <input
                                className="cfg-field-input"
                                value={local.placeholder || ''}
                                onChange={(e) => set('placeholder', e.target.value)}
                                placeholder="Placeholder hint..."
                            />
                        </div>
                        <div className="cfg-input-wrap">
                            <HelpCircle className="cfg-field-icon" size={20} />
                            <input
                                className="cfg-field-input"
                                value={local.defaultValue || ''}
                                onChange={(e) => set('defaultValue', e.target.value)}
                                placeholder="Default value (optional)"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Dropdown Selection Type */}
            {local.fieldType === 'dropdown' && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><List size={12} /> SELECTION MODE</div>
                    <div className="cfg-block-v2">
                        <div className="cfg-block-text" style={{ fontSize: '13px' }}>Allow Multiple Selections</div>
                        <label className="cfg-switch">
                            <input
                                type="checkbox"
                                checked={!!uiConfig.multiple}
                                onChange={(e) => setUiCfg('multiple', e.target.checked)}
                            />
                            <span className="cfg-slider"></span>
                        </label>
                    </div>
                </div>
            )}

            {/* Options Editor */}
            {(local.fieldType === 'dropdown' || local.fieldType === 'radio' || local.fieldType === 'multiple_choice') && (
                <div className="cfg-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div className="cfg-section-label" style={{ margin: 0 }}><List size={12} /> OPTIONS LIST</div>
                        <button
                            type="button"
                            className="btn-toolbar-v2"
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                            onClick={() => setPickerOpen(true)}
                        >
                            Use Shared List
                        </button>
                    </div>

                    {sharedOptionsId && (
                        <div style={{ padding: '12px', marginBottom: 16, borderRadius: 16, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.1)', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#3B82F6', fontWeight: 600 }}>Connected to Shared Data</span>
                            <button type="button" onClick={() => setSharedOptionsId(null)} style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 700, cursor: 'pointer' }}>Unlink</button>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {options.map((opt, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8 }}>
                                <div className="cfg-input-wrap" style={{ flex: 1, padding: '0 16px' }}>
                                    <input 
                                        className="cfg-field-input" 
                                        style={{ height: '48px', fontSize: '13px' }}
                                        value={opt} 
                                        onChange={(e) => handleOptionEdit(idx, e.target.value)} 
                                        placeholder={`Option ${idx + 1}`} 
                                    />
                                </div>
                                <button type="button" className="row-icon-btn" onClick={() => setOptions(options.filter((_, i) => i !== idx))} disabled={options.length <= 1}>×</button>
                            </div>
                        ))}
                        <button 
                            type="button" 
                            className="btn-toolbar-v2" 
                            style={{ width: '100%', height: '44px', marginTop: '4px' }}
                            onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
                        >
                            + Add New Option
                        </button>
                    </div>
                </div>
            )}

            {/* Grid Config */}
            {(local.fieldType === 'multiple_choice_grid' || local.fieldType === 'checkbox_grid') && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><Layout size={12} /> GRID ARCHITECTURE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div>
                            <p className="cfg-section-label" style={{ fontSize: 10, opacity: 0.7 }}>Rows (Questions)</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {gridRows.map((row, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 8 }}>
                                        <div className="cfg-input-wrap" style={{ flex: 1, padding: '0 16px' }}>
                                            <input className="cfg-field-input" style={{ height: '44px' }} value={row} onChange={(e) => { const updated = [...gridRows]; updated[idx] = e.target.value; setGridRows(updated); }} />
                                        </div>
                                        <button type="button" className="row-icon-btn" onClick={() => setGridRows(gridRows.filter((_, i) => i !== idx))} disabled={gridRows.length <= 1}>×</button>
                                    </div>
                                ))}
                                <button type="button" className="btn-toolbar-v2" onClick={() => setGridRows([...gridRows, `Row ${gridRows.length + 1}`])}>+ Add Question</button>
                            </div>
                        </div>
                        <div>
                            <p className="cfg-section-label" style={{ fontSize: 10, opacity: 0.7 }}>Columns (Rating/Choices)</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {gridColumns.map((col, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 8 }}>
                                        <div className="cfg-input-wrap" style={{ flex: 1, padding: '0 16px' }}>
                                            <input className="cfg-field-input" style={{ height: '44px' }} value={col} onChange={(e) => { const updated = [...gridColumns]; updated[idx] = e.target.value; setGridColumns(updated); }} />
                                        </div>
                                        <button type="button" className="row-icon-btn" onClick={() => setGridColumns(gridColumns.filter((_, i) => i !== idx))} disabled={gridColumns.length <= 2}>×</button>
                                    </div>
                                ))}
                                <button type="button" className="btn-toolbar-v2" onClick={() => setGridColumns([...gridColumns, `Option ${gridColumns.length + 1}`])}>+ Add Option</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Star Rating info */}
            {local.fieldType === 'star_rating' && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><MoreHorizontal size={12} /> RATING SETTINGS</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)', borderRadius: '20px' }}>
                        <div style={{ fontSize: '24px', color: '#F59E0B' }}>★★★★★</div>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>5-Star Rating System</div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Users can rate on a fixed scale from 1 to 5 stars.</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderValidationTab = () => (
        <div className="cfg-body-v2 animate-in">
            {/* 1. TEXT FIELDS */}
            {local.fieldType === 'text' && (
                <>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><AlignLeft size={12} /> LENGTH & FORMAT</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.minLength || ''} onChange={(e) => setValidation('minLength', e.target.value)} placeholder="Min Length" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.maxLength || ''} onChange={(e) => setValidation('maxLength', e.target.value)} placeholder="Max Length" />
                                </div>
                            </div>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.exactLength || ''} onChange={(e) => setValidation('exactLength', e.target.value)} placeholder="Exact Length (e.g. 10)" />
                            </div>
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><AlignLeft size={12} /> TEXT HYGIENE & REGULATORY</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock 
                                icon={Baseline} 
                                title="Trim Whitespace" 
                                subtext="Automatically clean leading/trailing spaces"
                                active={validationRules.trimWhitespace || false} 
                                onChange={(v) => setValidation('trimWhitespace', v)} 
                            />
                            <ConfigBlock 
                                icon={Baseline} 
                                title="No Leading/Trailing Spaces" 
                                subtext="Reject if value has spaces at start or end"
                                active={validationRules.noLeadingTrailingSpaces || false} 
                                onChange={(v) => setValidation('noLeadingTrailingSpaces', v)} 
                            />
                            <ConfigBlock 
                                icon={Baseline} 
                                title="No Consecutive Spaces" 
                                subtext="Block multiple spaces between words"
                                active={validationRules.noConsecutiveSpaces || false} 
                                onChange={(v) => setValidation('noConsecutiveSpaces', v)} 
                            />
                            <ConfigBlock 
                                icon={ShieldCheck} 
                                title="No Special Characters" 
                                subtext="Allow only alphabets and numbers"
                                active={validationRules.noSpecialCharacters || false} 
                                onChange={(v) => {
                                    setValidation('noSpecialCharacters', v);
                                    if(v) {
                                        setValidation('alphabetOnly', false);
                                        setValidation('alphanumericOnly', false);
                                    }
                                }} 
                            />
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Info size={12} /> CHARACTER RESTRICTIONS</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="cfg-input-wrap">
                                <Code className="cfg-field-icon" size={20} />
                                <input 
                                    className="cfg-field-input" 
                                    value={validationRules.allowSpecificSpecialCharacters || ''} 
                                    onChange={(e) => setValidation('allowSpecificSpecialCharacters', e.target.value)} 
                                    placeholder="Allow specific special chars (Whitelist)" 
                                />
                            </div>
                            <div className="cfg-input-wrap">
                                <Code className="cfg-field-icon" size={20} />
                                <input 
                                    className="cfg-field-input" 
                                    value={validationRules.restrictSpecificSpecialCharacters || ''} 
                                    onChange={(e) => setValidation('restrictSpecificSpecialCharacters', e.target.value)} 
                                    placeholder="Restrict specific special chars (Blacklist)" 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><ShieldCheck size={12} /> SECURITY & INTEGRITY</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock 
                                icon={Zap} 
                                title="Password Strength" 
                                subtext="Require Upper + Lower + Digit + Special"
                                active={validationRules.passwordStrength || false} 
                                onChange={(v) => setValidation('passwordStrength', v)} 
                            />
                            <ConfigBlock 
                                icon={GitBranch} 
                                title="Unique Value (DB Check)" 
                                subtext="Ensure this value is not already submitted"
                                active={validationRules.unique || false} 
                                onChange={(v) => setValidation('unique', v)} 
                            />
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><ShieldCheck size={12} /> OTHER RESTRICTIONS</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock icon={Baseline} title="Alphabet Only" active={validationRules.alphabetOnly || false} onChange={(v) => setValidation('alphabetOnly', v)} />
                            <ConfigBlock icon={Hash} title="Alphanumeric" active={validationRules.alphanumericOnly || false} onChange={(v) => setValidation('alphanumericOnly', v)} />
                            <ConfigBlock icon={ShieldCheck} title="Email Format" active={validationRules.emailOnly || false} onChange={(v) => setValidation('emailOnly', v)} />
                            <ConfigBlock icon={FileText} title="URL / Link" active={validationRules.urlOnly || false} onChange={(v) => setValidation('urlOnly', v)} />
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Info size={12} /> PATTERN & ERROR MESSAGE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="cfg-input-wrap">
                                <Code className="cfg-field-icon" size={20} />
                                <input className="cfg-field-input" value={local.validationRegex || ''} onChange={(e) => set('validationRegex', e.target.value)} placeholder="Regex Pattern" />
                            </div>
                            <div className="cfg-input-wrap">
                                <HelpCircle className="cfg-field-icon" size={20} />
                                <input className="cfg-field-input" value={validationRules.message || ''} onChange={(e) => setValidation('message', e.target.value)} placeholder="Custom Error Message" />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* 2. NUMBER FIELDS */}
            {local.fieldType === 'number' && (
                <>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Hash size={12} /> PRECISION & HYGIENE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock 
                                icon={Sliders} 
                                title="Allow Zero" 
                                subtext="Enable zero as a valid input"
                                active={validationRules.zeroAllowed !== false} 
                                onChange={(v) => setValidation('zeroAllowed', v)} 
                            />
                            <ConfigBlock 
                                icon={X} 
                                title="No Leading Zero" 
                                subtext="Reject numbers starting with 0 (e.g. 0123)"
                                active={validationRules.noLeadingZero || false} 
                                onChange={(v) => setValidation('noLeadingZero', v)} 
                            />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.maxDigits || ''} onChange={(e) => setValidation('maxDigits', e.target.value)} placeholder="Max Digits" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.maxDecimalPlaces || ''} onChange={(e) => setValidation('maxDecimalPlaces', e.target.value)} placeholder="Max Decimals" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Hash size={12} /> CONSTRAINTS & RANGE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock icon={Sliders} title="Allow Decimal" active={validationRules.decimalAllowed !== false} onChange={(v) => setValidation('decimalAllowed', v)} />
                            <ConfigBlock icon={Hash} title="Integer Only" active={validationRules.integerOnly || false} onChange={(v) => setValidation('integerOnly', v)} />
                            <ConfigBlock icon={ShieldCheck} title="Positive Only" active={validationRules.positiveOnly || false} onChange={(v) => setValidation('positiveOnly', v)} />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.minValue || ''} onChange={(e) => setValidation('minValue', e.target.value)} placeholder="Min Value" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.maxValue || ''} onChange={(e) => setValidation('maxValue', e.target.value)} placeholder="Max Value" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Layout size={12} /> SPECIAL FORMATS</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock 
                                icon={ShieldCheck} 
                                title="Phone Number Format" 
                                subtext="Enforce 10-digit number"
                                active={validationRules.phoneNumberFormat || false} 
                                onChange={(v) => setValidation('phoneNumberFormat', v)} 
                            />
                            <div className="cfg-input-wrap">
                                <ShieldCheck className="cfg-field-icon" size={20} />
                                <input type="number" className="cfg-field-input" value={validationRules.otpFormat || ''} onChange={(e) => setValidation('otpFormat', e.target.value)} placeholder="OTP Fixed Length (e.g. 6)" />
                            </div>
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Zap size={12} /> BUSINESS LOGIC</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock 
                                icon={GitBranch} 
                                title="Unique Number (DB Check)" 
                                subtext="Ensure no duplicate values in table"
                                active={validationRules.uniqueNumber || false} 
                                onChange={(v) => setValidation('uniqueNumber', v)} 
                            />
                            <ConfigBlock 
                                icon={User} 
                                title="Age Validation (≥ 18)" 
                                subtext="Verify user is 18 years or older"
                                active={validationRules.ageValidation || false} 
                                onChange={(v) => setValidation('ageValidation', v)} 
                            />
                            <ConfigBlock 
                                icon={Baseline} 
                                title="Currency Format" 
                                subtext="Max 2 decimals, non-negative"
                                active={validationRules.currencyFormat || false} 
                                onChange={(v) => setValidation('currencyFormat', v)} 
                            />
                            <ConfigBlock 
                                icon={Hash} 
                                title="Percentage Range (0-100)" 
                                subtext="Enforce value between 0 and 100"
                                active={validationRules.percentageRange || false} 
                                onChange={(v) => setValidation('percentageRange', v)} 
                            />
                        </div>
                    </div>
                </>
            )}

            {/* 3. DATE/TIME FIELDS */}
            {(local.fieldType === 'date' || local.fieldType === 'time' || local.fieldType === 'date_time') && (
                <>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Calendar size={12} /> BOUNDS & HYGIENE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock icon={Sliders} title="Past Only" active={validationRules.pastOnly || false} onChange={(v) => setValidation('pastOnly', v)} />
                            <ConfigBlock icon={Sliders} title="Future Only" active={validationRules.futureOnly || false} onChange={(v) => setValidation('futureOnly', v)} />
                            {local.fieldType === 'date' && (
                                <ConfigBlock 
                                    icon={X} 
                                    title="No Weekend" 
                                    subtext="Block Saturday and Sunday selections"
                                    active={validationRules.noWeekend || false} 
                                    onChange={(v) => setValidation('noWeekend', v)} 
                                />
                            )}
                        </div>
                    </div>

                    {local.fieldType === 'date' && (
                        <div className="cfg-section">
                            <div className="cfg-section-label"><User size={12} /> AGE & ELIGIBILITY</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.age18Plus || ''} onChange={(e) => setValidation('age18Plus', e.target.value)} placeholder="Min Age (e.g. 18)" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.notOlderThanXYears || ''} onChange={(e) => setValidation('notOlderThanXYears', e.target.value)} placeholder="Max Age (Years)" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Sliders size={12} /> RANGE</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                             <div className="cfg-input-wrap">
                                <input 
                                    type={local.fieldType === 'date' ? 'date' : local.fieldType === 'time' ? 'time' : 'datetime-local'} 
                                    className="cfg-field-input" 
                                    value={validationRules.minDate || validationRules.minTime || validationRules.minDateTime || ''} 
                                    onChange={(e) => setValidation(local.fieldType === 'date' ? 'minDate' : local.fieldType === 'time' ? 'minTime' : 'minDateTime', e.target.value)} 
                                />
                             </div>
                             <div className="cfg-input-wrap">
                                <input 
                                    type={local.fieldType === 'date' ? 'date' : local.fieldType === 'time' ? 'time' : 'datetime-local'} 
                                    className="cfg-field-input" 
                                    value={validationRules.maxDate || validationRules.maxTime || validationRules.maxDateTime || ''} 
                                    onChange={(e) => setValidation(local.fieldType === 'date' ? 'maxDate' : local.fieldType === 'time' ? 'maxTime' : 'maxDateTime', e.target.value)} 
                                />
                             </div>
                        </div>
                    </div>

                    {local.fieldType === 'date' && (
                        <div className="cfg-section">
                            <div className="cfg-section-label"><Layout size={12} /> DISPLAY & FORMAT</div>
                            <div className="cfg-input-wrap">
                                <select 
                                    className="cfg-field-input" 
                                    value={validationRules.customFormat || 'YYYY-MM-DD'} 
                                    onChange={(e) => setValidation('customFormat', e.target.value)}
                                >
                                    <option value="YYYY-MM-DD">YYYY-MM-DD (Default)</option>
                                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                </select>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* 4. FILE VALIDATIONS */}
            {local.fieldType === 'file' && (
                <>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Layout size={12} /> UPLOAD SETTINGS</div>
                        <div className="cfg-input-wrap">
                            <select className="cfg-field-input" value={validationRules.singleOrMultiple || 'single'} onChange={(e) => setValidation('singleOrMultiple', e.target.value)}>
                                <option value="single">Single File</option>
                                <option value="multiple">Multiple Files</option>
                            </select>
                        </div>
                        <div className="cfg-input-wrap" style={{ marginTop: '16px' }}>
                            <FileText className="cfg-field-icon" size={20} />
                            <input className="cfg-field-input" value={validationRules.allowedExtensions || ''} onChange={(e) => setValidation('allowedExtensions', e.target.value)} placeholder="Allowed Extensions (e.g. .jpg,.png,.pdf)" />
                        </div>
                        <div className="cfg-input-wrap" style={{ marginTop: '16px' }}>
                            <Info className="cfg-field-icon" size={20} />
                            <input className="cfg-field-input" value={validationRules.mimeTypeValidation || ''} onChange={(e) => setValidation('mimeTypeValidation', e.target.value)} placeholder="Allowed MIME Types (e.g. image/jpeg, application/pdf)" />
                        </div>
                    </div>
                    
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Hash size={12} /> SIZE & COUNT LIMITS</div>
                        <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '12px' }}>Global top limit is 5 MB per file due to server restrictions.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.minFileSize || ''} onChange={(e) => setValidation('minFileSize', e.target.value)} placeholder="Min File Size (KB)" />
                            </div>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.maxFileSize || ''} max={5} onChange={(e) => setValidation('maxFileSize', Math.min(e.target.value, 5))} placeholder="Max File Size (MB)" />
                            </div>
                        </div>
                        {validationRules.singleOrMultiple === 'multiple' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '16px' }}>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.minFileCount || ''} onChange={(e) => setValidation('minFileCount', e.target.value)} placeholder="Min Files" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.maxFileCount || ''} onChange={(e) => setValidation('maxFileCount', e.target.value)} placeholder="Max Files" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.totalSizeLimit || ''} onChange={(e) => setValidation('totalSizeLimit', e.target.value)} placeholder="Total Size (MB)" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Layout size={12} /> CONTENT RULES (IMAGES)</div>
                        <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '12px' }}>Define dimension limits if expecting image uploads.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.imageDimensionCheck?.minWidth || ''} onChange={(e) => setValidation('imageDimensionCheck', { ...validationRules.imageDimensionCheck, minWidth: e.target.value })} placeholder="Min Width (px)" />
                            </div>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.imageDimensionCheck?.maxWidth || ''} onChange={(e) => setValidation('imageDimensionCheck', { ...validationRules.imageDimensionCheck, maxWidth: e.target.value })} placeholder="Max Width (px)" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.imageDimensionCheck?.minHeight || ''} onChange={(e) => setValidation('imageDimensionCheck', { ...validationRules.imageDimensionCheck, minHeight: e.target.value })} placeholder="Min Height (px)" />
                            </div>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.imageDimensionCheck?.maxHeight || ''} onChange={(e) => setValidation('imageDimensionCheck', { ...validationRules.imageDimensionCheck, maxHeight: e.target.value })} placeholder="Max Height (px)" />
                            </div>
                        </div>
                    </div>

                    <div className="cfg-section">
                        <div className="cfg-section-label"><Code size={12} /> FILE NAME RULES</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ConfigBlock 
                                icon={Baseline} 
                                title="No Special Characters" 
                                subtext="Enforce alphanumeric filenames (^[A-Za-z0-9._-]+$)"
                                active={validationRules.fileNameValidation || false} 
                                onChange={(v) => setValidation('fileNameValidation', v)} 
                            />
                            <ConfigBlock 
                                icon={ShieldCheck} 
                                title="Prevent Duplicate File Names" 
                                subtext="Reject upload if a file with this exact name already exists"
                                active={validationRules.duplicateFilePrevention || false} 
                                onChange={(v) => setValidation('duplicateFilePrevention', v)} 
                            />
                        </div>
                    </div>
                </>
            )}

            {/* 5. SELECTION FIELDS (Checkbox / Multiple Choice) */}
            {(local.fieldType === 'checkbox' || local.fieldType === 'multiple_choice' || (local.fieldType === 'dropdown' && uiConfig.multiple)) && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><List size={12} /> SELECTION LIMITS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="cfg-input-wrap">
                            <input type="number" className="cfg-field-input" value={validationRules.minSelections || ''} onChange={(e) => setValidation('minSelections', e.target.value)} placeholder="Min Selections" />
                        </div>
                        <div className="cfg-input-wrap">
                            <input type="number" className="cfg-field-input" value={validationRules.maxSelections || ''} onChange={(e) => setValidation('maxSelections', e.target.value)} placeholder="Max Selections" />
                        </div>
                    </div>
                </div>
            )}

            {/* 6. GRID FIELDS */}
            {(local.fieldType === 'multiple_choice_grid' || local.fieldType === 'checkbox_grid') && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><Layout size={12} /> GRID VALIDATION</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <ConfigBlock 
                            icon={CheckCircle} 
                            title="Each Row Required" 
                            subtext="Require a response for every row in the grid"
                            active={validationRules.eachRowRequired || false} 
                            onChange={(v) => setValidation('eachRowRequired', v)} 
                        />
                        {local.fieldType === 'checkbox_grid' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.minPerRow || ''} onChange={(e) => setValidation('minPerRow', e.target.value)} placeholder="Min per Row" />
                                </div>
                                <div className="cfg-input-wrap">
                                    <input type="number" className="cfg-field-input" value={validationRules.maxPerRow || ''} onChange={(e) => setValidation('maxPerRow', e.target.value)} placeholder="Max per Row" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 7. BOOLEAN VALIDATION */}
            {local.fieldType === 'boolean' && (
                <>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Layout size={12} /> INITIAL STATE</div>
                        <ConfigBlock 
                            icon={CheckCircle} 
                            title="Default Checked" 
                            subtext="Field will be checked by default for new submissions"
                            active={local.defaultValue === 'true'} 
                            onChange={(val) => set('defaultValue', val ? 'true' : 'false')} 
                        />
                    </div>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><CheckCircle size={12} /> BOOLEAN RULES</div>
                        <ConfigBlock 
                            icon={ShieldCheck} 
                            title="Must Be True (Terms & Conditions)" 
                            subtext="User must check this box to proceed with submission"
                            active={validationRules.mustBeTrue || false} 
                            onChange={(v) => setValidation('mustBeTrue', v)} 
                        />
                    </div>
                </>
            )}

            {/* 8. LINEAR SCALE VALIDATION */}
            {local.fieldType === 'linear_scale' && (
                <>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Layout size={12} /> SCALE LAYOUT</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <p className="cfg-section-label" style={{ fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>Min Value</p>
                                    <div className="cfg-input-wrap" style={{ padding: '0 16px' }}>
                                        <input type="number" className="cfg-field-input" value={uiConfig.scaleMin ?? 1} onChange={(e) => setUiCfg('scaleMin', e.target.value === '' ? '' : Number(e.target.value))} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <p className="cfg-section-label" style={{ fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>Max Value</p>
                                    <div className="cfg-input-wrap" style={{ padding: '0 16px' }}>
                                        <input type="number" className="cfg-field-input" value={uiConfig.scaleMax ?? 5} onChange={(e) => setUiCfg('scaleMax', e.target.value === '' ? '' : Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <p className="cfg-section-label" style={{ fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>Left Label</p>
                                    <div className="cfg-input-wrap" style={{ padding: '0 16px' }}>
                                        <input type="text" className="cfg-field-input" value={uiConfig.labelLeft || ''} onChange={(e) => setUiCfg('labelLeft', e.target.value)} placeholder="e.g. Poor" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <p className="cfg-section-label" style={{ fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>Right Label</p>
                                    <div className="cfg-input-wrap" style={{ padding: '0 16px' }}>
                                        <input type="text" className="cfg-field-input" value={uiConfig.labelRight || ''} onChange={(e) => setUiCfg('labelRight', e.target.value)} placeholder="e.g. Excellent" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Sliders size={12} /> SCALE CONSTRAINTS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.minScale || ''} onChange={(e) => setValidation('minScale', e.target.value)} placeholder="Min Allowed" />
                            </div>
                            <div className="cfg-input-wrap">
                                <input type="number" className="cfg-field-input" value={validationRules.maxScale || ''} onChange={(e) => setValidation('maxScale', e.target.value)} placeholder="Max Allowed" />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* General Placeholder for other types */}
            {!['text', 'number', 'date', 'time', 'date_time', 'file', 'checkbox', 'multiple_choice', 'dropdown', 'multiple_choice_grid', 'checkbox_grid', 'boolean', 'linear_scale'].includes(local.fieldType) && (
                <div className="cfg-section">
                    <div className="cfg-section-label"><ShieldCheck size={12} /> RULES</div>
                    <p style={{ fontSize: '12px', color: '#64748B' }}>No specific logic rules for this field type yet.</p>
                </div>
            )}
        </div>
    );

    const renderConditionalTab = () => (
        <div className="cfg-body-v2 animate-in">
            <div className="cfg-section">
                <div className="cfg-section-label"><GitBranch size={12} /> VISIBILITY LOGIC</div>
                <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '20px' }}>
                    Show this field only if the following conditions are met.
                </p>
                <div style={{ background: '#F8FAFC', padding: '24px', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                    <RuleBuilder
                        fields={enrichedSiblings}
                        rulesJson={local.rulesJson || null}
                        onChange={json => set('rulesJson', json)}
                    />
                </div>
            </div>
        </div>
    );

    const renderCalculationTab = () => {
        const insertAtCursor = (val) => {
            const input = document.getElementById('formula-input');
            if (!input) return;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            const before = text.substring(0, start);
            const after = text.substring(end, text.length);
            const newVal = before + val + after;
            set('formulaExpression', newVal);
            setTimeout(() => {
                input.focus();
                input.setSelectionRange(start + val.length, start + val.length);
            }, 10);
        };

        return (
            <div className="cfg-body-v2 animate-in">
                <div className="cfg-section">
                    <ConfigBlock 
                        icon={Calculator} 
                        title="Enable Calculation" 
                        subtext="Calculate value automatically from other fields"
                        active={local.isCalculated} 
                        onChange={(v) => set('isCalculated', v)} 
                    />
                </div>

                {local.isCalculated && (
                    <div className="cfg-section">
                        <div className="cfg-section-label"><Code size={12} /> FORMULA EXPRESSION</div>
                        <div className="cfg-input-wrap" style={{ alignItems: 'flex-start', padding: '20px' }}>
                            <textarea
                                id="formula-input"
                                className="cfg-field-input"
                                style={{ height: '120px', width: '100%', resize: 'none', lineHeight: '1.6' }}
                                value={local.formulaExpression || ''}
                                onChange={(e) => set('formulaExpression', e.target.value)}
                                placeholder="e.g. quantity * unit_price"
                            />
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <p className="cfg-section-label" style={{ fontSize: '10px', opacity: 0.7 }}>OPERATORS & FUNCTIONS</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {['+', '-', '*', '/', '(', ')', '%'].map(op => (
                                        <button key={op} type="button" onClick={() => insertAtCursor(op)} className="btn-toolbar-v2" style={{ width: '40px' }}>{op}</button>
                                    ))}
                                    {['SUM(', 'AVG(', 'MIN(', 'MAX(', 'ROUND('].map(fn => (
                                        <button key={fn} type="button" onClick={() => insertAtCursor(fn)} className="btn-toolbar-v2">{fn}</button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="cfg-section-label" style={{ fontSize: '10px', opacity: 0.7 }}>FIELD REFERENCES</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {siblingFields.map(f => (
                                        <button key={f.fieldKey} type="button" onClick={() => insertAtCursor(f.fieldKey)} className="btn-toolbar-v2" style={{ background: '#F1F5F9', color: '#1E293B' }}>{f.fieldKey}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {local.formulaExpression && (
                            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59,130,246,0.05)', borderRadius: '16px', border: '1px solid rgba(59,130,246,0.1)' }}>
                                <div className="cfg-section-label" style={{ fontSize: '10px', color: '#3B82F6', marginBottom: '8px' }}>DEPENDENCIES</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {CalculationEngine.extractDependencies(local.formulaExpression).map(dep => (
                                        <span key={dep} style={{ padding: '4px 10px', background: '#ffffff', color: '#3B82F6', borderRadius: '8px', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(59,130,246,0.1)' }}>{dep}</span>
                                    )) || <span style={{ color: '#94A3B8', fontSize: '12px' }}>No dependencies found</span>}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="cfg-overlay-v2" onClick={onClose} />
            <motion.div
                className="cfg-panel-v2"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
                {/* Header */}
                <div className="cfg-header-v2">
                    <div className="cfg-header-icon-wrap">
                        {React.createElement(ICONS[local.fieldType] || FileText, { size: 20 })}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div className="cfg-header-title">Field Configuration</div>
                        <div className="cfg-header-subtitle">{local.fieldType.replace(/_/g, ' ').toUpperCase()} • {local.fieldKey}</div>
                    </div>
                    <button className="cfg-close-btn-v2" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Pillar Navigation */}
                <div className="cfg-nav-v2">
                    <button 
                        className={`cfg-nav-item-v2 ${activePillar === 'properties' ? 'active' : ''}`}
                        onClick={() => {
                            setActivePillar('properties');
                            setActiveTab('general');
                        }}
                    >
                        <Settings size={18} /> PROPERTIES
                    </button>
                    <button 
                        className={`cfg-nav-item-v2 ${activePillar === 'logic' ? 'active' : ''}`}
                        onClick={() => {
                            setActivePillar('logic');
                            setActiveTab('validation');
                        }}
                    >
                        <Zap size={18} /> LOGIC
                    </button>
                </div>

                {/* Sub-tabs (Conditional based on Pillar) */}
                <div className="cfg-tabs-v2">
                    {activePillar === 'properties' ? (
                        <>
                            <button className={`cfg-tab-v2 ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
                            <button className={`cfg-tab-v2 ${activeTab === 'calculation' ? 'active' : ''}`} onClick={() => setActiveTab('calculation')}>Calculation {local.isCalculated && '•'}</button>
                        </>
                    ) : (
                        <>
                            <button className={`cfg-tab-v2 ${activeTab === 'validation' ? 'active' : ''}`} onClick={() => setActiveTab('validation')}>Validation</button>
                            <button className={`cfg-tab-v2 ${activeTab === 'conditional' ? 'active' : ''}`} onClick={() => setActiveTab('conditional')}>Visibility {local.rulesJson && '•'}</button>
                        </>
                    )}
                </div>

                {/* Modal Body Container */}
                <div className="cfg-body-container">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.2 }}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                        >
                            {activeTab === 'general' && renderGeneralTab()}
                            {activeTab === 'validation' && renderValidationTab()}
                            {activeTab === 'conditional' && renderConditionalTab()}
                            {activeTab === 'calculation' && renderCalculationTab()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="cfg-footer-v2">
                    {saveError && <div style={{ color: '#ef4444', fontSize: 13, marginRight: 'auto', fontWeight: 500 }}>{saveError}</div>}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                        <button className="cfg-btn-secondary" onClick={onClose}>Cancel</button>
                        <button 
                            className="cfg-btn-primary" 
                            onClick={handleSave} 
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </motion.div>

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
