import React from 'react';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import CalculationEngine from '../../../services/CalculationEngine';

/**
 * CalculationSettings — Visual formula builder for computed fields.
 */
export default function CalculationSettings({ local, set, siblingFields }) {
    const formulaError = local.isCalculated && local.formulaExpression
        ? CalculationEngine.validateFormula(local.fieldKey || '__this__', local.formulaExpression, siblingFields)
        : null;

    const insertAtCursor = (text) => {
        const el = document.getElementById('fcm-formula-input');
        const cur = local.formulaExpression || '';
        const start = el?.selectionStart ?? cur.length;
        const end = el?.selectionEnd ?? cur.length;
        const chunk = '+-*/'.includes(text) && text.length === 1 ? ` ${text} ` : text;
        const next = cur.slice(0, start) + chunk + cur.slice(end);
        set('formulaExpression', next);
    };

    const detectedDeps = local.isCalculated && local.formulaExpression
        ? CalculationEngine.extractDependencies(local.formulaExpression, siblingFields.map(f => f.fieldKey))
        : [];

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Toggle */}
            <label className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/20 cursor-pointer group">
                <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={local.isCalculated || false}
                        onChange={(e) => set('isCalculated', e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-white/10 rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors">Enable Formula Logic</span>
                    <span className="text-[10px] text-gray-500">Automatically compute value based on other fields.</span>
                </div>
            </label>

            {local.isCalculated && (
                <div className="flex flex-col gap-6 p-6 rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5">
                    
                    {/* Input */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Expression</label>
                            {local.formulaExpression && (
                                <button onClick={() => set('formulaExpression', '')} className="text-[10px] text-rose-500 hover:underline">Clear</button>
                            )}
                        </div>
                        <Input 
                            id="fcm-formula-input"
                            value={local.formulaExpression || ''}
                            onChange={(e) => set('formulaExpression', e.target.value)}
                            placeholder="e.g. price * quantity"
                            className="font-mono text-sm tracking-tight"
                            error={formulaError}
                        />
                        {formulaError && <p className="text-[10px] text-rose-500 font-medium">⚠ {formulaError}</p>}
                    </div>

                    {/* Operators */}
                    <div className="flex flex-wrap gap-2">
                        {['+', '-', '*', '/', '(', ')'].map(op => (
                            <button 
                                key={op}
                                onClick={() => insertAtCursor(op)}
                                className="w-10 h-10 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 flex items-center justify-center font-bold text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                            >
                                {op === '*' ? '×' : op === '/' ? '÷' : op}
                            </button>
                        ))}
                    </div>

                    {/* Siblings */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Available Source Fields</label>
                        <div className="flex flex-wrap gap-2">
                            {siblingFields.filter(f => f.fieldType === 'number' || f.fieldType === 'text').map(f => (
                                <button 
                                    key={f.id}
                                    onClick={() => insertAtCursor(f.fieldKey)}
                                    className={`
                                        flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all
                                        ${detectedDeps.includes(f.fieldKey) ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 hover:border-primary/50'}
                                    `}
                                >
                                    <span className="opacity-50 font-mono text-[9px] uppercase tracking-tighter">{f.fieldType.slice(0,3)}</span>
                                    {f.fieldKey}
                                </button>
                            ))}
                        </div>
                    </div>

                     {/* Logic Flags */}
                     <div className="flex items-center gap-6 pt-4 border-t border-gray-100 dark:border-white/5">
                        {local.fieldType === 'number' && (
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Decimal Precision</label>
                                <Input type="number" size="sm" className="w-20" value={local.precision ?? 2} onChange={e => set('precision', parseInt(e.target.value) || 0)} />
                            </div>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer group">
                             <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20" checked={local.lockAfterCalculation || false} onChange={e => set('lockAfterCalculation', e.target.checked)} />
                             <span className="text-[11px] font-bold text-gray-600 group-hover:text-primary">Lock Field (Read-only)</span>
                        </label>
                    </div>

                </div>
            )}
        </div>
    );
}
