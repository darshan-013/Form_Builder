import React from 'react';
import Input from '../../ui/Input';

/**
 * GeneralSettings — Top-level field metadata (Label, Key, Default, Regex).
 */
export default function GeneralSettings({ local, set, onLabelChange }) {
    const toKey = (label = '') => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 60) || '';

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Label */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400" htmlFor="cfg-label">
                    Field Label <span className="text-rose-500">*</span>
                </label>
                <Input
                    id="cfg-label"
                    value={local.label}
                    onChange={onLabelChange}
                    placeholder="e.g. Full Name"
                    autoFocus
                />
                <p className="text-[10px] text-gray-400">The primary title of the field visible to users.</p>
            </div>

            {/* Field Key */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400" htmlFor="cfg-key">
                    Field Key (Database Pointer)
                </label>
                <Input
                    id="cfg-key"
                    value={local.fieldKey}
                    onChange={(e) => set('fieldKey', toKey(e.target.value))}
                    placeholder="e.g. full_name"
                />
                <p className="text-[10px] text-gray-400 italic">Snake_case identifier used for exports and logic. Auto-generated from label.</p>
            </div>

            {/* Default Value */}
            {local.fieldType !== 'boolean' && local.fieldType !== 'field_group' && (
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400" htmlFor="cfg-default">
                        Default Value
                    </label>
                    <Input
                        id="cfg-default"
                        type={local.fieldType === 'number' ? 'number' : local.fieldType === 'date' ? 'date' : 'text'}
                        value={local.defaultValue || ''}
                        onChange={(e) => set('defaultValue', e.target.value)}
                        placeholder="Optional initial value"
                    />
                </div>
            )}

            {/* Validation Regex */}
            {(local.fieldType === 'text' || local.fieldType === 'number') && local.fieldType !== 'field_group' && (
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400" htmlFor="cfg-regex">
                        Validation Regex (Advanced)
                    </label>
                    <Input
                        id="cfg-regex"
                        value={local.validationRegex || ''}
                        onChange={(e) => set('validationRegex', e.target.value)}
                        placeholder="e.g. ^[A-Za-z ]+$"
                        className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-gray-400">Standard RegExp for pattern matching. Leave blank for no restriction.</p>
                </div>
            )}
        </div>
    );
}
