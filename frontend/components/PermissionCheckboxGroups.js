/**
 * PermissionCheckboxGroups — Reusable component for role create/edit forms.
 *
 * Displays the 9 fixed permissions organized into logical groups with
 * checkboxes. Supports controlled state via `selected` + `onChange`.
 *
 * Permission Groups:
 *   Form Management:  READ, WRITE, EDIT, DELETE
 *   User Management:  MANAGE, VISIBILITY
 *   Workflow:         APPROVE
 *   Data:            EXPORT, AUDIT
 */

// Fixed permission definitions grouped logically
const PERMISSION_GROUPS = [
    {
        title: 'Form Management',
        icon: '📋',
        permissions: [
            { key: 'READ',   label: 'View',   desc: 'View forms and submissions' },
            { key: 'WRITE',  label: 'Create', desc: 'Create new forms and submissions' },
            { key: 'EDIT',   label: 'Edit',   desc: 'Modify existing forms and submissions' },
            { key: 'DELETE', label: 'Delete', desc: 'Remove forms and submissions' },
        ],
    },
    {
        title: 'User Management',
        icon: '👥',
        permissions: [
            { key: 'MANAGE',     label: 'Manage',     desc: 'Manage roles, users, and system config' },
            { key: 'VISIBILITY', label: 'Visibility',  desc: 'Control who can see forms and data' },
        ],
    },
    {
        title: 'Workflow',
        icon: '✅',
        permissions: [
            { key: 'APPROVE', label: 'Approve', desc: 'Approve or reject submissions' },
        ],
    },
    {
        title: 'Data & Audit',
        icon: '📊',
        permissions: [
            { key: 'EXPORT', label: 'Export', desc: 'Export forms and submission data' },
            { key: 'AUDIT',  label: 'Audit',  desc: 'View audit logs and activity history' },
        ],
    },
];

export default function PermissionCheckboxGroups({ selected = [], onChange, disabled = false }) {
    const selectedSet = new Set(selected);

    function toggle(key) {
        if (disabled) return;
        const next = new Set(selectedSet);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        onChange([...next]);
    }

    function toggleGroup(group) {
        if (disabled) return;
        const groupKeys = group.permissions.map(p => p.key);
        const allSelected = groupKeys.every(k => selectedSet.has(k));
        const next = new Set(selectedSet);
        if (allSelected) {
            groupKeys.forEach(k => next.delete(k));
        } else {
            groupKeys.forEach(k => next.add(k));
        }
        onChange([...next]);
    }

    function selectAll() {
        if (disabled) return;
        const allKeys = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));
        onChange([...allKeys]);
    }

    function clearAll() {
        if (disabled) return;
        onChange([]);
    }

    const totalPerms = PERMISSION_GROUPS.reduce((sum, g) => sum + g.permissions.length, 0);
    const allChecked = selected.length === totalPerms;

    return (
        <div style={disabled ? { opacity: 0.7, pointerEvents: 'none' } : {}}>
            {/* Select All / Clear All bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12
            }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {selected.length} of {totalPerms} permissions selected
                    {disabled && ' (read-only)'}
                </span>
                {!disabled && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={selectAll}
                            disabled={allChecked}
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={clearAll}
                            disabled={selected.length === 0}
                        >
                            Clear All
                        </button>
                    </div>
                )}
            </div>

            <div className="perm-groups">
                {PERMISSION_GROUPS.map(group => {
                    const groupKeys = group.permissions.map(p => p.key);
                    const allGroupSelected = groupKeys.every(k => selectedSet.has(k));
                    const someGroupSelected = groupKeys.some(k => selectedSet.has(k));

                    return (
                        <div key={group.title} className="perm-group">
                            <div
                                className="perm-group-title"
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleGroup(group)}
                            >
                                <span className="group-icon">{group.icon}</span>
                                {group.title}
                                <input
                                    type="checkbox"
                                    checked={allGroupSelected}
                                    ref={el => {
                                        if (el) el.indeterminate = someGroupSelected && !allGroupSelected;
                                    }}
                                    onChange={() => toggleGroup(group)}
                                    style={{
                                        marginLeft: 'auto', width: 16, height: 16,
                                        accentColor: 'var(--accent)', cursor: 'pointer'
                                    }}
                                    onClick={e => e.stopPropagation()}
                                />
                            </div>
                            <div className="perm-group-items">
                                {group.permissions.map(perm => (
                                    <label key={perm.key} className="perm-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedSet.has(perm.key)}
                                            onChange={() => toggle(perm.key)}
                                        />
                                        <span className="perm-checkbox-label">
                                            {perm.label}
                                            <br />
                                            <span className="perm-key">{perm.key}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export { PERMISSION_GROUPS };
