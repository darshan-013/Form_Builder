import { useState, useRef } from 'react';
import FieldCard from './FieldCard';
import FieldConfigModal from './FieldConfigModal';
import StaticFieldModal from './StaticFieldModal';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

/**
 * Canvas — Manages the list of fields on the form.
 * Handles:
 *   1. Drops from FieldPalette (new field from field type)
 *   2. Reordering via drag between FieldCards
 *   3. Edit modal (FieldConfigModal)
 *   4. Remove field
 */
export default function Canvas({ fields, setFields }) {
    const [isOverCanvas, setIsOverCanvas] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState(null);
    const [dropIndex, setDropIndex] = useState(null);   // card index hovered
    const [dropPos, setDropPos] = useState(null);   // 'top' | 'bottom'
    const [editField, setEditField] = useState(null);   // field being edited
    const [editStaticField, setEditStaticField] = useState(null);   // static field being edited
    const canvasRef = useRef(null);

    // ── Field operations ─────────────────────────────────────────────────────

    const addField = (fieldType) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const isStatic = STATIC_TYPES.has(fieldType);

        if (isStatic) {
            const newField = {
                id,
                fieldType,
                isStatic: true,
                data: '',
                fieldOrder: fields.length,
            };
            setFields((prev) => {
                const updated = [...prev, newField];
                // page_break has no required content — skip modal, add directly.
                // Other static types auto-open the config modal.
                if (fieldType !== 'page_break') {
                    setTimeout(() => setEditStaticField({ ...newField, fieldOrder: updated.length - 1 }), 80);
                }
                return updated;
            });
        } else {
            const autoKey = `${fieldType}_${Date.now().toString(36).slice(-6)}`;
            const newField = {
                id,
                fieldType,
                isStatic: false,
                label: '',
                fieldKey: autoKey,
                required: false,
                defaultValue: '',
                validationRegex: '',
                fieldOrder: fields.length,
                sharedOptionsId: null,
                validationJson: null,
                rulesJson: null,
            };
            setFields((prev) => {
                const updated = [...prev, newField];
                // Auto-open config modal for the new field
                setTimeout(() => setEditField({ ...newField, fieldOrder: updated.length - 1 }), 80);
                return updated;
            });
        }
    };

    const removeField = (id) => {
        setFields((prev) => prev.filter((f) => f.id !== id).map((f, i) => ({ ...f, fieldOrder: i })));
    };

    const updateField = (updated) => {
        setFields((prev) =>
            prev.map((f) => (f.id === updated.id ? { ...updated } : f))
        );
        setEditField(null);
    };

    const updateStaticField = (updated) => {
        setFields((prev) =>
            prev.map((f) => (f.id === updated.id ? { ...updated } : f))
        );
        setEditStaticField(null);
    };

    // ── Canvas drop (NEW field from palette) ─────────────────────────────────

    const handleCanvasDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsOverCanvas(true);
    };

    const handleCanvasDrop = (e) => {
        e.preventDefault();
        setIsOverCanvas(false);
        const source = e.dataTransfer.getData('source');
        if (source === 'palette') {
            const fieldType = e.dataTransfer.getData('fieldType');
            if (fieldType) addField(fieldType);
        }
    };

    const handleCanvasDragLeave = (e) => {
        // Only clear if actually leaving the canvas element
        if (!canvasRef.current?.contains(e.relatedTarget)) {
            setIsOverCanvas(false);
        }
    };

    // ── Card drag (REORDER) ───────────────────────────────────────────────────

    const handleCardDragStart = (e, index) => {
        e.dataTransfer.setData('source', 'canvas');
        e.dataTransfer.setData('dragIndex', String(index));
        e.dataTransfer.effectAllowed = 'move';
        setDraggingIndex(index);
    };

    const handleCardDragOver = (e, index) => {
        e.preventDefault();
        e.stopPropagation(); // prevent canvas handler from firing
        const source = e.dataTransfer.getData('source');
        if (source === 'palette') return; // let canvas handle palette drops

        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos = e.clientY < midY ? 'top' : 'bottom';
        setDropIndex(index);
        setDropPos(pos);
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCardDrop = (e, toIndex) => {
        e.preventDefault();
        e.stopPropagation();
        const source = e.dataTransfer.getData('source');
        const fromIndex = parseInt(e.dataTransfer.getData('dragIndex'), 10);

        if (source === 'palette') {
            // Dropped on a card but came from palette — treat as canvas drop
            const fieldType = e.dataTransfer.getData('fieldType');
            if (fieldType) addField(fieldType);
        } else if (source === 'canvas' && !isNaN(fromIndex) && fromIndex !== toIndex) {
            // Reorder
            setFields((prev) => {
                const copy = [...prev];
                const [moved] = copy.splice(fromIndex, 1);
                const target = dropPos === 'bottom' ? toIndex : toIndex;
                const insertAt = fromIndex < toIndex && dropPos === 'top' ? toIndex - 1 : toIndex;
                copy.splice(insertAt, 0, moved);
                return copy.map((f, i) => ({ ...f, fieldOrder: i }));
            });
        }

        setDropIndex(null);
        setDropPos(null);
        setDraggingIndex(null);
        setIsOverCanvas(false);
    };

    const handleCardDragEnd = () => {
        setDraggingIndex(null);
        setDropIndex(null);
        setDropPos(null);
        setIsOverCanvas(false);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <div
                ref={canvasRef}
                className={`builder-canvas ${isOverCanvas ? 'drag-over' : ''}`}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                onDragLeave={handleCanvasDragLeave}
                id="form-canvas"
                aria-label="Form canvas"
            >
                {fields.length === 0 ? (
                    <div className="canvas-empty">
                        <div className="canvas-empty-icon">⊕</div>
                        <h3>Drop fields here</h3>
                        <p>Drag a field type from the left panel to get started</p>
                    </div>
                ) : (
                    fields.map((field, index) => (
                        <FieldCard
                            key={field.id}
                            field={field}
                            index={index}
                            onEdit={(f) => f.isStatic ? setEditStaticField(f) : setEditField(f)}
                            onRemove={removeField}
                            onDragStart={handleCardDragStart}
                            onDragOver={handleCardDragOver}
                            onDrop={handleCardDrop}
                            onDragEnd={handleCardDragEnd}
                            isDragging={draggingIndex === index}
                            dropPosition={dropIndex === index ? dropPos : null}
                        />
                    ))
                )}
            </div>

            {/* Field configuration modal */}
            {editField && (
                <FieldConfigModal
                    field={editField}
                    onSave={updateField}
                    onClose={() => setEditField(null)}
                    siblingFields={fields.filter(f => f.id !== editField?.id)}
                />
            )}

            {/* Static field configuration modal */}
            {editStaticField && (
                <StaticFieldModal
                    field={editStaticField}
                    onSave={updateStaticField}
                    onClose={() => setEditStaticField(null)}
                />
            )}
        </>
    );
}
