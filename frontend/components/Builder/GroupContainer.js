import { useState } from 'react';
import FieldCard from './FieldCard';

/**
 * GroupContainer — visual section card on the builder canvas.
 * Renders a group header (drag handle, title, actions) and nested field cards.
 */
export default function GroupContainer({
    group,
    fields,       // child fields belonging to this group
    onUpdateGroup,
    onRemoveGroup,
    onEditField,
    onRemoveField,
    onAddFieldInGroup,
    onFieldDragStart,
    onFieldDragOver,
    onFieldDrop,
    onDropFieldIntoGroup,
    onConfigureRules,
    onGroupDragStart,
    onGroupDragOver,
    onGroupDrop,
    dropPosition,
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(group.groupTitle || '');
    const [descDraft, setDescDraft] = useState(group.groupDescription || '');
    const [dragOver, setDragOver] = useState(false);

    const handleTitleSave = () => {
        onUpdateGroup({ ...group, groupTitle: titleDraft, groupDescription: descDraft });
        setEditingTitle(false);
    };


    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Accept field drops (from palette or canvas)
        const types = e.dataTransfer.types;
        if (types.includes('application/x-field-type') || 
            types.includes('application/x-field-index') ||
            types.includes('fieldType') ||
            types.includes('dragIndex')) {
            e.dataTransfer.dropEffect = 'copy';
            setDragOver(true);
        }
    };

    const handleDragLeave = (e) => {
        // Only clear if we're actually leaving the container
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOver(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        onDropFieldIntoGroup(e, group.id);
    };

    return (
        <div
            className={`group-container ${dragOver ? 'group-container--drag-over' : ''} ${dropPosition === 'top' ? 'drag-over-top' : ''} ${dropPosition === 'bottom' ? 'drag-over-bottom' : ''}`}
            draggable
            onDragStart={onGroupDragStart}
            onDragOver={onGroupDragOver}
            onDrop={onGroupDrop}
        >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="group-container-header">
                <span className="group-drag-handle" title="Drag to reorder">⠿</span>

                {editingTitle ? (
                    <div className="group-edit-inline">
                        <input
                            className="group-title-input"
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            placeholder="Section title…"
                            autoFocus
                        />
                        <input
                            className="group-desc-input"
                            value={descDraft}
                            onChange={(e) => setDescDraft(e.target.value)}
                            placeholder="Description (optional)…"
                        />
                        <button className="group-save-btn" onClick={handleTitleSave}>✓</button>
                        <button className="group-cancel-btn" onClick={() => setEditingTitle(false)}>✕</button>
                    </div>
                ) : (
                    <div className="group-title-area">
                        <h3 className="group-title">
                            📁 {group.groupTitle || 'Untitled Section'}
                        </h3>
                        {group.groupDescription && (
                            <p className="group-description">{group.groupDescription}</p>
                        )}
                    </div>
                )}

                <div className="group-actions">
                    <button
                        className="group-action-btn"
                        onClick={() => setCollapsed(!collapsed)}
                        title={collapsed ? 'Expand' : 'Collapse'}
                    >
                        {collapsed ? '▸' : '▾'}
                    </button>
                    <button
                        className="group-action-btn"
                        onClick={() => {
                            setTitleDraft(group.groupTitle || '');
                            setDescDraft(group.groupDescription || '');
                            setEditingTitle(true);
                        }}
                        title="Edit section"
                    >
                        ✎
                    </button>
                    <button
                        className="group-action-btn"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (typeof onConfigureRules === 'function') onConfigureRules(group);
                        }}
                        title="Configure rules"
                    >
                        ⚡
                    </button>
                    <button
                        className="group-action-btn group-action-btn--danger"
                        onClick={() => onRemoveGroup(group.id)}
                        title="Delete section (fields move to main canvas)"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* ── Body (nested fields) ────────────────────────────────────── */}
            {!collapsed && (
                <div
                    className="group-container-body"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {fields.length === 0 ? (
                        <div className="group-empty-state">
                            Drag fields here or click + Add Field
                        </div>
                    ) : (
                        fields.map((field, idx) => (
                            <FieldCard
                                key={field.fieldKey || field.id || idx}
                                field={field}
                                index={idx}
                                onEdit={() => onEditField(field)}
                                onRemove={() => onRemoveField(field.fieldKey)}
                                onDragStart={(e) => onFieldDragStart(e, field)}
                                onDragOver={(e) => onFieldDragOver(e, idx)}
                                onDrop={(e) => onFieldDrop(e, idx, group.id)}
                            />
                        ))
                    )}

                </div>
            )}
        </div>
    );
}
