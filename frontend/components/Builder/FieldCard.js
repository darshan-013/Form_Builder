/**
 * FieldCard — Individual field row on the canvas.
 * - Draggable for reordering within the canvas.
 * - Shows type badge, label, field_key, required indicator.
 * - Edit button → opens FieldConfigModal via onEdit callback.
 * - Remove button → calls onRemove callback.
 */

const TYPE_META = {
    text: { label: 'Text', cls: 'badge-text' },
    number: { label: 'Number', cls: 'badge-number' },
    date: { label: 'Date', cls: 'badge-date' },
    time: { label: 'Time', cls: 'badge-date' },
    date_time: { label: 'Date & Time', cls: 'badge-date' },
    boolean: { label: 'Boolean', cls: 'badge-boolean' },
    dropdown: { label: 'Dropdown', cls: 'badge-dropdown' },
    radio: { label: 'Radio', cls: 'badge-radio' },
    multiple_choice: { label: 'Multiple Choice', cls: 'badge-multiple-choice' },
    linear_scale: { label: 'Linear Scale', cls: 'badge-linear-scale' },
    star_rating: { label: 'Star Rating', cls: 'badge-star-rating' },
    multiple_choice_grid: { label: 'Choice Grid', cls: 'badge-multiple-choice-grid' },
    checkbox_grid: { label: 'Checkbox Grid', cls: 'badge-checkbox-grid' },
    file: { label: 'File', cls: 'badge-file' },
    // Static types
    section_header: { label: 'Section Header', cls: 'badge-static badge-section-header' },
    label_text: { label: 'Label Text', cls: 'badge-static badge-label-text' },
    description_block: { label: 'Description Block', cls: 'badge-static badge-description-block' },
    page_break: { label: 'Page Break', cls: 'badge-static badge-page-break' },
};

export default function FieldCard({
    field, index, onEdit, onRemove,
    onDragStart, onDragOver, onDrop, onDragEnd,
    isDragging, dropPosition,
}) {
    const meta = TYPE_META[field.fieldType] || { label: field.fieldType, cls: 'badge-text' };
    const isStatic = !!field.isStatic;
    const isPageBreak = field.fieldType === 'page_break';

    const cardClass = [
        'field-card',
        isPageBreak ? 'field-card-page-break' : '',
        isStatic ? 'field-card-static' : '',
        isDragging ? 'dragging' : '',
        dropPosition === 'top' ? 'drag-over-top' : '',
        dropPosition === 'bottom' ? 'drag-over-bottom' : '',
    ].filter(Boolean).join(' ');

    if (isPageBreak) {
        return (
            <div
                id={`field-card-${field.id}`}
                className={cardClass}
                draggable
                onDragStart={(e) => onDragStart(e, index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => onDrop(e, index)}
                onDragEnd={onDragEnd}
            >
                <span className="field-card-drag-handle" title="Drag to reorder">⠿</span>
                <div className="page-break-card-content">
                    <div className="page-break-card-line" />
                    <span className="page-break-card-badge">⊸ Page Break{field.data ? `: ${field.data}` : ''}</span>
                    <div className="page-break-card-line" />
                </div>
                <div className="field-card-actions">
                    <button className="field-action-btn edit" onClick={(e) => { e.stopPropagation(); onEdit(field); }} title="Configure">✎</button>
                    <button className="field-action-btn remove" onClick={(e) => { e.stopPropagation(); onRemove(field.id); }} title="Remove">✕</button>
                </div>
            </div>
        );
    }

    return (
        <div
            id={`field-card-${field.id}`}
            className={cardClass}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
            onClick={() => onEdit(field)}
        >
            {/* Drag handle */}
            <span className="field-card-drag-handle" title="Drag to reorder">⠿</span>

            {/* Type badge */}
            <span className={`badge ${meta.cls}`}>{meta.label}</span>

            {/* Info */}
            <div className="field-card-info">
                {isStatic ? (
                    <div className="field-card-label field-card-static-preview">
                        {field.data
                            ? <span className="static-content-preview">{field.data}</span>
                            : <em style={{ opacity: 0.4 }}>Click edit to add content</em>}
                    </div>
                ) : (
                    <>
                        <div className="field-card-label">{field.label || <em style={{ opacity: 0.4 }}>Untitled field</em>}</div>
                        <div className="field-card-meta">
                            <span className="field-card-key">{field.fieldKey || '—'}</span>
                            {field.required && <span className="field-required-dot" title="Required field" />}
                        </div>
                    </>
                )}
            </div>

            {/* Actions */}
            <div className="field-card-actions">
                <button className="field-action-btn edit" onClick={(e) => { e.stopPropagation(); onEdit(field); }} title="Configure">✎</button>
                <button className="field-action-btn remove" onClick={(e) => { e.stopPropagation(); onRemove(field.id); }} title="Remove">✕</button>
            </div>
        </div>
    );
}

