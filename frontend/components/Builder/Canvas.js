import { useState, useRef } from 'react';
import FieldCard from './FieldCard';
import FieldConfigModal from './FieldConfigModal';
import StaticFieldModal from './StaticFieldModal';
import GroupContainer from './GroupContainer';
import GroupConfigModal from './GroupConfigModal';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

/**
 * Canvas — Manages the list of fields AND groups on the form.
 * Handles:
 *   1. Drops from FieldPalette (new field / new group)
 *   2. Reordering via drag between FieldCards + GroupContainers
 *   3. Nested field placement inside groups
 *   4. Edit modal (FieldConfigModal / StaticFieldModal)
 *   5. Remove field / group
 */
export default function Canvas({ fields, setFields, groups = [], setGroups = () => { } }) {
    const [isOverCanvas, setIsOverCanvas] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState(null);
    const [dropIndex, setDropIndex] = useState(null);
    const [dropPos, setDropPos] = useState(null);
    const [editField, setEditField] = useState(null);
    const [editStaticField, setEditStaticField] = useState(null);
    const [editGroupConfig, setEditGroupConfig] = useState(null);
    const canvasRef = useRef(null);

    // ── Group operations ──────────────────────────────────────────────────────

    const generateUUID = () => {
        if (typeof self !== 'undefined' && self.crypto && self.crypto.randomUUID) {
            return self.crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const addGroup = () => {
        const id = generateUUID();
        const maxFieldOrder = fields.length > 0 ? Math.max(...fields.map(f => f.fieldOrder ?? 0)) : -1;
        const maxGroupOrder = groups.length > 0 ? Math.max(...groups.map(g => g.groupOrder ?? 0)) : -1;
        const newOrder = Math.max(maxFieldOrder, maxGroupOrder) + 1;

        const newGroup = {
            id,
            groupTitle: 'New Section',
            groupDescription: '',
            groupOrder: newOrder,
        };
        setGroups((prev) => [...prev, newGroup]);
    };

    const updateGroup = (updated) => {
        setGroups((prev) =>
            prev.map((g) => (g.id === updated.id ? { ...updated } : g))
        );
    };

    const removeGroup = (groupId) => {
        // Move child fields to main canvas (clear groupId)
        setFields((prev) =>
            prev.map((f) =>
                f.groupId === groupId ? { ...f, groupId: null, parentGroupKey: null } : f
            )
        );
        setGroups((prev) => prev.filter((g) => g.id !== groupId).map((g, i) => ({ ...g, groupOrder: i })));
    };

    // ── Field operations ──────────────────────────────────────────────────────

    const addField = (fieldType, groupId = null) => {
        const id = generateUUID();
        const isStatic = STATIC_TYPES.has(fieldType);

        if (fieldType === 'field_group') {
            addGroup();
            return;
        }

        const maxFieldOrder = fields.length > 0 ? Math.max(...fields.map(f => f.fieldOrder ?? 0)) : -1;
        const maxGroupOrder = groups.length > 0 ? Math.max(...groups.map(g => g.groupOrder ?? 0)) : -1;
        const newOrder = Math.max(maxFieldOrder, maxGroupOrder) + 1;

        if (isStatic) {
            const newField = {
                id,
                fieldType,
                isStatic: true,
                data: '',
                fieldOrder: newOrder,
                groupId,
            };
            setFields((prev) => {
                const updated = [...prev, newField];
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
                fieldOrder: newOrder,
                sharedOptionsId: null,
                validationJson: null,
                rulesJson: null,
                groupId,
            };
            setFields((prev) => {
                const updated = [...prev, newField];
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

    // ── Drop field into group ─────────────────────────────────────────────────

    const handleDropFieldIntoGroup = (e, groupId) => {
        e.preventDefault();
        e.stopPropagation();

        // New field from palette
        const fieldType = e.dataTransfer.getData('application/x-field-type') || e.dataTransfer.getData('fieldType');
        if (fieldType) {
            if (fieldType === 'field_group') return; // can't nest groups
            addField(fieldType, groupId);
            return;
        }

        // Existing field being moved into group
        const fieldIndex = e.dataTransfer.getData('application/x-field-index') || e.dataTransfer.getData('dragIndex');
        if (fieldIndex !== '' && fieldIndex !== null) {
            const idx = parseInt(fieldIndex, 10);
            if (!isNaN(idx)) {
                setFields((prev) => {
                    const copy = [...prev];
                    if (copy[idx]) {
                        copy[idx] = { ...copy[idx], groupId, parentGroupKey: null };
                    }
                    return copy;
                });
            }
        }
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

        // Check for group drag reorder
        const groupId = e.dataTransfer.getData('application/x-group-id');
        if (groupId) return; // group reorder handled elsewhere

        const source = e.dataTransfer.getData('source');
        if (source === 'palette') {
            const fieldType = e.dataTransfer.getData('fieldType') || e.dataTransfer.getData('application/x-field-type');
            if (fieldType) addField(fieldType, null);
        }
    };

    const handleCanvasDragLeave = (e) => {
        if (!canvasRef.current?.contains(e.relatedTarget)) {
            setIsOverCanvas(false);
        }
    };

    // ── Card drag (REORDER) ───────────────────────────────────────────────────

    const handleCardDragStart = (e, fieldOrIndex) => {
        const index = typeof fieldOrIndex === 'number'
            ? fieldOrIndex
            : fields.findIndex((f) => f.id === fieldOrIndex.id || f.fieldKey === fieldOrIndex.fieldKey);
        e.dataTransfer.setData('source', 'canvas');
        e.dataTransfer.setData('dragIndex', String(index));
        e.dataTransfer.setData('application/x-field-index', String(index));
        e.dataTransfer.effectAllowed = 'move';
        setDraggingIndex(index);
    };

    const handleCardDragOver = (e, index) => {
        e.preventDefault();
        e.stopPropagation();
        const source = e.dataTransfer.getData('source');
        if (source === 'palette') return;

        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos = e.clientY < midY ? 'top' : 'bottom';
        setDropIndex(index);
        setDropPos(pos);
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCardDrop = (e, toIndex, targetGroupId = null) => {
        e.preventDefault();
        e.stopPropagation();
        const source = e.dataTransfer.getData('source');
        const fromIndex = parseInt(e.dataTransfer.getData('dragIndex'), 10);

        if (source === 'palette') {
            const fieldType = e.dataTransfer.getData('fieldType') || e.dataTransfer.getData('application/x-field-type');
            if (fieldType) addField(fieldType, targetGroupId);
        } else if (source === 'canvas' && !isNaN(fromIndex) && fromIndex !== toIndex) {
            setFields((prev) => {
                const copy = [...prev];
                const [moved] = copy.splice(fromIndex, 1);
                const insertAt = fromIndex < toIndex && dropPos === 'top' ? toIndex - 1 : toIndex;
                // If dropping into a group, set the groupId
                if (targetGroupId !== undefined && targetGroupId !== null) {
                    moved.groupId = targetGroupId;
                    moved.parentGroupKey = null;
                }
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

    // ── Build merged top-level items ──────────────────────────────────────────
    // Ungrouped fields + groups, sorted by fieldOrder/groupOrder for interleaving

    const ungroupedFields = fields.filter((f) => !f.groupId);

    // Build a merged list for ordering: groups and ungrouped fields are interleaved.
    // They are sorted together based on their respective order properties.
    const topLevelItems = [
        ...ungroupedFields.map(f => ({ type: 'field', data: f, order: f.fieldOrder ?? 0 })),
        ...groups.map(g => ({ type: 'group', data: g, order: g.groupOrder ?? 0 }))
    ].sort((a, b) => a.order - b.order);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <div
                ref={canvasRef}
                className={`
                    relative min-h-[600px] p-8 rounded-3xl transition-all duration-500
                    ${isOverCanvas ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : 'bg-transparent'}
                    before:absolute before:inset-0 before:bg-[radial-gradient(var(--primary-glow)_1px,transparent_1px)] before:bg-[size:32px_32px] before:opacity-[0.03] before:pointer-events-none
                `}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                onDragLeave={handleCanvasDragLeave}
                id="form-canvas"
                aria-label="Form canvas"
            >
                {topLevelItems.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12 translate-y-[-10%]">
                        <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6 ring-1 ring-primary/20 animate-pulse">
                            <span className="text-4xl text-primary">⊕</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Build your masterpiece</h3>
                        <p className="text-gray-500 max-w-xs mx-auto text-sm leading-relaxed">
                            Drag and drop fields from the left palette to start creating your dynamic form.
                        </p>
                        
                        <div className="mt-8 flex gap-4 opacity-30 grayscale pointer-events-none">
                            <div className="w-32 h-10 rounded-xl border border-gray-300 dark:border-white/10" />
                            <div className="w-32 h-10 rounded-xl border border-gray-300 dark:border-white/10" />
                        </div>
                    </div>
                ) : (
                    topLevelItems.map((item, idx) => {
                        if (item.type === 'group') {
                            const group = item.data;
                            const childFields = fields
                                .filter((f) => f.groupId === group.id)
                                .sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));

                            return (
                                <GroupContainer
                                    key={group.id}
                                    group={group}
                                    fields={childFields}
                                    onUpdateGroup={updateGroup}
                                    onRemoveGroup={removeGroup}
                                    onEditField={(f) => f.isStatic ? setEditStaticField(f) : setEditField(f)}
                                    onRemoveField={(fieldKey) => {
                                        setFields((prev) =>
                                            prev.filter((f) => f.fieldKey !== fieldKey && f.id !== fieldKey)
                                                .map((f, i) => ({ ...f, fieldOrder: i }))
                                        );
                                    }}
                                    onAddFieldInGroup={(gId) => {
                                        // Open a mini field type picker — for simplicity, add a text field and open modal
                                        addField('text', gId);
                                    }}
                                    onFieldDragStart={handleCardDragStart}
                                    onFieldDragOver={handleCardDragOver}
                                    onFieldDrop={handleCardDrop}
                                    onDropFieldIntoGroup={handleDropFieldIntoGroup}
                                    onConfigureRules={(g) => setEditGroupConfig(g)}
                                />
                            );
                        }

                        // Regular field card
                        const field = item.data;
                        const fieldIndex = fields.findIndex((f) => f.id === field.id);
                        return (
                            <FieldCard
                                key={field.id}
                                field={field}
                                index={fieldIndex}
                                onEdit={(f) => f.isStatic ? setEditStaticField(f) : setEditField(f)}
                                onRemove={removeField}
                                onDragStart={handleCardDragStart}
                                onDragOver={handleCardDragOver}
                                onDrop={handleCardDrop}
                                onDragEnd={handleCardDragEnd}
                                isDragging={draggingIndex === fieldIndex}
                                dropPosition={dropIndex === fieldIndex ? dropPos : null}
                            />
                        );
                    })
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

            {/* Group rules configuration modal */}
            {editGroupConfig && (
                <GroupConfigModal
                    group={editGroupConfig}
                    onSave={(updatedGroup) => {
                        updateGroup(updatedGroup);
                        setEditGroupConfig(null);
                    }}
                    onClose={() => setEditGroupConfig(null)}
                    siblingFields={fields}
                />
            )}
        </>
    );
}
