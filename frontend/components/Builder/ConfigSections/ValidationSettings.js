import React from 'react';
import Input from '../../ui/Input';

/**
 * ValidationSettings — Collection of type-specific toggles and values.
 */
export default function ValidationSettings({ local, validationRules, setValidation }) {
  const isType = (...types) => types.includes(local.fieldType);

  const CheckboxRow = ({ label, id, checked, onChange }) => (
    <label className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-primary/10 hover:bg-primary/[0.02] cursor-pointer transition-all group">
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          id={id}
          className="sr-only peer"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-5 h-5 rounded border-2 border-gray-300 dark:border-white/20 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center after:content-['✓'] after:text-white after:text-[10px] after:font-bold after:opacity-0 peer-checked:after:opacity-100" />
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-primary transition-colors">{label}</span>
    </label>
  );

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
      
      {/* Text specific */}
      {isType('text') && (
        <section className="flex flex-col gap-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Text Constraints</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500">Min Length</label>
              <Input type="number" size="sm" value={validationRules.minLength || ''} onChange={v => setValidation('minLength', v ? parseInt(v.target.value) : '')} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500">Max Length</label>
              <Input type="number" size="sm" value={validationRules.maxLength || ''} onChange={v => setValidation('maxLength', v ? parseInt(v.target.value) : '')} />
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <CheckboxRow label="Alphabet Only" checked={validationRules.alphabetOnly} onChange={v => setValidation('alphabetOnly', v)} />
            <CheckboxRow label="Alphanumeric Only" checked={validationRules.alphanumericOnly} onChange={v => setValidation('alphanumericOnly', v)} />
            <CheckboxRow label="Email Format" checked={validationRules.emailFormat} onChange={v => setValidation('emailFormat', v)} />
            <CheckboxRow label="URL Format" checked={validationRules.urlFormat} onChange={v => setValidation('urlFormat', v)} />
          </div>
        </section>
      )}

      {/* Number specific */}
      {isType('number') && (
        <section className="flex flex-col gap-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Numeric Constraints</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500">Min Value</label>
              <Input type="number" size="sm" value={validationRules.minValue || ''} onChange={v => setValidation('minValue', v ? parseFloat(v.target.value) : '')} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500">Max Value</label>
              <Input type="number" size="sm" value={validationRules.maxValue || ''} onChange={v => setValidation('maxValue', v ? parseFloat(v.target.value) : '')} />
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <CheckboxRow label="Integer Only" checked={validationRules.integerOnly} onChange={v => setValidation('integerOnly', v)} />
            <CheckboxRow label="Positive Only" checked={validationRules.positiveOnly} onChange={v => setValidation('positiveOnly', v)} />
          </div>
        </section>
      )}

      {/* Date specific */}
      {isType('date') && (
        <section className="flex flex-col gap-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Date Constraints</h4>
          <div className="flex flex-col gap-2 mt-2">
            <CheckboxRow label="Past Only" checked={validationRules.pastOnly} onChange={v => setValidation('pastOnly', v)} />
            <CheckboxRow label="Future Only" checked={validationRules.futureOnly} onChange={v => setValidation('futureOnly', v)} />
            <CheckboxRow label="No Weekends" checked={validationRules.noWeekend} onChange={v => setValidation('noWeekend', v)} />
          </div>
        </section>
      )}

       {/* File specific */}
       {isType('file') && (
        <section className="flex flex-col gap-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">File Constraints</h4>
          <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-gray-500">Allowed Extensions</label>
              <Input placeholder="e.g. .pdf, .docx, .jpg" value={validationRules.allowedExtensions || ''} onChange={v => setValidation('allowedExtensions', v.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500">Max Size (MB)</label>
              <Input type="number" size="sm" value={validationRules.maxFileSize || ''} onChange={v => setValidation('maxFileSize', v ? parseFloat(v.target.value) : '')} />
          </div>
        </section>
      )}

      {/* Boolean specific */}
      {isType('boolean') && (
        <section className="flex flex-col gap-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Interaction Flags</h4>
          <CheckboxRow label="Must Be Checked (T&C)" checked={validationRules.mustBeTrue} onChange={v => setValidation('mustBeTrue', v)} />
        </section>
      )}

    </div>
  );
}
