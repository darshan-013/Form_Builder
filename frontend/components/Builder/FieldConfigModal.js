import { useState, useEffect } from 'react';
import { getForms, getForm, createSharedOptions, updateSharedOptions, getSharedOptions } from '../../services/api';
import RuleBuilder from './RuleBuilder';
import CalculationEngine from '../../services/CalculationEngine';
import GeneralSettings from './ConfigSections/GeneralSettings';
import ValidationSettings from './ConfigSections/ValidationSettings';
import OptionsSettings from './ConfigSections/OptionsSettings';
import CalculationSettings from './ConfigSections/CalculationSettings';
import GridSettings from './ConfigSections/GridSettings';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';


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
    
    // Tab system for sidebar
    const [activeTab, setActiveTab] = useState('general');

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
        if (!local.label.trim()) return;
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

    const isChoice = local.fieldType === 'dropdown' || local.fieldType === 'radio' || local.fieldType === 'multiple_choice';
    const isGrid = local.fieldType === 'multiple_choice_grid' || local.fieldType === 'checkbox_grid';
    const isCalculatable = (local.fieldType === 'text' || local.fieldType === 'number' || local.fieldType === 'date');

    const tabs = [
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'validation', label: 'Validation', icon: '🛡️' },
        ...(isChoice ? [{ id: 'options', label: 'Options', icon: '📋' }] : []),
        ...(isCalculatable ? [{ id: 'calculations', label: 'Logic', icon: '🧮' }] : []),
        ...(isGrid ? [{ id: 'grid', label: 'Matrix', icon: '⊞' }] : []),
        { id: 'logic', label: 'Advanced', icon: '⚡' },
    ];

    const TYPE_ICONS = { 
        text: '𝐓', 
        number: '#', 
        date: '📅', 
        boolean: '✓', 
        dropdown: '▼', 
        radio: '◉', 
        file: '📎',
        multiple_choice: '☑',
        multiple_choice_grid: '⊞',
        checkbox_grid: '⊞',
        star_rating: '★',
        linear_scale: '📏'
    };

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10 pointer-events-none">
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
                    onClick={onClose}
                />

                {/* Modal Container */}
                <div className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden flex flex-col pointer-events-auto animate-in zoom-in-95 duration-300">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between px-10 py-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-[1.5rem] bg-primary/10 flex items-center justify-center text-primary text-3xl shadow-inner-glow">
                                {TYPE_ICONS[local.fieldType] || '⚡'}
                            </div>
                            <div className="flex flex-col gap-1">
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                                    Configure {local.label || 'Field'}
                                </h2>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" size="sm" className="bg-primary/5 text-primary border-primary/20">
                                        {local.fieldType.replace('_', ' ')}
                                    </Badge>
                                    <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">ID: {field.id?.slice(0, 8)}</span>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="w-12 h-12 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                        >
                            <span className="text-3xl">&times;</span>
                        </button>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Sidebar Navigation */}
                        <div className="w-64 border-r border-gray-100 dark:border-white/5 p-6 flex flex-col gap-2 bg-gray-50/30 dark:bg-white/[0.01]">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-bold transition-all duration-300
                                        ${activeTab === tab.id 
                                            ? 'bg-primary text-white shadow-lg shadow-primary/20 translate-x-1' 
                                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'}
                                    `}
                                >
                                    <span className="text-lg">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Content Scrollable */}
                        <div className="flex-1 overflow-y-auto p-12 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
                            <div className="max-w-2xl mx-auto">
                                {activeTab === 'general' && (
                                    <GeneralSettings 
                                        local={local} 
                                        set={set} 
                                        onLabelChange={handleLabelChange} 
                                    />
                                )}
                                
                                {activeTab === 'validation' && (
                                    <ValidationSettings 
                                        local={local} 
                                        validationRules={validationRules} 
                                        setValidation={setValidation} 
                                    />
                                )}

                                {activeTab === 'options' && (
                                    <OptionsSettings 
                                        options={options}
                                        sharedOptionsId={sharedOptionsId}
                                        unlinkNotice={unlinkNotice}
                                        setOptions={setOptions}
                                        setSharedOptionsId={setSharedOptionsId}
                                        setUnlinkNotice={setUnlinkNotice}
                                        setPickerOpen={setPickerOpen}
                                    />
                                )}

                                {activeTab === 'calculations' && (
                                    <CalculationSettings 
                                        local={local} 
                                        set={set} 
                                        siblingFields={siblingFields} 
                                    />
                                )}

                                {activeTab === 'grid' && (
                                    <GridSettings 
                                        gridRows={gridRows}
                                        gridColumns={gridColumns}
                                        setGridRows={setGridRows}
                                        setGridColumns={setGridColumns}
                                    />
                                )}

                                {activeTab === 'logic' && (
                                     <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Advanced Logic</h4>
                                        <div className="grid grid-cols-2 gap-6">
                                            <Card className="p-4 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold">Visibility Rules</span>
                                                    <Badge className={local.rulesJson ? 'bg-primary' : 'bg-gray-100 dark:bg-white/5'}>
                                                        {local.rulesJson ? 'Active' : 'Empty'}
                                                    </Badge>
                                                </div>
                                                <p className="text-[10px] text-gray-500">Show or hide this field based on other field values.</p>
                                                <Button size="xs" variant="outline" onClick={() => setRulesExpanded(!rulesExpanded)}>
                                                    {rulesExpanded ? 'Hide Rule Builder' : 'Open Rule Builder'}
                                                </Button>
                                            </Card>

                                            <Card className="p-4 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold">Field Permissions</span>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                        <input type="checkbox" className="w-4 h-4 rounded" checked={local.required} onChange={e => set('required', e.target.checked)} />
                                                        <span className="text-[11px] font-bold text-gray-500 group-hover:text-primary">Required</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                        <input type="checkbox" className="w-4 h-4 rounded" checked={local.disabled} onChange={e => set('disabled', e.target.checked)} />
                                                        <span className="text-[11px] font-bold text-gray-500 group-hover:text-primary">Disabled</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                        <input type="checkbox" className="w-4 h-4 rounded" checked={local.readOnly} onChange={e => set('readOnly', e.target.checked)} />
                                                        <span className="text-[11px] font-bold text-gray-500 group-hover:text-primary">Read Only</span>
                                                    </label>
                                                </div>
                                            </Card>
                                        </div>

                                        {rulesExpanded && (
                                            <div className="mt-4 p-6 rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5">
                                                <RuleBuilder
                                                    fields={enrichedSiblings}
                                                    rulesJson={local.rulesJson || null}
                                                    onChange={json => set('rulesJson', json)}
                                                />
                                            </div>
                                        )}
                                     </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-10 py-8 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02] flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            {saveError && (
                                <p className="text-xs font-bold text-rose-500 bg-rose-500/10 px-4 py-2 rounded-xl animate-bounce">
                                    ⚠ {saveError}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <Button weight="bold" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                            <Button weight="black" onClick={handleSave} disabled={saving || !local.label.trim()}>
                                {saving ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Saving Changes...
                                    </div>
                                ) : 'Update Field Properties'}
                            </Button>
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
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 60) || '';
}

/**
 * ExistingDropdownPicker — shows all unique shared_options rows (by sharedOptionsId).
 * Groups by sharedOptionsId so duplicates never appear.
 * Fetches actual options from GET /api/shared-options/{id}.
 * On selection: passes back the sharedOptionsId so all forms sharing it stay in sync.
 */
function ExistingDropdownPicker({ fieldType, onPick, onClose }) {
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
