import React from 'react';
import Input from '../../ui/Input';
import Button from '../../ui/Button';

/**
 * GridSettings — configuration for matrix-style fields (rows x columns).
 */
export default function GridSettings({ gridRows, gridColumns, setGridRows, setGridColumns }) {
    const handleAddRow = () => setGridRows([...gridRows, `Row ${gridRows.length + 1}`]);
    const handleAddCol = () => setGridColumns([...gridColumns, `Column ${gridColumns.length + 1}`]);

    return (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-right-4 duration-500">
            
            {/* Rows Section */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Rows (Questions)</h4>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black">{gridRows.length} Total</span>
                </div>
                <div className="flex flex-col gap-3">
                    {gridRows.map((row, idx) => (
                        <div key={idx} className="flex gap-2 group/row">
                            <Input 
                                size="sm" 
                                value={row} 
                                onChange={(e) => {
                                    const next = [...gridRows];
                                    next[idx] = e.target.value;
                                    setGridRows(next);
                                }} 
                                placeholder="Group / Category Name"
                            />
                            <button 
                                className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-100 dark:border-white/5 text-gray-400 hover:text-rose-500 hover:bg-rose-500/5 opacity-0 group-hover/row:opacity-100 transition-all"
                                onClick={() => setGridRows(gridRows.filter((_, i) => i !== idx))}
                                disabled={gridRows.length <= 1}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <Button variant="ghost" size="xs" onClick={handleAddRow}>+ Add Growing Row</Button>
                </div>
            </div>

            <div className="h-[1px] bg-gradient-to-r from-gray-200 dark:from-white/5 to-transparent" />

            {/* Columns Section */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500">Columns (Scale Options)</h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[9px] font-black">{gridColumns.length} Total</span>
                </div>
                <div className="flex flex-col gap-3">
                    {gridColumns.map((col, idx) => (
                        <div key={idx} className="flex gap-2 group/col">
                            <Input 
                                size="sm" 
                                value={col} 
                                onChange={(e) => {
                                    const next = [...gridColumns];
                                    next[idx] = e.target.value;
                                    setGridColumns(next);
                                }} 
                                placeholder="Option Level (e.g. Good)"
                            />
                            <button 
                                className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-100 dark:border-white/5 text-gray-400 hover:text-rose-500 hover:bg-rose-500/5 opacity-0 group-hover/col:opacity-100 transition-all"
                                onClick={() => setGridColumns(gridColumns.filter((_, i) => i !== idx))}
                                disabled={gridColumns.length <= 2}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <Button variant="ghost" size="xs" onClick={handleAddCol} className="text-amber-500 hover:bg-amber-500/5">+ Add Level Column</Button>
                </div>
            </div>

            {/* Matrix Result Summary */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-dashed border-gray-200 dark:border-white/10">
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter mb-2">Matrix Calculation</p>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 leading-relaxed">
                    This setup will create a <span className="text-primary font-bold">{gridRows.length}x{gridColumns.length}</span> grid. 
                    Users will be presented with <span className="text-primary font-bold">{gridRows.length}</span> individual questions.
                </p>
            </div>
        </div>
    );
}
