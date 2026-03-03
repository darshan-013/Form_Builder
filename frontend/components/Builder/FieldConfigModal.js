import { useState, useEffect } from 'react';
import { getForms, getForm, createSharedOptions, updateSharedOptions, getSharedOptions } from '../../services/api';

/**
 * FieldConfigModal — Slide-up modal to edit all field properties.
 * Options for dropdown/radio are loaded from the shared_options table via sharedOptionsId.
 * "Use Existing Dropdown" lets admin link to another field's shared_options row.
 */
export default function FieldConfigModal({ field, onSave, onClose }) {
    const [local, setLocal] = useState({ ...field });
    const [options, setOptions] = useState(['Option 1', 'Option 2']);

    const [validationRules, setValidationRules] = useState(() => {
        if (field.validationJson) {
            try { return JSON.parse(field.validationJson); } catch { return {}; }
        }
        return {};
    });

    const [validationExpanded, setValidationExpanded] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [sharedOptionsId, setSharedOptionsId] = useState(field.sharedOptionsId || null);
    const [unlinkNotice, setUnlinkNotice] = useState(false);

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

        try {
            let finalSharedOptionsId = sharedOptionsId || null;

            if (local.fieldType === 'dropdown' || local.fieldType === 'radio') {
                const filtered = options.filter(o => o.trim());
                const optionsJson = JSON.stringify(filtered.map(o => ({ label: o, value: o })));

                if (finalSharedOptionsId) {
                    // Already linked — update the existing shared_options row
                    await updateSharedOptions(finalSharedOptionsId, optionsJson);
                } else {
                    // New standalone field — create a shared_options row now
                    const created = await createSharedOptions(optionsJson);
                    finalSharedOptionsId = created.id;
                }
            }

            const updatedField = {
                ...local,
                fieldKey: local.fieldKey || toKey(local.label),
                sharedOptionsId: finalSharedOptionsId,
                // Never send optionsJson in the field payload — it lives in shared_options only
                optionsJson: undefined,
            };

            updatedField.validationJson = Object.keys(validationRules).length > 0
                ? JSON.stringify(validationRules) : null;

            onSave(updatedField);
        } catch (err) {
            setSaveError('Failed to save options: ' + (err.message || 'Unknown error'));
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
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
                            value={local.label}
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
                    {local.fieldType !== 'boolean' && (
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

                    {/* Validation Regex */}
                    {(local.fieldType === 'text' || local.fieldType === 'number') && (
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
                    )}

                    {/* ── Options Editor (dropdown / radio only) ── */}
                    {(local.fieldType === 'dropdown' || local.fieldType === 'radio') && (
                        <div className="form-group">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <label className="form-label" style={{ margin: 0 }}>Options</label>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setPickerOpen(true)}
                                    title="Copy options from an existing form's dropdown or radio field"
                                >
                                    📋 Use Existing Dropdown
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
                                    <div className="validation-group">
                                        <h4 className="validation-group-title">Dropdown Rules</h4>

                                        <div className="form-group">
                                            <label className="form-label">Default "Select" Text Not Allowed</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={validationRules.defaultNotAllowed || ''}
                                                onChange={(e) => setValidation('defaultNotAllowed', e.target.value)}
                                                placeholder="e.g. -- Select --"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Multi-Select Limit</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={validationRules.multiSelectLimit || ''}
                                                onChange={(e) => setValidation('multiSelectLimit', e.target.value ? parseInt(e.target.value) : '')}
                                                placeholder="e.g. 3"
                                                min="1"
                                            />
                                        </div>

                                        <label className="form-checkbox-row compact">
                                            <input
                                                type="checkbox"
                                                checked={validationRules.optionExists || false}
                                                onChange={(e) => setValidation('optionExists', e.target.checked)}
                                            />
                                            <span>Validate Option Exists</span>
                                        </label>
                                    </div>
                                )}

                                {/* ========== RADIO FIELD VALIDATIONS ========== */}
                                {local.fieldType === 'radio' && (
                                    <div className="validation-group">
                                        <h4 className="validation-group-title">Radio Rules</h4>

                                        <label className="form-checkbox-row compact">
                                            <input
                                                type="checkbox"
                                                checked={validationRules.validateSelectedOption || false}
                                                onChange={(e) => setValidation('validateSelectedOption', e.target.checked)}
                                            />
                                            <span>Validate Selected Option</span>
                                        </label>
                                    </div>
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

                    {/* Required */}
                    <label className="form-checkbox-row">
                        <input
                            id="cfg-required"
                            type="checkbox"
                            checked={local.required}
                            onChange={(e) => set('required', e.target.checked)}
                        />
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Required field</div>
                            <div className="form-help" style={{ marginTop: 0 }}>Submission blocked if this field is empty</div>
                        </div>
                    </label>
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} id="modal-save-btn">
                        Apply Changes
                    </button>
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
function ExistingDropdownPicker({ onPick, onClose }) {
    const [rows,    setRows]    = useState([]); // [{sharedOptionsId, options:[{label,value}]}]
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
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
                        .filter(fld => (fld.fieldType === 'dropdown' || fld.fieldType === 'radio') && fld.sharedOptionsId)
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
