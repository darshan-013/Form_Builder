/**
 * FieldPalette — Left panel listing draggable field type chips.
 * Each chip sets dataTransfer so the Canvas knows whether the drop
 * came from the palette (new field) or from reordering.
 */

const SECTION_TYPES = [
    { type: 'field_group', label: 'Section Group', icon: '📁', iconClass: 'icon-field-group', desc: 'Visual container to group fields into sections' },
];

const FIELD_TYPES = [
    { type: 'text', label: 'Text', icon: '𝐓', iconClass: 'icon-text', desc: 'Short or long text input' },
    { type: 'number', label: 'Number', icon: '#', iconClass: 'icon-number', desc: 'Numeric value' },
    { type: 'date', label: 'Date', icon: '📅', iconClass: 'icon-date', desc: 'Date picker' },
    { type: 'time', label: 'Time', icon: '🕒', iconClass: 'icon-date', desc: 'Time picker' },
    { type: 'date_time', label: 'Date & Time', icon: '📆', iconClass: 'icon-date', desc: 'Date-time picker' },
    { type: 'boolean', label: 'Boolean', icon: '✓', iconClass: 'icon-boolean', desc: 'True / False toggle' },
    { type: 'dropdown', label: 'Dropdown', icon: '▼', iconClass: 'icon-dropdown', desc: 'Select from dropdown list' },
    { type: 'radio', label: 'Radio', icon: '◉', iconClass: 'icon-radio', desc: 'Single choice radio buttons' },
    { type: 'multiple_choice', label: 'Multiple Choice', icon: '☑', iconClass: 'icon-multiple-choice', desc: 'Multi-select checkboxes' },
    { type: 'linear_scale', label: 'Linear Scale', icon: '⭐', iconClass: 'icon-linear-scale', desc: 'Rate on a numeric scale (1–5, 1–10…)' },
    { type: 'star_rating', label: 'Star Rating', icon: '★', iconClass: 'icon-star-rating', desc: 'Fixed 5-star rating (like Google Forms)' },
    { type: 'multiple_choice_grid', label: 'Choice Grid', icon: '⊞', iconClass: 'icon-multiple-choice-grid', desc: 'Grid: one selection per row' },
    { type: 'checkbox_grid', label: 'Checkbox Grid', icon: '⊡', iconClass: 'icon-checkbox-grid', desc: 'Grid: multiple selections per row' },
    { type: 'file', label: 'File', icon: '📎', iconClass: 'icon-file', desc: 'File upload' },
];

const STATIC_TYPES = [
    { type: 'section_header', label: 'Section Header', icon: 'H₁', iconClass: 'icon-section-header', desc: 'Bold section title to divide the form' },
    { type: 'label_text', label: 'Label Text', icon: '¶', iconClass: 'icon-label-text', desc: 'Plain inline label or note' },
    { type: 'description_block', label: 'Description Block', icon: '≡', iconClass: 'icon-description-block', desc: 'Multi-line descriptive paragraph' },
    { type: 'page_break', label: 'Page Break', icon: '⊸', iconClass: 'icon-page-break', desc: 'Split form into multiple steps (wizard mode)' },
];

export default function FieldPalette({ canAddField = true, canAddGroup = true }) {
    const handleDragStart = (e, type) => {
        const isGroup = type === 'field_group';
        if ((isGroup && !canAddGroup) || (!isGroup && !canAddField)) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('source', 'palette');
        e.dataTransfer.setData('fieldType', type);
        e.dataTransfer.setData('application/x-field-type', type);
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <aside className="builder-palette">
            <div className="palette-block">
                <p className="palette-section-title">Layout & Content</p>
                <div className="palette-grid">
                    {SECTION_TYPES.map(({ type, label, icon, iconClass, desc }) => (
                        <div
                            key={type}
                            id={`palette-${type}`}
                            className={`palette-field palette-field-section ${!canAddGroup ? 'palette-field-disabled' : ''}`}
                            draggable={canAddGroup}
                            onDragStart={(e) => handleDragStart(e, type)}
                            title={!canAddGroup ? 'Maximum of 10 sections reached' : desc}
                        >
                            <span className={`palette-field-icon ${iconClass}`}>{icon}</span>
                            <span className="palette-field-label">{label}</span>
                        </div>
                    ))}

                    {STATIC_TYPES.map(({ type, label, icon, iconClass, desc }) => (
                        <div
                            key={type}
                            id={`palette-${type}`}
                            className={`palette-field palette-field-static ${!canAddField ? 'palette-field-disabled' : ''}`}
                            draggable={canAddField}
                            onDragStart={(e) => handleDragStart(e, type)}
                            title={!canAddField ? 'Maximum of 50 fields reached' : desc}
                        >
                            <span className={`palette-field-icon ${iconClass}`}>{icon}</span>
                            <span className="palette-field-label">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="palette-block">
                <p className="palette-section-title">Question Fields</p>
                <div className="palette-grid">
                    {FIELD_TYPES.map(({ type, label, icon, iconClass, desc }) => (
                        <div
                            key={type}
                            id={`palette-${type}`}
                            className={`palette-field ${!canAddField ? 'palette-field-disabled' : ''}`}
                            draggable={canAddField}
                            onDragStart={(e) => handleDragStart(e, type)}
                            title={!canAddField ? 'Maximum of 50 fields reached' : desc}
                        >
                            <span className={`palette-field-icon ${iconClass}`}>{icon}</span>
                            <span className="palette-field-label">{label}</span>
                        </div>
                    ))}
                </div>
            </div>


            <p className="palette-hint">
                ← Drag a field onto the canvas to add it to your form
            </p>
        </aside>
    );
}
