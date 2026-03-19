import { useState, useRef } from 'react';
import FieldCard from './FieldCard';
import GroupContainer from './GroupContainer';

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
export default function Canvas({ 
    fields, setFields, 
    groups = [], setGroups = () => { },
    setEditField, setEditStaticField, setEditGroupConfig
}) {
    const [isOverCanvas, setIsOverCanvas] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState(null);
    const [dropIndex, setDropIndex] = useState(null);
    const [dropPos, setDropPos] = useState(null);
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
        const draggingFieldId = e.dataTransfer.getData('field-id');
        if (draggingFieldId) {
            setFields((prev) => prev.map((f) => 
                f.id === draggingFieldId ? { ...f, groupId, parentGroupKey: null } : f
            ));
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
        } else if (source === 'canvas') {
            // Dragged out of a group onto the main canvas background
            const fromIndex = parseInt(e.dataTransfer.getData('dragIndex'), 10);
            if (!isNaN(fromIndex)) {
                setFields((prev) => {
                    const copy = [...prev];
                    if (copy[fromIndex]) {
                        // Remove from group and move to the end of top-level
                        const [moved] = copy.splice(fromIndex, 1);
                        moved.groupId = null;
                        moved.parentGroupKey = null;
                        copy.push(moved);
                        return copy.map((f, i) => ({ ...f, fieldOrder: i }));
                    }
                    return prev;
                });
            }
        }
    };

    const handleCanvasDragLeave = (e) => {
        if (!canvasRef.current?.contains(e.relatedTarget)) {
            setIsOverCanvas(false);
        }
    };

    // ── Card drag (REORDER) ───────────────────────────────────────────────────

    const handleCardDragStart = (e, item, isGroup = false) => {
        if (isGroup) {
            e.dataTransfer.setData('source', 'canvas-group');
            e.dataTransfer.setData('application/x-group-id', item.id);
            e.dataTransfer.effectAllowed = 'move';
            setDraggingIndex('group-' + item.id);
            return;
        }

        e.dataTransfer.setData('source', 'canvas');
        e.dataTransfer.setData('field-id', item.id);
        e.dataTransfer.effectAllowed = 'move';
        // Use a stable identifier for draggingIndex state
        const fieldIndex = fields.findIndex(f => f.id === item.id);
        setDraggingIndex(fieldIndex);
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

    const handleCardDrop = (e, toVisualIndex, targetGroupId = null) => {
        e.preventDefault();
        e.stopPropagation();
        const source = e.dataTransfer.getData('source');

        if (source === 'palette') {
            const fieldType = e.dataTransfer.getData('fieldType') || e.dataTransfer.getData('application/x-field-type');
            if (fieldType) addField(fieldType, targetGroupId);
        } else if (source === 'canvas' || source === 'canvas-group') {
            // Build the current visual list of top-level items
            const currentTopItems = [
                ...fields.filter(f => !f.groupId).map(f => ({ type: 'field', id: f.id, order: f.fieldOrder ?? 0 })),
                ...groups.map(g => ({ type: 'group', id: g.id, order: g.groupOrder ?? 0 }))
            ].sort((a, b) => a.order - b.order);

            let fromVisualIndex = -1;
            if (source === 'canvas') {
                const draggingFieldId = e.dataTransfer.getData('field-id');
                fromVisualIndex = currentTopItems.findIndex(item => item.type === 'field' && item.id === draggingFieldId);
            } else {
                const movingGroupId = e.dataTransfer.getData('application/x-group-id');
                fromVisualIndex = currentTopItems.findIndex(item => item.type === 'group' && item.id === movingGroupId);
            }

            if (fromVisualIndex !== -1 && fromVisualIndex !== toVisualIndex) {
                const [moved] = currentTopItems.splice(fromVisualIndex, 1);
                
                // Calculate correct insertion point in the merged list
                let insertAt = toVisualIndex;
                if (fromVisualIndex < toVisualIndex && dropPos === 'top') insertAt = toVisualIndex - 1;
                if (fromVisualIndex > toVisualIndex && dropPos === 'bottom') insertAt = toVisualIndex + 1;
                
                currentTopItems.splice(insertAt, 0, moved);

                // Now sync orders back to both states
                const newFieldOrders = {};
                const newGroupOrders = {};
                currentTopItems.forEach((item, i) => {
                    if (item.type === 'field') newFieldOrders[item.id] = i;
                    else newGroupOrders[item.id] = i;
                });

                setFields(prev => prev.map(f => {
                    if (f.groupId) return f; // child fields keep their order relative to group
                    const newOrder = newFieldOrders[f.id];
                    return newOrder !== undefined ? { ...f, fieldOrder: newOrder, groupId: targetGroupId || null, parentGroupKey: null } : f;
                }));

                setGroups(prev => prev.map(g => {
                    const newOrder = newGroupOrders[g.id];
                    return newOrder !== undefined ? { ...g, groupOrder: newOrder } : g;
                }));
            } else if (fromVisualIndex !== -1 && source === 'canvas' && targetGroupId) {
                // Moving into a group 
                const draggingFieldId = e.dataTransfer.getData('field-id');
                setFields(prev => prev.map((f) => f.id === draggingFieldId ? { ...f, groupId: targetGroupId, parentGroupKey: null } : f));
            }
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
                className={`builder-canvas ${isOverCanvas ? 'drag-over' : ''}`}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                onDragLeave={handleCanvasDragLeave}
                id="form-canvas"
                aria-label="Form canvas"
            >
                {topLevelItems.length === 0 ? (
                    <div className="canvas-empty">
                        <div className="canvas-empty-icon">⊕</div>
                        <h3>Drop fields here</h3>
                        <p>Drag a field type or section from the left panel to get started</p>
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
                                    // Header reordering props
                                    onGroupDragStart={(e) => handleCardDragStart(e, group, true)}
                                    onGroupDragOver={(e) => handleCardDragOver(e, idx)}
                                    onGroupDrop={(e) => handleCardDrop(e, idx)}
                                    dropPosition={dropIndex === idx && draggingIndex !== 'group-' + group.id ? dropPos : null}
                                />
                            );
                        }

                        // Regular field card
                        const field = item.data;
                        return (
                            <FieldCard
                                key={field.id}
                                field={field}
                                index={idx} // Using the visual index here
                                onEdit={(f) => f.isStatic ? setEditStaticField(f) : setEditField(f)}
                                onRemove={removeField}
                                onDragStart={(e) => handleCardDragStart(e, field, false)} // Pass the whole field object
                                onDragOver={(e) => handleCardDragOver(e, idx)}
                                onDrop={(e) => handleCardDrop(e, idx)}
                                onDragEnd={handleCardDragEnd}
                                isDragging={draggingIndex === idx}
                                dropPosition={dropIndex === idx && draggingIndex !== idx ? dropPos : null}
                            />
                        );
                    })
                )}
            </div>

        </>
    );
}
