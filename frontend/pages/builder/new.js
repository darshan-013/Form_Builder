import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import { assignBuilder, createForm, getVisibilityCandidates, getWorkflowCandidates } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);

/**
 * New Form Builder Page — /builder/new
 */
export default function NewBuilderPage() {
    const router = useRouter();
    const { hasRole } = useAuth();
    const isViewer = hasRole('Viewer');
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [fields, setFields] = useState([]);
    const [groups, setGroups] = useState([]);
    const [saving, setSaving] = useState(false);
    const [allowMultipleSubmissions, setAllowMultipleSubmissions] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [visibility, setVisibility] = useState('PUBLIC');
    const [showSettings, setShowSettings] = useState(false);

    // ── Role-based form access ──
    const [builderCandidates, setBuilderCandidates] = useState([]);
    const [showBuilderModal, setShowBuilderModal] = useState(false);
    const [selectedBuilderId, setSelectedBuilderId] = useState('');
    const [pendingDto, setPendingDto] = useState(null);

    // ── User-based form access ──
    const [allowedUsers, setAllowedUsers] = useState([]);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [userSearch, setUserSearch] = useState('');

    useEffect(() => {
        if (!isViewer) {
            getVisibilityCandidates()
                .then((res) => {
                    const users = Array.isArray(res?.users) ? res.users : [];
                    setAvailableUsers(users);
                })
                .catch(() => setAvailableUsers([]));
        }

        if (isViewer) {
            getWorkflowCandidates()
                .then((res) => {
                    const builders = Array.isArray(res?.builders) ? res.builders : [];
                    setBuilderCandidates(builders);
                })
                .catch(() => {
                    setBuilderCandidates([]);
                });
        }
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

    function buildDto() {
        const dynamicFields = [];
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
                dynamicFields.push({
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
                    isCalculated: f.isCalculated || false,
                    formulaExpression: f.isCalculated ? (f.formulaExpression || null) : null,
                    precision: f.isCalculated ? (f.precision ?? 2) : 2,
                    lockAfterCalculation: f.isCalculated ? (f.lockAfterCalculation || false) : false,
                    parentGroupKey: f.parentGroupKey || null,
                    dependencies: f.dependencies || [],
                    disabled: f.disabled || false,
                    readOnly: f.readOnly || false,
                    groupId: f.groupId || null,
                });
            }
        });

        return {
            name: formName.trim(),
            description: formDescription.trim() || null,
            fields: dynamicFields,
            staticFields,
            groups: groups.map((g, i) => ({
                id: g.id,
                groupTitle: g.groupTitle || 'Untitled Section',
                groupDescription: g.groupDescription || '',
                groupOrder: i,
                rulesJson: g.rulesJson || null,
            })),
            allowMultipleSubmissions,
            visibility,
            allowedUsers,
            showTimestamp: true,
            expiresAt: expiresAt ? expiresAt : null,
        };
    }

    async function submitCreate(dto, builderIdForViewer = null) {
        setSaving(true);
        try {
            const created = await createForm(dto);

            if (isViewer) {
                await assignBuilder(created.id, Number(builderIdForViewer));
                toastSuccess('Form created and assigned to Builder successfully! 🎉');
            } else {
                toastSuccess('Form Created Successfully! 🎉');
            }

            router.push('/dashboard');
        } catch (err) {
            toastError(err.message || 'Failed to create form.');
        } finally {
            setSaving(false);
        }
    }

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

        const dto = buildDto();

        if (isViewer) {
            if (!Array.isArray(builderCandidates) || builderCandidates.length === 0) {
                toastError('No Builder is available right now. Please contact admin.');
                return;
            }
            setPendingDto(dto);
            setSelectedBuilderId('');
            setShowBuilderModal(true);
            return;
        }

        await submitCreate(dto);
    };

    const handleViewerConfirmBuilder = async () => {
        if (!selectedBuilderId) {
            toastError('Please select a Builder.');
            return;
        }
        if (!pendingDto) {
            toastError('Form data is missing. Please try saving again.');
            return;
        }

        setShowBuilderModal(false);
        await submitCreate(pendingDto, selectedBuilderId);
        setPendingDto(null);
    };

    const totalCount = fields.length;
    const dynamicCount = fields.filter(f => !STATIC_TYPES.has(f.fieldType)).length;
    const staticCount = fields.filter(f => STATIC_TYPES.has(f.fieldType) && f.fieldType !== 'page_break').length;
    const pageBreakCount = fields.filter(f => f.fieldType === 'page_break').length;
    const pageCount = pageBreakCount + 1; // pages = breaks + 1
    const singleSubmissionEnabled = !allowMultipleSubmissions;

    return (
        <>
            <Head>
                <title>New Form — FormCraft Builder</title>
            </Head>

            <div className="builder-page">
                {showBuilderModal && (
                    <div className="confirm-dialog" onClick={() => !saving && setShowBuilderModal(false)}>
                        <div className="confirm-box builder-assign-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="confirm-icon">🧭</div>
                            <h3>Select Builder</h3>
                            <p>Which Builder should verify and adopt this form?</p>
                            <select
                                className="form-input builder-assign-select"
                                value={selectedBuilderId}
                                onChange={(e) => setSelectedBuilderId(e.target.value)}
                                disabled={saving}
                            >
                                <option value="">Select Builder</option>
                                {builderCandidates.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name || b.username} ({b.username})
                                    </option>
                                ))}
                            </select>
                            <div className="confirm-actions builder-assign-actions">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowBuilderModal(false)}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleViewerConfirmBuilder}
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Confirm & Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Top Bar ─────────────────────────────────────────── */}
                <header className="builder-topbar">
                    <Link href="/dashboard" className="builder-topbar-brand" title="Back to Dashboard">
                        ⚡ FormCraft
                    </Link>

                    <input
                        id="form-name-input"
                        className="builder-form-name-input"
                        placeholder="Untitled Form…"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        maxLength={150}
                    />

                    <input
                        id="form-desc-input"
                        className="builder-form-name-input"
                        style={{ maxWidth: 240, fontWeight: 400, fontSize: 13 }}
                        placeholder="Description (optional)"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                    />

                    <div className="builder-topbar-actions">
                        {/* Field count badge */}
                        {totalCount > 0 && (
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
                                                    <span className="form-settings-toggle-desc">
                                                        {singleSubmissionEnabled
                                                            ? 'Enabled: each person can submit only once per session'
                                                            : 'Disabled: users can submit multiple times'}
                                                    </span>
                                                </div>
                                                <div className={`toggle-switch${singleSubmissionEnabled ? ' toggle-on' : ''}`} role="switch" aria-checked={singleSubmissionEnabled}>
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

                                            {!isViewer && (
                                                <>
                                                    {/* Visibility selector */}
                                                    <div className="form-settings-expiry">
                                                        <div className="form-settings-expiry-info">
                                                            <span className="form-settings-toggle-label">👁️ Form visibility</span>
                                                            <span className="form-settings-toggle-desc">
                                                                {visibility === 'PUBLIC' && 'PUBLIC: authenticated users can see this form. Admin and Role Administrator always have access.'}
                                                                {visibility === 'RESTRICTED' && 'RESTRICTED: explicit users selected below can see this form. Admin and Role Administrator always have access.'}
                                                                {visibility === 'PRIVATE' && 'PRIVATE: only the form owner plus Admin and Role Administrator can see this form.'}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <select
                                                                className="form-input"
                                                                value={visibility}
                                                                onChange={(e) => setVisibility(e.target.value)}
                                                                title="Select form visibility"
                                                                style={{ minWidth: 220 }}
                                                            >
                                                                <option value="PUBLIC">Public</option>
                                                                <option value="RESTRICTED">Restricted</option>
                                                                <option value="PRIVATE">Private</option>
                                                            </select>
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
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Preview (navigates to /preview/:id — only after save) */}
                        <Link href="/dashboard" className="btn btn-secondary btn-sm">
                            ← Cancel
                        </Link>

                        <button
                            id="save-form-btn"
                            className="btn btn-primary btn-sm"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</>
                            ) : (
                                '💾 Save Form'
                            )}
                        </button>
                    </div>
                </header>

                {/* ── Left Palette ─────────────────────────────────────── */}
                <FieldPalette />

                {/* ── Canvas ───────────────────────────────────────────── */}
                <main className="builder-canvas-wrap">
                    <Canvas fields={fields} setFields={setFields} groups={groups} setGroups={setGroups} />
                </main>
            </div>
        </>
    );
}
