/**
 * FieldPalette — Left panel listing draggable field type chips.
 * Each chip sets dataTransfer so the Canvas knows whether the drop
 * came from the palette (new field) or from reordering.
 */

const FIELD_TYPES = [
    { type: 'text', label: 'Text', icon: '𝐓', iconClass: 'icon-text', desc: 'Short or long text input' },
    { type: 'number', label: 'Number', icon: '#', iconClass: 'icon-number', desc: 'Numeric value' },
    { type: 'date', label: 'Date', icon: '📅', iconClass: 'icon-date', desc: 'Date picker' },
    { type: 'boolean', label: 'Boolean', icon: '✓', iconClass: 'icon-boolean', desc: 'True / False toggle' },
    { type: 'dropdown', label: 'Dropdown', icon: '▼', iconClass: 'icon-dropdown', desc: 'Select from dropdown list' },
    { type: 'radio', label: 'Radio', icon: '◉', iconClass: 'icon-radio', desc: 'Single choice radio buttons' },
    { type: 'multiple_choice', label: 'Multiple Choice', icon: '☑', iconClass: 'icon-multiple-choice', desc: 'Multi-select checkboxes' },
    { type: 'linear_scale', label: 'Linear Scale', icon: '⭐', iconClass: 'icon-linear-scale', desc: 'Rate on a numeric scale (1–5, 1–10…)' },
    { type: 'multiple_choice_grid', label: 'Choice Grid', icon: '⊞', iconClass: 'icon-multiple-choice-grid', desc: 'Grid: one selection per row' },
    { type: 'file', label: 'File', icon: '📎', iconClass: 'icon-file', desc: 'File upload' },
];

export default function FieldPalette() {
    const handleDragStart = (e, type) => {
        e.dataTransfer.setData('source', 'palette');
        e.dataTransfer.setData('fieldType', type);
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <aside className="builder-palette">
            <p className="palette-section-title">Field Types</p>

            {FIELD_TYPES.map(({ type, label, icon, iconClass, desc }) => (
                <div
                    key={type}
                    id={`palette-${type}`}
                    className="palette-field"
                    draggable
                    onDragStart={(e) => handleDragStart(e, type)}
                    title={desc}
                >
                    <span className={`palette-field-icon ${iconClass}`}>{icon}</span>
                    <span>{label}</span>
                </div>
            ))}

            <p className="palette-hint">
                ← Drag a field onto the canvas to add it to your form
            </p>
        </aside>
    );
}
