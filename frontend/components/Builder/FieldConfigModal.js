import { useState, useEffect } from 'react';

/**
 * FieldConfigModal — Slide-up modal to edit all field properties.
 * Controlled component: receives field state, notifies parent on save.
 */
export default function FieldConfigModal({ field, onSave, onClose }) {
    const [local, setLocal] = useState({ ...field });
    const [options, setOptions] = useState(() => {
        // Parse optionsJson if present
        if (field.optionsJson) {
            try {
                return JSON.parse(field.optionsJson);
            } catch {
                return ['Option 1', 'Option 2'];
            }
        }
        return ['Option 1', 'Option 2'];
    });

    // Parse validation_json if present
    const [validationRules, setValidationRules] = useState(() => {
        if (field.validationJson) {
            try {
                return JSON.parse(field.validationJson);
            } catch {
                return {};
            }
        }
        return {};
    });

    // State for collapsible validation section
    const [validationExpanded, setValidationExpanded] = useState(false);

    // Sync if field prop changes (e.g. user opens a different field)
    useEffect(() => {
        setLocal({ ...field });
        if (field.optionsJson) {
            try {
                setOptions(JSON.parse(field.optionsJson));
            } catch {
                setOptions(['Option 1', 'Option 2']);
            }
        } else {
            setOptions(['Option 1', 'Option 2']);
        }

        // Sync validation rules
        if (field.validationJson) {
            try {
                setValidationRules(JSON.parse(field.validationJson));
            } catch {
                setValidationRules({});
            }
        } else {
            setValidationRules({});
        }
    }, [field]);

    const set = (key, value) => setLocal((prev) => ({ ...prev, [key]: value }));

    // Update validation rules (remove empty/false values)
    const setValidation = (key, value) => {
        setValidationRules(prev => {
            const updated = { ...prev };
            // Remove if value is empty, false, null, or undefined
            if (value === '' || value === false || value === null || value === undefined) {
                delete updated[key];
            } else {
                updated[key] = value;
            }
            return updated;
        });
    };

    // Auto-generate fieldKey from label (only when the user hasn't manually set it)
    const handleLabelChange = (e) => {
        const label = e.target.value;
        set('label', label);
        // Only auto-derive key if the current key was auto-derived (or empty)
        const autoKey = toKey(field.label);
        if (!local.fieldKey || local.fieldKey === toKey(field.label) || local.fieldKey === autoKey) {
            set('fieldKey', toKey(label));
        }
    };

    const handleSave = () => {
        if (!local.label.trim()) return;
        if (!local.fieldKey.trim()) {
            set('fieldKey', toKey(local.label));
        }
        const updatedField = {
            ...local,
            fieldKey: local.fieldKey || toKey(local.label)
        };

        // Add optionsJson for dropdown/radio
        if (local.fieldType === 'dropdown' || local.fieldType === 'radio') {
            updatedField.optionsJson = JSON.stringify(options.filter(o => o.trim()));
        }

        // Add validation_json (only if rules exist)
        if (Object.keys(validationRules).length > 0) {
            updatedField.validationJson = JSON.stringify(validationRules);
        } else {
            updatedField.validationJson = null;
        }

        onSave(updatedField);
    };

    const TYPE_ICONS = { text: '𝐓', number: '#', date: '📅', boolean: '✓', dropdown: '▼', radio: '◉', file: '📎' };

    return (
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

                    {/* Default Value (hidden for boolean) */}
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

                    {/* Validation Regex (text / number only) */}
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

                    {/* Options Editor (dropdown / radio only) */}
                    {(local.fieldType === 'dropdown' || local.fieldType === 'radio') && (
                        <div className="form-group">
                            <label className="form-label">Options</label>
                            {options.map((opt, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <input
                                        className="form-input"
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...options];
                                            newOpts[idx] = e.target.value;
                                            setOptions(newOpts);
                                        }}
                                        placeholder={`Option ${idx + 1}`}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                                        disabled={options.length <= 1}
                                        title="Remove option"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
                            >
                                + Add Option
                            </button>
                            <p className="form-help">Define the list of choices for this field</p>
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
