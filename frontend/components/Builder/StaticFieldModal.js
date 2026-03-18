import { useState, useEffect } from 'react';

const TYPE_INFO = {
    section_header:    { label: 'Section Header',    placeholder: 'e.g. Personal Information', hint: 'Renders as a bold section title dividing the form.' },
    label_text:        { label: 'Label Text',        placeholder: 'e.g. Please fill all mandatory fields.', hint: 'Renders as a plain inline label or note.' },
    description_block: { label: 'Description Block', placeholder: 'e.g. Your information will remain confidential.', hint: 'Renders as a descriptive paragraph block.' },
    page_break:        { label: 'Page Break',        placeholder: 'e.g. Step 2: Contact Details (optional)', hint: 'Inserts a page break — the form will display fields after this as a new step/page in wizard mode.' },
};

/**
 * StaticFieldModal — simple modal for configuring static UI elements.
 * Only one field: text content stored in field.data
 */
export default function StaticFieldModal({ field, onSave, onClose }) {
    const [data, setData] = useState(field.data || '');
    const info = TYPE_INFO[field.fieldType] || { label: field.fieldType, placeholder: '', hint: '' };
    const isPageBreak = field.fieldType === 'page_break';

    useEffect(() => { setData(field.data || ''); }, [field.id]);

    const handleSave = () => {
        // page_break title is optional — allow saving with empty data
        if (!isPageBreak && !data.trim()) return;
        onSave({ ...field, data: isPageBreak ? data.trim() : data.trim() });
    };

    const handleKey = (e) => {
        if (e.key === 'Escape') onClose();
    };

    return (
        <div className="config-panel-container" onKeyDown={handleKey}>
            <div className="modal-box static-field-modal">
                {/* Header */}
                <div className="modal-header">
                    <h2 className="modal-title">
                        {info.label}
                        <span className="modal-title-badge static-badge">Static</span>
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* Body */}
                <div className="modal-body">
                    {/* Hint */}
                    <p className="static-modal-hint">{info.hint} Static elements are display-only and never collect user input.</p>

                    {isPageBreak ? (
                        <>
                            {/* Page break preview */}
                            <div className="page-break-preview">
                                <div className="page-break-line" />
                                <span className="page-break-label-badge">⊸ Page Break</span>
                                <div className="page-break-line" />
                            </div>

                            {/* Optional step title */}
                            <div className="form-group" style={{ marginTop: 16 }}>
                                <label className="form-label">
                                    Step Title <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
                                </label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder={info.placeholder}
                                    value={data}
                                    onChange={(e) => setData(e.target.value)}
                                    autoFocus
                                />
                                <span className="form-hint">Shown as the heading of the new page/step. Leave blank for no heading.</span>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Content input */}
                            <div className="form-group">
                                <label className="form-label">
                                    Content Text <span style={{ color: '#EF4444' }}>*</span>
                                </label>
                                <textarea
                                    className="form-textarea"
                                    rows={field.fieldType === 'description_block' ? 5 : 2}
                                    placeholder={info.placeholder}
                                    value={data}
                                    onChange={(e) => setData(e.target.value)}
                                    autoFocus
                                />
                                <span className="form-hint">{data.length} characters</span>
                            </div>

                            {/* Live preview */}
                            {data.trim() && (
                                <div className="static-preview">
                                    <p className="static-preview-label">Preview</p>
                                    {field.fieldType === 'section_header' && (
                                        <h3 className="static-preview-section-header">{data}</h3>
                                    )}
                                    {field.fieldType === 'label_text' && (
                                        <p className="static-preview-label-text">{data}</p>
                                    )}
                                    {field.fieldType === 'description_block' && (
                                        <div className="static-preview-description-block">{data}</div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={!isPageBreak && !data.trim()}
                    >
                        ✓ Save Element
                    </button>
                </div>
            </div>
        </div>
    );
}
