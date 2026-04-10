    import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import FieldConfigModal from '../../components/Builder/FieldConfigModal';
import StaticFieldModal from '../../components/Builder/StaticFieldModal';
import GroupConfigModal from '../../components/Builder/GroupConfigModal';
import CustomValidationsPanel from '../../components/Builder/CustomValidationsPanel';
import { createForm, getForm, updateForm, getVisibilityCandidates, getFormVersions, publishForm, publishVersion, deleteFormVersion, isSchemaDriftError, saveSchemaDriftReport } from '../../services/api';
import { toastSuccess, toastError, toastInfo } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

const STATIC_TYPES = new Set(['section_header', 'label_text', 'description_block', 'page_break']);
const FORM_NAME_ALLOWED_REGEX = /^[A-Za-z_][A-Za-z0-9_ ]*$/;
const NEW_FORM_ROUTE_ID = 'new-form';
const NEW_FORM_META_KEY = 'builder_new_form_meta_v1';
const VIEW_ORDER = { canvas: 0, validations: 1, versions: 2 };

const sanitizeFormName = (value = '') => value.replace(/[^A-Za-z0-9_ ]+/g, '').replace(/\s{2,}/g, ' ');

const getFormNameError = (value, { requireValue = false } = {}) => {
    const normalized = sanitizeFormName(value).trim();
    if (!normalized) {
        return requireValue ? 'Form name is required.' : '';
    }
    if (normalized.length < 3) {
        return 'Form name must be at least 3 characters.';
    }
    if (!FORM_NAME_ALLOWED_REGEX.test(normalized)) {
        return 'Form name must start with a letter or underscore and contain only letters, numbers, spaces, and underscores.';
    }
    return '';
};

/**
 * Edit Form Builder Page — /builder/[id]
 * Loads existing form, allows editing fields, then PUTs changes.
 * DynamicTableService in backend will diff and ALTER TABLE accordingly.
 */
export default function EditBuilderPage() {
    const router = useRouter();
    const { id, versionId } = router.query;
    const isCreateMode = id === NEW_FORM_ROUTE_ID;
    const { hasRole } = useAuth();
    const isViewer = hasRole('Viewer');

    const [formName, setFormName] = useState('');
    const [nameError, setNameError] = useState('');
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
    const [versionStatus, setVersionStatus] = useState('DRAFT'); // 'PUBLISHED' or 'DRAFT'
    const [branching, setBranching] = useState(false);
    const [versions, setVersions] = useState([]);
    const [activeView, setActiveView] = useState('canvas'); // 'canvas' | 'versions'
    const [viewDirection, setViewDirection] = useState(1);
    const [confirmModal, setConfirmModal] = useState(null); // { type: 'publish'|'delete', versionId, versionNumber }
    const [actioning, setActioning] = useState(null); // tracking loading state for version actions
    const [isDirty, setIsDirty] = useState(false);
    const [initialSignature, setInitialSignature] = useState(null);
    const [currentVersionNumber, setCurrentVersionNumber] = useState(null);
    const [code, setCode] = useState('');

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


    const dynamicFields = useMemo(() => 
        fields.filter(f => !STATIC_TYPES.has(f.fieldType)),
    [fields]);

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
        setLoading(true);
        // Clear previous version state to prevent "ghost" fields/configs
        setFields([]);
        setGroups([]);
        setEditField(null);
        setEditStaticField(null);
        setEditGroupConfig(null);

        if (isCreateMode) {
            try {
                const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(NEW_FORM_META_KEY) : null;
                if (!raw) {
                    toastError('Please enter form details first.');
                    router.replace('/builder/new');
                    return;
                }

                const meta = JSON.parse(raw);
                const metaName = sanitizeFormName(meta?.name || '');
                const metaCode = String(meta?.code || '');
                const metaDescription = String(meta?.description || '');

                if (!metaName || !metaCode) {
                    toastError('Please enter valid form details first.');
                    router.replace('/builder/new');
                    return;
                }

                setFormName(metaName);
                setNameError(getFormNameError(metaName));
                setCode(metaCode);
                setFormDescription(metaDescription);
                setAllowMultipleSubmissions(true);
                setExpiresAt('');
                setAllowedUsers([]);
                setVersionStatus('DRAFT');
                setCurrentVersionNumber(null);
                setVersions([]);

                const loadedSignature = JSON.stringify({
                    formName: metaName,
                    formDescription: metaDescription,
                    allowMultipleSubmissions: true,
                    expiresAt: '',
                    allowedUsers: [],
                    fields: [],
                    groups: []
                });
                setInitialSignature(loadedSignature);
                setIsDirty(false);
            } catch {
                toastError('Failed to load pending form details. Please start again.');
                router.replace('/builder/new');
                return;
            } finally {
                setLoading(false);
            }
            return;
        }

        getForm(id, versionId)
            .then((form) => {
                // If no versionId in URL, redirect to the active version
                if (!versionId && form.activeVersionId) {
                    // Find the active version from versions list or use form.activeVersionId
                    router.replace(`/builder/${id}?versionId=${form.activeVersionId}`, undefined, { shallow: false });
                    return; // useEffect will re-run with the versionId
                }

                setFormName(sanitizeFormName(form.name || ''));
                setNameError('');
                setCode(form.code || '');
                setFormDescription(form.description || '');
                setAllowMultipleSubmissions(form.allowMultipleSubmissions ?? true);
                const resolvedCurrentStatus = String(form.versionStatus || (form.isActive ? 'PUBLISHED' : 'DRAFT')).toUpperCase();
                setVersionStatus(resolvedCurrentStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');
                setCurrentVersionNumber(form.versionNumber ?? null);

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

                // Set initial save state tracking
                let usersList = [];
                try {
                    if (form.allowedUsers) {
                        const parsed = typeof form.allowedUsers === 'string' ? JSON.parse(form.allowedUsers) : form.allowedUsers;
                        if (Array.isArray(parsed)) {
                            usersList = parsed.map(u => ({ id: u?.id ?? null, username: u?.username || '', name: u?.name || '' })).filter(u => u.id != null || u.username);
                        }
                    }
                } catch { }

                const loadedSignature = JSON.stringify({
                    formName: form.name || '',
                    formDescription: form.description || '',
                    allowMultipleSubmissions: form.allowMultipleSubmissions ?? true,
                    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString().slice(0, 16) : '',
                    allowedUsers: usersList,
                    fields: merged,
                    groups: loadedGroups
                });
                setInitialSignature(loadedSignature);
                setIsDirty(false);
            })
            .catch(() => toastError('Failed to load form.'))
            .finally(() => setLoading(false));

        // Also load all versions for history dropdown
        getFormVersions(id)
            .then(setVersions)
            .catch(() => console.error('Failed to load version history'));
    }, [id, versionId, isCreateMode]);

    useEffect(() => {
        if (initialSignature === null) return;
        const currentSignature = JSON.stringify({
            formName,
            formDescription,
            allowMultipleSubmissions,
            expiresAt,
            allowedUsers,
            fields,
            groups
        });
        setIsDirty(currentSignature !== initialSignature);
    }, [formName, formDescription, allowMultipleSubmissions, expiresAt, allowedUsers, fields, groups, initialSignature]);

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

    const hasSelection = !!(editField || editStaticField || editGroupConfig);
    const rightPanelRef = useRef(null);

    const handleViewChange = (nextView) => {
        if (nextView === activeView) return;
        const currentRank = VIEW_ORDER[activeView] ?? 0;
        const nextRank = VIEW_ORDER[nextView] ?? 0;
        setViewDirection(nextRank >= currentRank ? 1 : -1);
        setActiveView(nextView);
    };



    const handleSave = async ({ redirectAfterSave = true } = {}) => {
        const normalizedName = sanitizeFormName(formName).trim();
        const formNameValidationError = getFormNameError(normalizedName, { requireValue: true });

        if (formNameValidationError) {
            setNameError(formNameValidationError);
            toastError(formNameValidationError);
            return false;
        }

        // Validate field labels
        const dynamicFields = fields.filter(f => !STATIC_TYPES.has(f.fieldType));
        const missingLabel = dynamicFields.some(f => !f.label || !f.label.trim());
        if (missingLabel) {
            toastError("All fields must have a label.");
            return false;
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
            name: normalizedName,
            code: code || null,
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
            let savedFormId = null;

            if (isCreateMode) {
                const created = await createForm(dto);
                savedFormId = created?.formId ?? created?.id ?? null;
                if (!savedFormId) {
                    throw new Error('Form created, but no id was returned.');
                }
                if (typeof window !== 'undefined') {
                    window.sessionStorage.removeItem(NEW_FORM_META_KEY);
                }
            } else {
                await updateForm(id, versionId, dto);
            }

            setSaveSuccess(true);
            toastSuccess(isCreateMode ? 'Form created successfully! ✓' : 'Form Updated Successfully! ✓');

            const currentSignature = JSON.stringify({
                formName,
                formDescription,
                allowMultipleSubmissions,
                expiresAt,
                allowedUsers,
                fields,
                groups
            });
            setInitialSignature(currentSignature);
            setIsDirty(false);

            if (redirectAfterSave) {
                setTimeout(() => {
                    if (isCreateMode && savedFormId) {
                        router.replace(`/builder/${savedFormId}`);
                    } else {
                        router.push('/forms/vault');
                    }
                }, 800);
            }
            return savedFormId || true;
        } catch (err) {
            const nameMsg = Array.isArray(err?.errors)
                ? err.errors.find((e) => e?.field === 'name')?.message
                : null;
            if (nameMsg) {
                setNameError(nameMsg);
            }
            toastError(nameMsg || err.message || 'Failed to update form.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleOpenPreview = async () => {
        if (!id || saving) return;

        let canOpen = true;
        let previewFormId = id;
        if (isDirty || isCreateMode) {
            toastInfo('Saving latest changes before opening preview...');
            const saveResult = await handleSave({ redirectAfterSave: false });
            canOpen = !!saveResult;
            if (typeof saveResult === 'string') {
                previewFormId = saveResult;
            }
        }

        if (!canOpen) return;

        const previewHref = `/preview/${previewFormId}${versionId && !isCreateMode ? `?versionId=${versionId}` : ''}`;
        router.push(previewHref);
    };

    const redirectToDriftPage = (error, actionLabel) => {
        const driftReport = {
            source: 'builder',
            formId: id || null,
            formCode: code || null,
            action: actionLabel,
            at: new Date().toISOString(),
            message: error?.message || 'Schema drift detected',
            errorCode: error?.errorCode,
            errors: Array.isArray(error?.errors) ? error.errors : [],
            details: error?.details || null,
        };
        saveSchemaDriftReport(driftReport);
        toastError('Schema drift detected for this form. Publish is blocked until schema is fixed.');
        router.push('/schema-drift');
    };

    const handleActionConfirm = async () => {
        if (!confirmModal) return;
        const { type, versionId } = confirmModal;
        setActioning(versionId);
        setConfirmModal(null);
        try {
            if (type === 'publish') {
                await publishVersion(id, versionId);
                toastSuccess(`Version ${confirmModal.versionNumber} activated successfully.`);
                setActiveView('canvas');
                router.push(`/builder/${id}?versionId=${versionId}`); // Reload canvas for new version
            } else if (type === 'delete') {
                await deleteFormVersion(id, versionId);
                toastSuccess(`Version ${confirmModal.versionNumber} deleted.`);
                if (versionId === router.query.versionId) {
                    router.push(`/builder/${id}`); // fallback if they deleted what they were looking at
                } else {
                    getFormVersions(id).then(setVersions); // Refresh drawer
                }
            }
        } catch (error) {
            if (isSchemaDriftError(error)) {
                redirectToDriftPage(error, 'publishVersion');
                return;
            }
            toastError('Failed to perform action.');
            console.error(error);
        } finally {
            setActioning(null);
        }
    };

    /** Publish current active DRAFT version */
    const handlePublish = async () => {
        if (!process.browser) return;
        if (!id) return;
        setSaving(true);
        try {
            await publishForm(id);
            toastSuccess('Form published successfully!');
            router.push('/forms/vault');
        } catch (error) {
            if (isSchemaDriftError(error)) {
                redirectToDriftPage(error, 'publishForm');
                return;
            }
            toastError(error.message || 'Failed to publish form');
        } finally {
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

    // Policy 10 Limits
    const totalValidationCount = fields.reduce((acc, f) => {
        try {
            const rules = JSON.parse(f.validationJson || '{}');
            return acc + Object.values(rules).filter(v => v !== null && v !== undefined && v !== '' && v !== false).length;
        } catch (e) { return acc; }
    }, 0);

    const canAddField = dynamicCount < 50 && totalValidationCount < 100;
    const canAddGroup = groups.length < 10;

    const resolveVersionStatus = (version) => {
        const raw = version?.versionStatus ?? version?.status ?? (version?.isActive ? 'PUBLISHED' : 'DRAFT');
        return String(raw).toUpperCase() === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    };

    return (
        <>
            <Head><title>Edit Form — FormCraft Builder</title></Head>




            <div className="builder-page" style={{ gridTemplateColumns: hasSelection ? `${leftWidth}px 1fr ${rightWidth}px` : `${leftWidth}px 1fr` }}>
                <header className="builder-topbar">
                    <Link href="/dashboard" className="builder-topbar-brand">⚡ FormCraft</Link>

                    <div className="builder-topbar-meta">
                        <input
                            className="builder-form-name-input builder-topbar-title-input"
                            placeholder="Form name…"
                            value={formName}
                            onChange={(e) => {
                                const nextValue = sanitizeFormName(e.target.value);
                                setFormName(nextValue);
                                setNameError(getFormNameError(nextValue));
                                setIsDirty(true);
                                setSaveSuccess(false);
                            }}
                            aria-invalid={!!nameError}
                            title={nameError || 'Name must be at least 3 characters and can contain letters, numbers, spaces, and underscores.'}
                            style={nameError ? {
                                borderColor: 'rgba(248, 113, 113, 0.85)',
                                boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.45)'
                            } : undefined}
                        />
                        <input
                            className="builder-form-name-input builder-topbar-desc-input"
                            placeholder="Description (optional)"
                            value={formDescription}
                            onChange={(e) => {
                                setFormDescription(e.target.value);
                                setIsDirty(true);
                                setSaveSuccess(false);
                            }}
                        />
                    </div>

                    <div className="builder-topbar-left">
                        <div className="liquid-group" role="radiogroup" aria-label="Builder view toggle">
                            <input
                                type="radio"
                                id="builder-view-canvas"
                                name="builder-view-radio"
                                value="canvas"
                                checked={activeView === 'canvas'}
                                onChange={() => handleViewChange('canvas')}
                            />
                            <label htmlFor="builder-view-canvas">Canvas</label>

                            <input
                                type="radio"
                                id="builder-view-validations"
                                name="builder-view-radio"
                                value="validations"
                                checked={activeView === 'validations'}
                                onChange={() => handleViewChange('validations')}
                            />
                            <label htmlFor="builder-view-validations">Validations</label>

                            <input
                                type="radio"
                                id="builder-view-versions"
                                name="builder-view-radio"
                                value="versions"
                                checked={activeView === 'versions'}
                                onChange={() => handleViewChange('versions')}
                            />
                            <label htmlFor="builder-view-versions">Versions</label>

                            <div className="liquid-slider" aria-hidden="true" />
                        </div>
                    </div>

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
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleOpenPreview}
                            disabled={saving}
                        >
                            👁 Preview
                        </button>


                        {/* Save Changes button always visible, label changes based on status */}
                        <button
                            id="update-form-btn"
                            className={`btn btn-primary btn-sm ${saveSuccess ? 'btn-success-anim' : ''}`}
                            onClick={handleSave}
                            disabled={saving || saveSuccess || !isDirty}
                        >
                            {saveSuccess ? '✓ Saved!' : saving
                                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</>
                                : isCreateMode ? '💾 Create Form'
                                    : versionStatus === 'PUBLISHED' ? '💾 Save as New Draft' : '💾 Save Changes'}
                        </button>
                        
                        {/* Publish Version button only visible for Drafts */}
                        {!isCreateMode && versionStatus === 'DRAFT' && (
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handlePublish}
                                disabled={saving}
                                style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                            >
                                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🚀 Publish Version'}
                            </button>
                        )}

                    </div>
                </header>

                {/* Modal for Activation/Deletion */}
                {confirmModal && (
                    <div className="builder-modal-backdrop" onClick={() => setConfirmModal(null)} style={{ zIndex: 10001 }}>
                        <div className="builder-modal" onClick={e => e.stopPropagation()}>
                            <div className="builder-modal-icon">
                                {confirmModal.type === 'delete' ? '🗑️' : '🚀'}
                            </div>
                            <h3>{confirmModal.type === 'delete' ? 'Delete this version?' : (versionStatus === 'PUBLISHED' ? 'Activate this version?' : 'Publish this version?')}</h3>
                            <p>
                                {confirmModal.type === 'delete'
                                    ? "This version will be moved to the trash. You can restore it later if needed by contacting an administrator."
                                    : "Are you sure you want to activate this version? It will instantly replace the current live version of this form."
                                }
                            </p>
                            <div className="builder-modal-actions">
                                <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                                <button 
                                    className={`btn ${confirmModal.type === 'delete' ? 'btn-danger' : 'btn-publish'}`} 
                                    onClick={handleActionConfirm}
                                    disabled={!!actioning}
                                >
                                    {actioning ? '⌛' : (confirmModal.type === 'delete' ? 'Yes, Delete' : 'Yes, Activate')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <AnimatePresence mode="wait" initial={false} custom={viewDirection}>
                    <motion.div
                        key={activeView}
                        custom={viewDirection}
                        initial={{ opacity: 0, x: viewDirection > 0 ? 22 : -22, y: 4 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, x: viewDirection > 0 ? -16 : 16, y: -2 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        style={{ display: 'contents' }}
                    >
                {activeView === 'canvas' ? (
                    <>
                        <div 
                            className={`panel-resizer left-resizer ${resizing === 'left' ? 'resizing' : ''}`}
                            onMouseDown={() => setResizing('left')}
                        />
                        <FieldPalette canAddField={canAddField} canAddGroup={canAddGroup} />
                        <main className="builder-canvas-wrap">
                            {/* Version info badge */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 14,
                                padding: '8px 20px',
                                margin: '8px 12px 14px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid var(--border)',
                                borderRadius: 12,
                                fontSize: 12,
                                whiteSpace: 'nowrap',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        padding: '2px 10px', borderRadius: 999, fontWeight: 700, fontSize: 11,
                                        background: versionStatus === 'PUBLISHED' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                        color: versionStatus === 'PUBLISHED' ? '#34D399' : '#FCD34D',
                                        border: `1px solid ${versionStatus === 'PUBLISHED' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                        letterSpacing: '0.04em', textTransform: 'uppercase'
                                    }}>
                                        {versionStatus === 'PUBLISHED' ? '✅ Active' : '📝 Draft'}
                                    </span>
                                    {currentVersionNumber && (
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
                                            Version {currentVersionNumber}
                                        </span>
                                    )}
                                </div>

                                <span style={{ width: 1, height: 18, background: 'var(--border)', opacity: 0.7, flexShrink: 0 }} />

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="builder-code-block" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 'none', margin: 0 }}>
                                        <span className="builder-code-badge" title={`Form code: ${code}`} style={{ width: 'auto', padding: '4px 10px', borderRadius: 8 }}>
                                            <span style={{ opacity: 0.88 }}>🔖</span>
                                            <span style={{ fontSize: 11 }}>Code:</span>
                                            <strong className="builder-code-value" style={{ fontSize: 12 }}>{code || '—'}</strong>
                                        </span>
                                        <span className="builder-code-help" style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            (Locked after first save)
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <Canvas
                                fields={fields} setFields={setFields}
                                groups={groups} setGroups={setGroups}
                                setEditField={setEditField}
                                setEditStaticField={setEditStaticField}
                                setEditGroupConfig={setEditGroupConfig}
                                canAddField={canAddField}
                                canAddGroup={canAddGroup}
                            />
                        </main>
                        <AnimatePresence initial={false}>
                            {hasSelection && (
                                <>
                                    <div
                                        className={`panel-resizer right-resizer ${resizing === 'right' ? 'resizing' : ''}`}
                                        onMouseDown={() => setResizing('right')}
                                    />
                                    <motion.aside
                                        ref={rightPanelRef}
                                        className="builder-right-panel"
                                        initial={{ x: 20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: 20, opacity: 0 }}
                                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                    >
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
                                        ) : null}
                                    </motion.aside>
                                </>
                            )}
                        </AnimatePresence>
                    </>
                ) : activeView === 'validations' ? (
                    <div className="vh-full-view" style={{ gridColumn: '1 / -1', padding: '40px', overflowY: 'auto', background: 'var(--bg-base)' }}>
                        <div style={{ maxWidth: 800, margin: '0 auto' }}>
                           <CustomValidationsPanel 
                               formId={id} 
                               versionId={versionId || (versions[0]?.id)} 
                               fields={fields.filter(f => !STATIC_TYPES.has(f.fieldType))} 
                           />
                        </div>
                    </div>
                ) : (
                    <div className="vh-full-view" style={{ gridColumn: '1 / -1', padding: '40px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: 800, margin: '0 auto' }}>
                            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                                <h2>Form Version History</h2>
                                <p style={{ color: 'var(--text-muted)' }}>View previous drafts and published versions of this form.</p>
                            </div>
                            <div className="timeline">
                                {versions.map((v, index) => {
                                    const normalizedStatus = resolveVersionStatus(v);
                                    const st = normalizedStatus.toLowerCase();
                                    const isLast = index === versions.length - 1;
                                    const isCurrentlyViewing = v.id === (versionId || versions[0]?.id);
                                    
                                    return (
                                        <div key={v.id} className={`tl-item ${st}`} style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', marginBottom: isLast ? 0 : '24px' }}>
                                            <div className="tl-connector" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20, paddingTop: 14 }}>
                                                <div className="tl-dot" style={{
                                                    width: 18, height: 18, borderRadius: '50%',
                                                    border: `4px solid ${st === 'published' ? 'var(--success)' : 'var(--warning)'}`,
                                                    background: st === 'published' ? 'var(--success)' : 'var(--bg-base)',
                                                    boxShadow: st === 'published' ? '0 0 16px rgba(16,185,129,0.5)' : 'none',
                                                    zIndex: 2
                                                }} />
                                                {!isLast && <div className="tl-line" style={{ width: 2, flex: 1, minHeight: 60, background: 'var(--border)', margin: '8px 0', opacity: 0.5 }} />}
                                            </div>

                                            <div className="tl-card" style={{
                                                flex: 1, padding: '24px', borderRadius: '16px',
                                                border: `2px solid ${isCurrentlyViewing ? 'var(--accent)' : 'var(--border)'}`,
                                                background: isCurrentlyViewing ? 'var(--bg-card)' : 'rgba(255,255,255,0.02)',
                                                position: 'relative',
                                                boxShadow: isCurrentlyViewing ? '0 8px 30px rgba(0,0,0,0.2)' : 'none'
                                            }}>
                                                {st === 'published' && (
                                                    <div style={{ position: 'absolute', top: 0, right: 24, background: 'var(--success)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: '0 0 8px 8px', letterSpacing: '0.1em' }}>
                                                        LIVE
                                                    </div>
                                                )}
                                                
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                                    <div style={{ fontWeight: 800, fontSize: '1.5rem', color: isCurrentlyViewing ? 'var(--primary)' : 'var(--text-base)' }}>
                                                        v{v.versionNumber}
                                                    </div>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                                                        color: st === 'published' ? 'var(--success)' : 'var(--warning)',
                                                        background: st === 'published' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                                        border: `1px solid ${st === 'published' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`
                                                    }}>{normalizedStatus}</span>
                                                </div>

                                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                                                    {st === 'draft' && (
                                                        <button
                                                            className="btn btn-sm btn-publish"
                                                            onClick={() => setConfirmModal({ type: 'publish', versionId: v.id, versionNumber: v.versionNumber })}
                                                            disabled={!!actioning}
                                                            style={{ fontSize: 13, padding: '8px 16px' }}
                                                        >
                                                            {actioning === v.id ? '⌛' : '🚀 Activate Form'}
                                                        </button>
                                                    )}
                                                    {st !== 'published' && (
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => setConfirmModal({ type: 'delete', versionId: v.id, versionNumber: v.versionNumber })}
                                                            disabled={!!actioning}
                                                            style={{ color: 'var(--error)', borderColor: 'var(--border)', fontSize: 13, padding: '8px 16px' }}
                                                        >
                                                            {actioning === v.id ? '⌛' : '🗑️ Delete'}
                                                        </button>
                                                    )}
                                                    {!isCurrentlyViewing && (
                                                        <button 
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => {
                                                                router.push(`/builder/${id}?versionId=${v.id}`);
                                                                setActiveView('canvas');
                                                            }}
                                                            style={{ fontSize: 13, padding: '8px 16px' }}
                                                        >
                                                            👁 Load on Canvas
                                                        </button>
                                                    )}
                                                    {isCurrentlyViewing && (
                                                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                                                            ✓ Currently viewing
                                                        </span>
                                                    )}
                                                </div>

                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                    <div>Created {new Date(v.createdAt).toLocaleDateString()} {v.createdBy && `by ${v.createdBy}`}</div>
                                                    {v.publishedAt && <div>Published {new Date(v.publishedAt).toLocaleDateString()}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <style jsx global>{`
                .builder-modal-backdrop {
                    position: fixed; inset: 0; z-index: 9999;
                    background: rgba(0,0,0,0.55);
                    display: flex; align-items: center; justify-content: center;
                    padding: 24px;
                    backdrop-filter: blur(4px);
                    animation: bm-fade 0.15s ease;
                }
                .builder-modal {
                    background: var(--bg-card, #1e1e2e);
                    border: 1px solid var(--border, rgba(255,255,255,0.1));
                    border-radius: 18px;
                    padding: 36px 32px 28px;
                    max-width: 440px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 24px 80px rgba(0,0,0,0.45);
                    animation: bm-up 0.2s ease;
                    color: var(--text-primary, #fff);
                }
                .builder-modal-icon { font-size: 2.4rem; margin-bottom: 10px; }
                .builder-modal h3 { font-size: 1.25rem; font-weight: 700; margin: 0 0 10px; }
                .builder-modal p { color: var(--text-secondary, #94a3b8); font-size: 0.92rem; line-height: 1.6; margin: 0 0 24px; }
                .builder-modal-actions { display: flex; gap: 10px; justify-content: center; }
                .btn-publish {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 8px 22px; border-radius: 8px;
                    font-size: 0.9rem; font-weight: 600; cursor: pointer;
                    background: #10b981; color: #fff; border: none;
                    transition: background 0.15s;
                }
                .btn-publish:hover { background: #059669; }
                @keyframes bm-fade { from { opacity: 0 } to { opacity: 1 } }
                @keyframes bm-up   { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
                
                /* View Toggle Styles */
                .view-toggle {
                    display: inline-flex;
                    background: rgba(0, 0, 0, 0.2);
                    padding: 4px;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                }
                .view-toggle-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    padding: 6px 14px;
                    margin: 0;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .view-toggle-btn:hover {
                    color: var(--text-base);
                }
                .view-toggle-btn.active {
                    background: var(--bg-card);
                    color: var(--primary);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
            `}</style>
        </>
    );
}
