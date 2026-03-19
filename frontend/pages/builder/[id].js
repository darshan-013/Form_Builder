import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import FieldConfigModal from '../../components/Builder/FieldConfigModal';
import StaticFieldModal from '../../components/Builder/StaticFieldModal';
import GroupConfigModal from '../../components/Builder/GroupConfigModal';
import { getForm, updateForm, getVisibilityCandidates } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

/**
 * Edit Form Builder Page — /builder/[id]
 * Loads existing form, allows editing fields, then PUTs changes.
 * DynamicTableService in backend will diff and ALTER TABLE accordingly.
 */
export default function EditBuilderPage() {
    const router = useRouter();
    const { id } = router.query;
    const { hasRole } = useAuth();
    const isViewer = hasRole('Viewer');

    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [fields, setFields] = useState([]);
    const [groups, setGroups] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [allowMultipleSubmissions, setAllowMultipleSubmissions] = useState(true);
    const [expiresAt, setExpiresAt] = useState(''); // ISO string or ''
    // removed visibility state
    const [showSettings, setShowSettings] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Resizable panels state
    const [leftWidth, setLeftWidth] = useState(264);
    const [rightWidth, setRightWidth] = useState(340);
    const [resizing, setResizing] = useState(null); // 'left' or 'right'

    useEffect(() => {
        if (!resizing) return;

        const handleMouseMove = (e) => {
            if (resizing === 'left') {
                const newWidth = Math.max(160, Math.min(450, e.clientX));
                setLeftWidth(newWidth);
            } else if (resizing === 'right') {
                const newWidth = Math.max(280, Math.min(500, window.innerWidth - e.clientX));
                setRightWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setResizing(null);
            document.body.classList.remove('is-resizing');
        };

        document.body.classList.add('is-resizing');
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing]);


    // active configuration tracking
    const [editField, setEditFieldState] = useState(null);
    const [editStaticField, setEditStaticFieldState] = useState(null);
    const [editGroupConfig, setEditGroupConfigState] = useState(null);

    const setEditField = (f) => {
        setEditFieldState(f);
        if (f) { setEditStaticFieldState(null); setEditGroupConfigState(null); }
    };

    const setEditStaticField = (f) => {
        setEditStaticFieldState(f);
        if (f) { setEditFieldState(null); setEditGroupConfigState(null); }
    };

    const setEditGroupConfig = (g) => {
        setEditGroupConfigState(g);
        if (g) { setEditFieldState(null); setEditStaticFieldState(null); }
    };

    // ── User-based form access ──
    const [allowedUsers, setAllowedUsers] = useState([]);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [userSearch, setUserSearch] = useState('');

    // Load available roles
    useEffect(() => {
        if (isViewer) return;
        getVisibilityCandidates()
            .then((res) => {
                const users = Array.isArray(res?.users) ? res.users : [];
                setAvailableUsers(users);
            })
            .catch(() => setAvailableUsers([]));
    }, [isViewer]);

    const filteredVisibilityUsers = useMemo(() => {
        const q = userSearch.trim().toLowerCase();
        const selectedIds = new Set(allowedUsers.map(u => String(u.id ?? u.username)));
        const source = availableUsers.filter(u => !selectedIds.has(String(u.id ?? u.username)));
        if (!q) return source.slice(0, 12);
        return source.filter(u => {
            const username = (u.username || '').toLowerCase();
            const name = (u.name || '').toLowerCase();
            return username.includes(q) || name.includes(q);
        }).slice(0, 12);
    }, [availableUsers, allowedUsers, userSearch]);

    function addAllowedUser(user) {
        if (!user) return;
        setAllowedUsers(prev => {
            const exists = prev.some(u =>
                (u.id != null && user.id != null && Number(u.id) === Number(user.id)) ||
                (u.username && user.username && u.username.toLowerCase() === user.username.toLowerCase())
            );
            if (exists) return prev;
            return [...prev, { id: user.id ?? null, username: user.username || '', name: user.name || '' }];
        });
        setUserSearch('');
    }

    function removeAllowedUser(user) {
        setAllowedUsers(prev => prev.filter(u => {
            if (user.id != null && u.id != null) return Number(u.id) !== Number(user.id);
            return (u.username || '').toLowerCase() !== (user.username || '').toLowerCase();
        }));
    }

    function clearAllowedUsers() {
        setAllowedUsers([]);
    }

    // Load existing form (dynamic fields + static fields merged by fieldOrder)
    useEffect(() => {
        if (!id) return;
        getForm(id)
            .then((form) => {
                setFormName(form.name || '');
                setFormDescription(form.description || '');
                setAllowMultipleSubmissions(form.allowMultipleSubmissions ?? true);

                // Load allowed users from form data
                if (form.allowedUsers) {
                    try {
                        const parsedUsers = typeof form.allowedUsers === 'string'
                            ? JSON.parse(form.allowedUsers)
                            : form.allowedUsers;
                        if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
                            setAllowedUsers(parsedUsers.map(u => ({
                                id: u?.id ?? null,
                                username: u?.username || '',
                                name: u?.name || '',
                            })).filter(u => u.id != null || u.username));
                        } else {
                            setAllowedUsers([]);
                        }
                    } catch { setAllowedUsers([]); }
                } else {
                    setAllowedUsers([]);
                }

                // Load expiry — convert from ISO to datetime-local format (YYYY-MM-DDTHH:mm)
                if (form.expiresAt) {
                    setExpiresAt(new Date(form.expiresAt).toISOString().slice(0, 16));
                } else {
                    setExpiresAt('');
                }

                // Dynamic fields
                const dynFields = (form.fields || []).map((f) => ({
                    id: f.id,
                    fieldType: f.fieldType,
                    isStatic: false,
                    label: f.label,
                    fieldKey: f.fieldKey,
                    required: f.required,
                    defaultValue: f.defaultValue || '',
                    validationRegex: f.validationRegex || '',
                    sharedOptionsId: f.sharedOptionsId || null,
                    validationJson: f.validationJson || null,
                    rulesJson: f.rulesJson || null,
                    uiConfigJson: f.uiConfigJson || null,
                    fieldOrder: f.fieldOrder,
                    // Calculated fields mapping
                    isCalculated: f.isCalculated || false,
                    formulaExpression: f.formulaExpression || '',
                    precision: f.precision ?? 2,
                    lockAfterCalculation: f.lockAfterCalculation || false,
                    parentGroupKey: f.parentGroupKey || null,
                    groupId: f.groupId || null,
                    dependencies: f.dependencies || [],
                    disabled: f.disabled || false,
                    readOnly: f.readOnly || false,
                }));

                // Static fields from the new staticFields array in response
                const statFields = (form.staticFields || []).map((sf) => ({
                    id: sf.id,
                    fieldType: sf.fieldType,
                    isStatic: true,
                    data: sf.data || '',
                    fieldOrder: sf.fieldOrder,
                }));

                // Merge and sort by fieldOrder
                const merged = [...dynFields, ...statFields]
                    .sort((a, b) => a.fieldOrder - b.fieldOrder);
                setFields(merged);

                // Groups
                const loadedGroups = (form.groups || []).map((g) => ({
                    id: g.id,
                    groupTitle: g.groupTitle || '',
                    groupDescription: g.groupDescription || '',
                    groupOrder: g.groupOrder ?? 0,
                    rulesJson: g.rulesJson || null,
                }));
                setGroups(loadedGroups);
            })
            .catch(() => toastError('Failed to load form.'))
            .finally(() => setLoading(false));
    }, [id]);

    const updateField = (updated) => {
        setFields((prev) => prev.map((f) => (f.id === updated.id ? { ...updated } : f)));
        setEditField(null);
    };

    const updateStaticField = (updated) => {
        setFields((prev) => prev.map((f) => (f.id === updated.id ? { ...updated } : f)));
        setEditStaticField(null);
    };

    const updateGroup = (updatedGroup) => {
        setGroups((prev) => prev.map((g) => (g.id === updatedGroup.id ? { ...updatedGroup } : g)));
        setEditGroupConfig(null);
    };

    const handleSave = async () => {
        if (!formName.trim()) {
            toastError("Form name is required.");
            return;
        }

        // Validate field labels
        const dynamicFields = fields.filter(f => !STATIC_TYPES.has(f.fieldType));
        const missingLabel = dynamicFields.some(f => !f.label || !f.label.trim());
        if (missingLabel) {
            toastError("All fields must have a label.");
            return;
        }

        const dynamicFieldsList = [];
        const staticFields = [];

        fields.forEach((f, i) => {
            if (STATIC_TYPES.has(f.fieldType)) {
                staticFields.push({
                    id: f.id,
                    fieldType: f.fieldType,
                    data: f.data || '',
                    fieldOrder: i,
                });
            } else {
                dynamicFieldsList.push({
                    id: f.id,
                    fieldKey: f.fieldKey || `field_${i}`,
                    label: f.label || `Field ${i + 1}`,
                    fieldType: f.fieldType,
                    required: f.required,
                    defaultValue: f.defaultValue || null,
                    validationRegex: f.validationRegex || null,
                    validationJson: f.validationJson || null,
                    rulesJson: f.rulesJson || null,
                    uiConfigJson: f.uiConfigJson || null,
                    sharedOptionsId: f.sharedOptionsId || null,
                    fieldOrder: i,
                    // Calculated fields persistence
                    isCalculated: f.isCalculated || false,
                    formulaExpression: f.isCalculated ? (f.formulaExpression || null) : null,
                    precision: f.isCalculated ? (f.precision ?? 2) : 2,
                    lockAfterCalculation: f.isCalculated ? (f.lockAfterCalculation || false) : false,
                    parentGroupKey: f.parentGroupKey || null,
                    groupId: f.groupId || null,
                    dependencies: f.dependencies || [],
                    disabled: f.disabled || false,
                    readOnly: f.readOnly || false,
                });
            }
        });

        const dto = {
            name: formName.trim(),
            description: formDescription.trim() || null,
            fields: dynamicFieldsList,
            staticFields: staticFields,
            groups: groups.map((g, i) => ({
                id: g.id,
                groupTitle: g.groupTitle || 'Untitled Section',
                groupDescription: g.groupDescription || '',
                groupOrder: i,
                rulesJson: g.rulesJson || null,
            })),
            allowMultipleSubmissions: allowMultipleSubmissions,
            allowedUsers: allowedUsers,
            showTimestamp: true, // always recorded — compulsory
            expiresAt: expiresAt ? expiresAt : null,
        };

        setSaving(true);
        try {
            await updateForm(id, dto);
            setSaveSuccess(true);
            toastSuccess('Form Updated Successfully! ✓');
            setTimeout(() => {
                router.push('/dashboard');
            }, 800);
        } catch (err) {
            toastError(err.message || 'Failed to update form.');
            setSaving(false);
        }
    };


    if (loading) {
        return (
            <div className="loading-center" style={{ height: '100vh', background: 'var(--bg-base)' }}>
                <span className="spinner" style={{ width: 36, height: 36 }} />
            </div>
        );
    }

    const dynamicCount = fields.filter(f => !STATIC_TYPES.has(f.fieldType)).length;
    const staticCount = fields.filter(f => STATIC_TYPES.has(f.fieldType) && f.fieldType !== 'page_break').length;
    const pageBreakCount = fields.filter(f => f.fieldType === 'page_break').length;
    const pageCount = pageBreakCount + 1;

    return (
        <>
            <Head><title>Edit Form — FormCraft Builder</title></Head>

            <div className="builder-page" style={{ gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px` }}>
                <header className="builder-topbar">
                    <Link href="/dashboard" className="builder-topbar-brand">⚡ FormCraft</Link>

                    <input
                        className="builder-form-name-input"
                        placeholder="Form name…"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                    />
                    <input
                        className="builder-form-name-input"
                        style={{ maxWidth: 240, fontWeight: 400, fontSize: 13 }}
                        placeholder="Description (optional)"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                    />

                    <div className="builder-topbar-actions">
                        {fields.length > 0 && (
                            <span className="badge badge-text">
                                {dynamicCount} field{dynamicCount !== 1 ? 's' : ''}
                                {staticCount > 0 ? ` + ${staticCount} static` : ''}
                                {pageBreakCount > 0 ? ` · ${pageCount} pages` : ''}
                            </span>
                        )}

                        {/* Settings button */}
                        {!isViewer && (
                            <div style={{ position: 'relative' }}>
                                <button
                                    className={`btn btn-secondary btn-sm${showSettings ? ' btn-active' : ''}`}
                                    onClick={() => setShowSettings(v => !v)}
                                    title="Form Settings"
                                >
                                    ⚙️ Settings
                                </button>

                                {/* Settings dropdown */}
                                {showSettings && (
                                    <>
                                        <div className="settings-dropdown-backdrop" onClick={() => setShowSettings(false)} />
                                        <div className="settings-dropdown">
                                            <div className="settings-dropdown-header">
                                                <span>⚙️ Form Settings</span>
                                                <button className="settings-dropdown-close" onClick={() => setShowSettings(false)}>✕</button>
                                            </div>

                                            {/* Toggle: Limit to one submission */}
                                            <div className="form-settings-toggle" onClick={() => setAllowMultipleSubmissions(v => !v)}>
                                                <div className="form-settings-toggle-info">
                                                    <span className="form-settings-toggle-label">🔒 Limit to one submission</span>
                                                    <span className="form-settings-toggle-desc">Each person can only submit this form once per session</span>
                                                </div>
                                                <div className={`toggle-switch${!allowMultipleSubmissions ? ' toggle-on' : ''}`} role="switch" aria-checked={!allowMultipleSubmissions}>
                                                    <div className="toggle-knob" />
                                                </div>
                                            </div>

                                            {/* Expiry date-time picker */}
                                            <div className="form-settings-expiry">
                                                <div className="form-settings-expiry-info">
                                                    <span className="form-settings-toggle-label">📅 Form expiry</span>
                                                    <span className="form-settings-toggle-desc">
                                                        {expiresAt
                                                            ? `Closes on ${new Date(expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                                                            : 'No expiry — form stays open indefinitely'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <input
                                                        type="datetime-local"
                                                        className="form-input form-settings-date-input"
                                                        value={expiresAt}
                                                        min={new Date().toISOString().slice(0, 16)}
                                                        onChange={e => setExpiresAt(e.target.value)}
                                                        title="Set form expiry date and time"
                                                    />
                                                    {expiresAt && (
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => setExpiresAt('')}
                                                            title="Clear expiry"
                                                            style={{ whiteSpace: 'nowrap', padding: '6px 10px' }}
                                                        >
                                                            ✕ Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* User-based form access */}
                                            <div className="form-settings-expiry">
                                                <div className="form-settings-expiry-info">
                                                    <span className="form-settings-toggle-label">👥 Who can see this form?</span>
                                                    <span className="form-settings-toggle-desc">
                                                        {allowedUsers.length === 0
                                                            ? 'No explicit users selected. Default visibility rules apply.'
                                                            : `${allowedUsers.length} user${allowedUsers.length !== 1 ? 's' : ''} selected. Only selected users will see this published form.`}
                                                    </span>
                                                </div>

                                                <div className="visibility-users-block">
                                                    <input
                                                        type="text"
                                                        className="form-input visibility-users-search"
                                                        placeholder="Search users by name or username"
                                                        value={userSearch}
                                                        onChange={(e) => setUserSearch(e.target.value)}
                                                    />

                                                    {filteredVisibilityUsers.length > 0 && (
                                                        <div className="visibility-users-results">
                                                            {filteredVisibilityUsers.map(user => (
                                                                <button
                                                                    key={`${user.id ?? 'u'}-${user.username}`}
                                                                    type="button"
                                                                    className="visibility-user-option"
                                                                    onClick={() => addAllowedUser(user)}
                                                                >
                                                                    <span className="visibility-user-name">{user.name || user.username}</span>
                                                                    <span className="visibility-user-username">@{user.username}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="visibility-users-actions">
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            style={{ fontSize: 11, padding: '2px 8px' }}
                                                            onClick={clearAllowedUsers}
                                                            disabled={allowedUsers.length === 0}
                                                        >
                                                            Clear users
                                                        </button>
                                                        <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
                                                            🔒 Admin & Role Admin always have access
                                                        </span>
                                                    </div>

                                                    {allowedUsers.length > 0 && (
                                                        <div className="visibility-users-chips">
                                                            {allowedUsers.map(user => (
                                                                <span key={`${user.id ?? 'u'}-${user.username}`} className="visibility-user-chip">
                                                                    <span>{user.name || user.username}</span>
                                                                    <span className="visibility-user-chip-username">@{user.username}</span>
                                                                    <button
                                                                        type="button"
                                                                        className="visibility-user-chip-remove"
                                                                        onClick={() => removeAllowedUser(user)}
                                                                        aria-label={`Remove ${user.username}`}
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <Link href={`/preview/${id}`} className="btn btn-secondary btn-sm">👁 Preview</Link>
                        <button
                            id="update-form-btn"
                            className={`btn btn-primary btn-sm ${saveSuccess ? 'btn-success-anim' : ''}`}
                            onClick={handleSave}
                            disabled={saving || saveSuccess}
                        >
                            {saveSuccess ? '✓ Saved!' : saving
                                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</>
                                : '💾 Save Changes'}
                        </button>
                    </div>
                </header>


                <div 
                    className={`panel-resizer left-resizer ${resizing === 'left' ? 'resizing' : ''}`}
                    onMouseDown={() => setResizing('left')}
                />
                <FieldPalette />
                <main className="builder-canvas-wrap">
                    <Canvas
                        fields={fields} setFields={setFields}
                        groups={groups} setGroups={setGroups}
                        setEditField={setEditField}
                        setEditStaticField={setEditStaticField}
                        setEditGroupConfig={setEditGroupConfig}
                    />
                </main>
                <div 
                    className={`panel-resizer right-resizer ${resizing === 'right' ? 'resizing' : ''}`}
                    onMouseDown={() => setResizing('right')}
                />
                <aside className="builder-right-panel">
                    {editField ? (
                        <FieldConfigModal
                            field={editField}
                            onSave={updateField}
                            onClose={() => setEditField(null)}
                            siblingFields={fields.filter(f => f.id !== editField.id)}
                        />
                    ) : editStaticField ? (
                        <StaticFieldModal
                            field={editStaticField}
                            onSave={updateStaticField}
                            onClose={() => setEditStaticField(null)}
                        />
                    ) : editGroupConfig ? (
                        <GroupConfigModal
                            group={editGroupConfig}
                            onSave={updateGroup}
                            onClose={() => setEditGroupConfig(null)}
                            siblingFields={fields}
                        />
                    ) : (
                        <div className="right-panel-empty">
                            <div className="right-panel-empty-icon">⚙️</div>
                            <h3>Field Settings</h3>
                            <p>Select a field or section on the canvas to configure its properties.</p>
                        </div>
                    )}
                </aside>
            </div>
        </>
    );
}
