import React from 'react';
import Input from '../../ui/Input';
import Button from '../../ui/Button';

/**
 * OptionsSettings — handles dropdown, radio, and multiple choice options.
 * Manages shared options linking and unlinking.
 */
export default function OptionsSettings({ 
    options, 
    sharedOptionsId, 
    unlinkNotice, 
    setOptions, 
    setSharedOptionsId, 
    setUnlinkNotice, 
    setPickerOpen 
}) {
    const handleOptionEdit = (idx, val) => {
        const newOpts = [...options];
        newOpts[idx] = val;
        setOptions(newOpts);
    };

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Choice Options</h4>
                <Button 
                    variant="ghost" 
                    size="xs" 
                    className="text-[10px]" 
                    onClick={() => setPickerOpen(true)}
                >
                    📋 Use Existing
                </Button>
            </div>

            {/* Shared Banner */}
            {sharedOptionsId && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20 text-[11px] text-primary">
                    <span className="flex items-center gap-2">
                        <span className="animate-pulse">🔗</span> Shared list — edits sync across forms
                    </span>
                    <button 
                        onClick={() => { setSharedOptionsId(null); setUnlinkNotice(true); setTimeout(() => setUnlinkNotice(false), 3000); }}
                        className="font-bold hover:underline"
                    >
                        Unlink
                    </button>
                </div>
            )}

            {unlinkNotice && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500">
                    ⚠ Unlinked. This field now has its own independent copy.
                </div>
            )}

            <div className="flex flex-col gap-3">
                {options.map((opt, idx) => (
                    <div key={idx} className="flex gap-2 group/opt">
                        <div className="flex-1">
                            <Input 
                                size="sm"
                                value={opt} 
                                onChange={(e) => handleOptionEdit(idx, e.target.value)} 
                                placeholder={`Option ${idx + 1}`}
                            />
                        </div>
                        <button 
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-100 dark:border-white/5 text-gray-400 hover:text-rose-500 hover:bg-rose-500/5 opacity-0 group-hover/opt:opacity-100 transition-all"
                            onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                            disabled={options.length <= 1}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <Button 
                variant="outline" 
                size="sm" 
                fullWidth 
                className="border-dashed"
                onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
            >
                + Add New Option
            </Button>

            <p className="text-[10px] text-gray-400 leading-relaxed italic">
                Pro Tip: You can copy-paste multiple lines into a single input and they will be auto-split (planned feature).
            </p>
        </div>
    );
}
