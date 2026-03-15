import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import FieldPalette from '../../components/Builder/FieldPalette';
import Canvas from '../../components/Builder/Canvas';
import { getForm, updateForm, getVisibilityCandidates } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';
import PageContainer from '../../components/layout/PageContainer';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';

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
    const [visibility, setVisibility] = useState('PUBLIC');
    const [showSettings, setShowSettings] = useState(false);

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
                setVisibility(form.visibility || 'PUBLIC');

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

    const handleSave = async () => {
        if (!formName.trim()) { toastError('Form name is required.'); return; }

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
            fields: dynamicFields,
            staticFields: staticFields,
            groups: groups.map((g, i) => ({
                id: g.id,
                groupTitle: g.groupTitle || 'Untitled Section',
                groupDescription: g.groupDescription || '',
                groupOrder: i,
                rulesJson: g.rulesJson || null,
            })),
            allowMultipleSubmissions: allowMultipleSubmissions,
            visibility: visibility,
            allowedUsers: allowedUsers,
            showTimestamp: true, // always recorded — compulsory
            expiresAt: expiresAt ? expiresAt : null,
        };

        setSaving(true);
        try {
            await updateForm(id, dto);
            toastSuccess('Form Updated Successfully! ✓');
            router.push('/dashboard');
        } catch (err) {
            toastError(err.message || 'Failed to update form.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="text-center space-y-4">
                    <Spinner size="lg" />
                    <p className="text-gray-500 animate-pulse">Initializing builder...</p>
                </div>
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

            <div className="builder-grid">
                <header className="builder-topbar sticky top-0 z-50 flex items-center gap-4 px-6 h-16 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl animate-slide-down">
                    <Link href="/dashboard" className="builder-topbar-brand text-xl font-black bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                        ⚡ FormCraft
                    </Link>

                    <input
                        className="flex-1 max-w-sm px-4 py-2 text-sm font-semibold bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all"
                        placeholder="Untitled Form"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                    />
                    <input
                        className="hidden md:block flex-1 max-w-xs px-4 py-2 text-xs text-slate-400 bg-transparent border-none focus:outline-none focus:ring-0"
                        placeholder="Add a description..."
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                    />

                    <div className="flex items-center gap-3 ml-auto">
                        {fields.length > 0 && (
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400">
                                <span>{dynamicCount} Fields</span>
                                {staticCount > 0 && <span className="opacity-30">|</span>}
                                {staticCount > 0 && <span>{staticCount} Static</span>}
                                {pageBreakCount > 0 && <span className="opacity-30">|</span>}
                                {pageBreakCount > 0 && <span>{pageCount} Pages</span>}
                            </div>
                        )}

                        <div className="relative">
                            <Button
                                variant={showSettings ? 'primary' : 'secondary'}
                                size="sm"
                                className={`rounded-xl px-4 h-10 flex items-center gap-2 font-semibold transition-all ${showSettings ? 'ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-500/20' : ''}`}
                                onClick={() => setShowSettings(v => !v)}
                            >
                                <span className="text-lg">⚙️</span>
                                <span className="hidden sm:inline">Settings</span>
                            </Button>

                            {/* Settings dropdown */}
                            {showSettings && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                                    <div className="absolute right-0 mt-3 w-80 p-5 rounded-2xl bg-slate-900/90 border border-white/10 backdrop-blur-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Form Settings</span>
                                            <button className="text-slate-400 hover:text-white" onClick={() => setShowSettings(false)}>✕</button>
                                        </div>

                                        {/* Toggle: Limit to one submission */}
                                        <div className="flex items-center justify-between p-3 mb-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group" onClick={() => setAllowMultipleSubmissions(v => !v)}>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-bold text-slate-200">🔒 Limit to 1 submission</span>
                                                <p className="text-[10px] text-slate-500 leading-tight">Restrict users to one entry per session</p>
                                            </div>
                                            <div className={`w-8 h-4 rounded-full transition-colors relative ${!allowMultipleSubmissions ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${!allowMultipleSubmissions ? 'left-4.5' : 'left-0.5'}`} />
                                            </div>
                                        </div>

                                        {/* Expiry date-time picker */}
                                        <div className="mb-4">
                                            <span className="text-xs font-bold text-slate-200 block mb-2">📅 Form Expiry</span>
                                            <div className="flex gap-2">
                                                <input
                                                    type="datetime-local"
                                                    className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                                    value={expiresAt}
                                                    min={new Date().toISOString().slice(0, 16)}
                                                    onChange={e => setExpiresAt(e.target.value)}
                                                />
                                                {expiresAt && (
                                                    <button 
                                                        className="p-2 text-slate-500 hover:text-rose-500 transition-colors"
                                                        onClick={() => setExpiresAt('')}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Visibility Search */}
                                        <div className="pt-2">
                                            <span className="text-xs font-bold text-slate-200 block mb-2">👥 Restricted Access</span>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500/50 mb-2"
                                                placeholder="Search users..."
                                                value={userSearch}
                                                onChange={(e) => setUserSearch(e.target.value)}
                                            />
                                            {filteredVisibilityUsers.length > 0 && (
                                                <div className="max-h-32 overflow-y-auto rounded-lg border border-white/5 bg-black/20 mb-3">
                                                    {filteredVisibilityUsers.map(user => (
                                                        <button
                                                            key={`${user.id ?? 'u'}-${user.username}`}
                                                            className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-indigo-500/20 transition-colors border-b border-white/5 last:border-0"
                                                            onClick={() => addAllowedUser(user)}
                                                        >
                                                            <span className="font-bold text-slate-200">{user.name || user.username}</span>
                                                            <span className="text-slate-500 ml-2">@{user.username}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {allowedUsers.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {allowedUsers.map(user => (
                                                        <span key={`${user.id ?? 'u'}-${user.username}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[9px] text-indigo-400">
                                                            {user.username}
                                                            <button className="hover:text-white" onClick={() => removeAllowedUser(user)}>✕</button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <Link href={`/preview/${id}`}>
                            <Button variant="secondary" size="sm" className="rounded-xl px-4 h-10 font-semibold">
                                <span className="text-lg mr-2">👁</span>
                                <span className="hidden sm:inline">Preview</span>
                            </Button>
                        </Link>

                        <Button
                            id="update-form-btn"
                            variant="primary"
                            size="sm"
                            className="rounded-xl px-6 h-10 font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25 transition-all active:scale-95 flex items-center gap-2"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <><Spinner size="sm" /> <span>Saving…</span></>
                            ) : (
                                <><span className="text-lg">💾</span> <span>Save Changes</span></>
                            )}
                        </Button>
                    </div>
                </header>

                <PageContainer size="full" py={false}>
                    <div className="flex gap-6 mt-4">
                        <FieldPalette />
                        <main className="flex-1 min-w-0">
                            <Canvas fields={fields} setFields={setFields} groups={groups} setGroups={setGroups} />
                        </main>
                    </div>
                </PageContainer>
            </div>
        </>
    );
}
