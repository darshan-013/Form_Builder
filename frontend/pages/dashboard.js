import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getForms, deleteForm, publishForm } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';
import PageContainer from '../components/layout/PageContainer';
import SectionHeader from '../components/layout/SectionHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';

export default function DashboardPage() {
    const router = useRouter();
    const { can, user, hasRole, loading: authLoading } = useAuth();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [statusLoading, setStatusLoading] = useState({});

    // ── Per-section search ─────────────────────────────────
    const [publishedSearch, setPublishedSearch] = useState('');
    const [draftSearch, setDraftSearch] = useState('');

    // ── Per-section selection ──────────────────────────────
    const [publishedSelected, setPublishedSelected] = useState(new Set());
    const [draftSelected, setDraftSelected] = useState(new Set());

    // ── Per-section pagination ─────────────────────────────
    const [publishedPage, setPublishedPage] = useState(1);
    const [draftPage, setDraftPage] = useState(1);
    const pageSize = 9;

    // ── Bulk delete state ──────────────────────────────────
    const [bulkTarget, setBulkTarget] = useState(null); // 'published' | 'draft'
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        if (authLoading) return; // wait for auth context to resolve
        if (!user) { router.replace('/login'); return; }
        getForms()
            .then((data) => setForms(Array.isArray(data) ? data : []))
            .catch(() => toastError('Failed to load forms.'))
            .finally(() => setLoading(false));
    }, [authLoading, user, router]);

    // Reset page on search
    useEffect(() => { setPublishedPage(1); }, [publishedSearch]);
    useEffect(() => { setDraftPage(1); }, [draftSearch]);

    // ── Base sections ──────────────────────────────────────
    const allPublished = forms.filter((f) => f.status === 'PUBLISHED');
    const allDraft = forms.filter((f) => f.status !== 'PUBLISHED');

    // ── Filtered by search ─────────────────────────────────
    const match = (f, q) =>
        f.name?.toLowerCase().includes(q.toLowerCase()) ||
        (f.description || '').toLowerCase().includes(q.toLowerCase());

    const publishedForms = allPublished.filter((f) => match(f, publishedSearch));
    const draftForms = allDraft.filter((f) => match(f, draftSearch));

    // ── Selection helpers ──────────────────────────────────
    const toggle = (set, setFn, id) =>
        setFn((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const selectAllPublished = () => setPublishedSelected(new Set(publishedForms.map((f) => f.id)));
    const clearPublished = () => setPublishedSelected(new Set());
    const selectAllDraft = () => setDraftSelected(new Set(draftForms.map((f) => f.id)));
    const clearDraft = () => setDraftSelected(new Set());

    // ── Single delete ──────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteForm(deleteTarget.id);
            setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
            setPublishedSelected((p) => { const n = new Set(p); n.delete(deleteTarget.id); return n; });
            setDraftSelected((p) => { const n = new Set(p); n.delete(deleteTarget.id); return n; });
            toastSuccess(`"${deleteTarget.name}" deleted successfully.`);
        } catch { toastError('Failed to delete form.'); }
        finally { setDeleting(false); setDeleteTarget(null); }
    };

    // ── Bulk delete ────────────────────────────────────────
    const handleBulkDelete = async () => {
        const selectedSet = bulkTarget === 'published' ? publishedSelected : draftSelected;
        const clearFn = bulkTarget === 'published' ? clearPublished : clearDraft;
        setBulkDeleting(true);
        let deleted = 0;
        for (const id of [...selectedSet]) {
            try { await deleteForm(id); deleted++; } catch { }
        }
        setForms((prev) => prev.filter((f) => !selectedSet.has(f.id)));
        clearFn();
        setBulkDeleting(false);
        setBulkTarget(null);
        toastSuccess(`${deleted} form${deleted !== 1 ? 's' : ''} deleted.`);
    };

    // ── Publish ────────────────────────────────────────────
    const handlePublish = async (formId, formName) => {
        setStatusLoading((p) => ({ ...p, [formId]: true }));
        try {
            await publishForm(formId);
            setForms((prev) => prev.map((f) => f.id === formId ? { ...f, status: 'PUBLISHED' } : f));
            toastSuccess(`"${formName}" is now PUBLISHED! 🚀`);
        } catch { toastError('Failed to publish form.'); }
        finally { setStatusLoading((p) => ({ ...p, [formId]: false })); }
    };

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    // ── Card ───────────────────────────────────────────────
    const renderCard = (form, selectedSet, setSelectedFn) => {
        const isPublished = form.status === 'PUBLISHED';
        const isPending = form.status === 'PENDING_APPROVAL';
        const isRejected = form.status === 'REJECTED';
        const isAssigned = form.status === 'ASSIGNED';
        const busy = !!statusLoading[form.id];
        const isSelected = selectedSet.has(form.id);
        const isOwner = form.isOwner;
        const workflow = form.workflow;
        const formCanEdit = form.canEdit;
        const formCanDelete = form.canDelete;
        const formCanPublish = form.canPublish;
        const formCanStartWorkflow = !!(form.canStartWorkflow ?? form.canRequestWorkflow);
        const formCanAssignBuilder = !!form.canAssignBuilder;
        const formCanViewSubs = form.canViewSubmissions;

        return (
            <div key={form.id}
                className={`form-card animate-in${isPublished ? ' form-card-published' : ''}${isSelected ? ' form-card-selected' : ''}`}>

                <div className="form-card-header">
                    <div className="form-card-icon">{isPublished ? '🌐' : '📋'}</div>
                    <div className="form-card-menu">
                        {formCanEdit && !hasRole('Viewer') && (
                            <Link href={`/builder/${form.id}`}>
                                <Button variant="secondary" size="sm" title="Edit">✎</Button>
                            </Link>
                        )}
                        <Link href={`/preview/${form.id}`}>
                            <Button variant="secondary" size="sm" title="Preview">👁</Button>
                        </Link>
                        {formCanDelete && (
                            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(form)}>✕</Button>
                        )}
                    </div>
                </div>

                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <Badge variant={isPublished ? 'success' : isPending ? 'warning' : isRejected ? 'danger' : isAssigned ? 'info' : 'secondary'}>
                        {isPublished ? '🌐 Published' : isPending ? '⏳ Pending Approval' : isRejected ? '⛔ Rejected' : isAssigned ? '🧭 Assigned' : '📝 Draft'}
                    </Badge>
                    {!isOwner && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                            by {form.createdBy}
                        </span>
                    )}
                </div>

                <div className="form-card-name">{form.name}</div>
                <div className="form-card-desc">{form.description || 'No description'}</div>

                <div className="p-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 mb-3">
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--primary)' }}>
                        {workflow
                            ? `Workflow ${workflow.currentStepIndex}/${workflow.totalSteps} · ${workflow.status}`
                            : 'Workflow · NOT_STARTED'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {workflow
                            ? (workflow.currentFlowView || (workflow.flowChain || []).join(' -> ') || '—')
                            : (form.assignedBuilderUsername
                                ? `Assigned to ${form.assignedBuilderUsername}. Workflow not started yet.`
                                : 'No approval chain started yet.')}
                    </div>
                </div>

                <div className="form-card-footer">
                    <div className="form-card-meta">
                        <span>🔲 {form.fields?.length || 0} fields</span>
                        <span>📅 {formatDate(form.createdAt)}</span>
                    </div>
                    <div className="form-card-actions">
                        {isPublished ? (
                            <>
                                {formCanViewSubs && (
                                    <Link href={`/submissions/${form.id}`}>
                                        <Button variant="primary" size="sm">📊 Submissions</Button>
                                    </Link>
                                )}
                                <Link href={`/submit/${form.id}`}>
                                    <Button variant="secondary" size="sm">↗ Share</Button>
                                </Link>
                            </>
                        ) : (
                            <>
                                {formCanPublish && (
                                    <Button variant="primary" size="sm"
                                        onClick={() => handlePublish(form.id, form.name)} disabled={busy}>
                                        {busy ? <Spinner size="sm" /> : '🚀 Publish'}
                                    </Button>
                                )}
                                {formCanAssignBuilder && !isPending && (
                                    <Link href={`/workflows/create/${form.id}`}>
                                        <Button variant="secondary" size="sm">👤 Assign Builder</Button>
                                    </Link>
                                )}
                                {formCanStartWorkflow && !isPending && (
                                    <Link href={`/workflows/create/${form.id}`}>
                                        <Button variant="secondary" size="sm">🧭 Start Workflow</Button>
                                    </Link>
                                )}
                                {isPending && (
                                    <Link href="/workflows/status">
                                        <Button variant="secondary" size="sm">📍 Track Status</Button>
                                    </Link>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* ── Select checkbox — absolute bottom-right corner ── */}
                {formCanDelete && (
                    <label
                        className={`card-select-checkbox${isSelected ? ' card-select-checked' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                        title={isSelected ? 'Deselect' : 'Select'}
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(selectedSet, setSelectedFn, form.id)}
                        />
                        <span className="card-select-mark">{isSelected ? '✓' : ''}</span>
                    </label>
                )}
            </div>
        );
    };

    // ── Section header with search + selection bar ─────────
    const renderSectionBar = ({
        icon, title, totalCount, filteredCount,
        search, setSearch,
        selectedSet, selectAll, clearSel,
        section, accentClass,
    }) => {
        const allSel = filteredCount > 0 && selectedSet.size === filteredCount;
        return (
            <div className={`
                section-bar ${section === 'published' ? 'section-bar-published' : 'section-bar-draft'}
                mb-6 p-4 rounded-2xl border backdrop-blur-xl transition-all
            `}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Row 1: title + count */}
                <div className="section-bar-top">
                    <div className="section-bar-title">
                        <span className="section-bar-icon">{icon}</span>
                        <h2 className="dashboard-section-title">{title}</h2>
                        <span className="dashboard-section-count">{filteredCount}</span>
                        {search && filteredCount !== totalCount && (
                            <span className="section-filter-hint">of {totalCount}</span>
                        )}
                    </div>
                    {/* Selection badge + actions */}
                    {selectedSet.size > 0 && (
                        <div className="section-sel-row">
                            <span className="bulk-count">{selectedSet.size} selected</span>
                            <Button variant="secondary" size="sm" onClick={clearSel}>✕ Clear</Button>
                            {can('DELETE') && (
                                <Button variant="danger" size="sm"
                                    onClick={() => setBulkTarget(section)}>
                                    🗑 Delete {selectedSet.size}
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Row 2: search + select-all */}
                <div className="section-bar-bottom">
                    <div className="section-search-wrapper">
                        <span className="section-search-icon">🔍</span>
                        <input
                            className="section-search-input"
                            type="text"
                            placeholder={`Search ${title.toLowerCase()}…`}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <Button variant="secondary" size="xs" onClick={() => setSearch('')} style={{ minWidth: 'auto', padding: '0 8px' }}>✕</Button>
                        )}
                    </div>
                    <Button
                        variant={allSel ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={allSel ? clearSel : selectAll}
                        disabled={filteredCount === 0}
                    >
                        {allSel ? '☑ Deselect All' : '☐ Select All'}
                    </Button>
                </div>
            </div>
        </div>
        );
    };

    return (
        <>
            <Head><title>Dashboard — FormCraft</title></Head>

            <PageContainer>

                        <SectionHeader 
                            title={hasRole('Admin') ? 'All Forms' : hasRole('Builder') ? 'My Forms & Published' : 'Forms'}
                            subtitle={hasRole('Admin') ? 'Admin view — all forms across the system' : hasRole('Builder') ? 'Your forms and published forms you can access' : 'Published forms available to you'}
                            actions={
                                (can('WRITE') || hasRole('Viewer')) && (
                                    <Link href="/builder/new">
                                        <Button variant="primary" id="new-form-btn">+ New Form</Button>
                                    </Link>
                                )
                            }
                        />

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white/5 dark:bg-slate-900/50 backdrop-blur-md border border-gray-100 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1 transition-all">{forms.length}</div>
                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Forms</div>
                        </div>
                        <div className="bg-white/5 dark:bg-slate-900/50 backdrop-blur-md border border-gray-100 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-emerald-500">
                            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1 transition-all">{allPublished.length}</div>
                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Published</div>
                        </div>
                        <div className="bg-white/5 dark:bg-slate-900/50 backdrop-blur-md border border-gray-100 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-amber-500">
                            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1 transition-all">{allDraft.length}</div>
                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Drafts</div>
                        </div>
                        <div className="bg-white/5 dark:bg-slate-900/50 backdrop-blur-md border border-gray-100 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-indigo-500">
                            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1 transition-all">{forms.reduce((a, f) => a + (f.fields?.length || 0), 0)}</div>
                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Fields</div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Spinner size="lg" />
                            <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading your forms...</p>
                        </div>
                    ) : forms.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📋</div>
                            <h3>No forms yet</h3>
                            {(can('WRITE') || hasRole('Viewer')) ? (
                                <>
                                    <p>Create your first form to get started</p>
                                    <br />
                                    <Link href="/builder/new" className="btn btn-primary">+ Create Form</Link>
                                </>
                            ) : (
                                <>
                                    <p>Your account does not currently have form creation access.</p>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                                        Contact your Admin or Role Administrator to request additional permissions.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* ── Published Section ── */}
                            {allPublished.length > 0 && (
                                <section className="dashboard-section">
                                    {renderSectionBar({
                                        icon: '🌐', title: 'Published Forms',
                                        totalCount: allPublished.length, filteredCount: publishedForms.length,
                                        search: publishedSearch, setSearch: setPublishedSearch,
                                        selectedSet: publishedSelected,
                                        selectAll: selectAllPublished, clearSel: clearPublished,
                                        section: 'published', accentClass: 'section-bar-published',
                                    })}
                                    {publishedForms.length === 0 ? (
                                        <div className="section-empty">
                                            <span>🔍</span> No published forms match &ldquo;{publishedSearch}&rdquo;
                                            <button className="sb-btn sb-btn-ghost" style={{ marginLeft: 10 }}
                                                onClick={() => setPublishedSearch('')}>Clear</button>
                                        </div>
                                    ) : (
                                        <div className="dashboard-grid">
                                            {publishedForms
                                                .slice((publishedPage - 1) * pageSize, publishedPage * pageSize)
                                                .map((f) => renderCard(f, publishedSelected, setPublishedSelected))}
                                        </div>
                                    )}

                                    {/* Published Pagination */}
                                    {publishedForms.length > pageSize && (
                                        <div className="datatable-pagination" style={{ marginTop: '24px' }}>
                                        <Button variant="secondary" size="sm"
                                            disabled={publishedPage === 1}
                                            onClick={() => setPublishedPage(p => p - 1)}>‹ Prev</Button>
                                        <div className="pagination-pages">
                                            {Array.from({ length: Math.ceil(publishedForms.length / pageSize) }, (_, i) => i + 1).map(p => (
                                                <Button key={p}
                                                    variant={publishedPage === p ? 'primary' : 'secondary'}
                                                    size="sm"
                                                    onClick={() => setPublishedPage(p)}>{p}
                                                </Button>
                                            ))}
                                        </div>
                                        <Button variant="secondary" size="sm"
                                            disabled={publishedPage === Math.ceil(publishedForms.length / pageSize)}
                                            onClick={() => setPublishedPage(p => p + 1)}>Next ›</Button>
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* ── Draft Section ── */}
                            {allDraft.length > 0 && (
                                <section className="dashboard-section">
                                    {renderSectionBar({
                                        icon: '📝', title: 'Draft Forms',
                                        totalCount: allDraft.length, filteredCount: draftForms.length,
                                        search: draftSearch, setSearch: setDraftSearch,
                                        selectedSet: draftSelected,
                                        selectAll: selectAllDraft, clearSel: clearDraft,
                                        section: 'draft', accentClass: 'section-bar-draft',
                                    })}
                                    <p className="dashboard-section-hint">
                                        Draft forms are not visible to the public. Publish a form to start accepting submissions.
                                    </p>
                                    {draftForms.length === 0 ? (
                                        <div className="section-empty">
                                            <span>🔍</span> No draft forms match &ldquo;{draftSearch}&rdquo;
                                            <button className="sb-btn sb-btn-ghost" style={{ marginLeft: 10 }}
                                                onClick={() => setDraftSearch('')}>Clear</button>
                                        </div>
                                    ) : (
                                        <div className="dashboard-grid">
                                            {draftForms
                                                .slice((draftPage - 1) * pageSize, draftPage * pageSize)
                                                .map((f) => renderCard(f, draftSelected, setDraftSelected))}
                                        </div>
                                    )}

                                {/* Draft Pagination */}
                                {draftForms.length > pageSize && (
                                    <div className="datatable-pagination" style={{ marginTop: '24px' }}>
                                        <Button variant="secondary" size="sm"
                                            disabled={draftPage === 1}
                                            onClick={() => setDraftPage(p => p - 1)}>‹ Prev</Button>
                                        <div className="pagination-pages">
                                            {Array.from({ length: Math.ceil(draftForms.length / pageSize) }, (_, i) => i + 1).map(p => (
                                                <Button key={p}
                                                    variant={draftPage === p ? 'primary' : 'secondary'}
                                                    size="sm"
                                                    onClick={() => setDraftPage(p)}>{p}</Button>
                                            ))}
                                        </div>
                                        <Button variant="secondary" size="sm"
                                            disabled={draftPage === Math.ceil(draftForms.length / pageSize)}
                                            onClick={() => setDraftPage(p => p + 1)}>Next ›</Button>
                                    </div>
                                )}
                            </section>
                        )}
                    </>
                )}
            </PageContainer>

            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Form"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                            {deleting ? 'Deleting…' : 'Yes, Delete'}
                        </Button>
                    </>
                }
            >
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                        🗑
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                        Move <strong>&quot;{deleteTarget?.name}&quot;</strong> to deleted state?<br />
                        This is a soft delete and the form remains in storage.
                    </p>
                </div>
            </Modal>

            <Modal
                isOpen={!!bulkTarget}
                onClose={() => setBulkTarget(null)}
                title={`Delete ${bulkTarget === 'published' ? publishedSelected.size : draftSelected.size} Forms`}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setBulkTarget(null)} disabled={bulkDeleting}>Cancel</Button>
                        <Button variant="danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                            {bulkDeleting ? 'Deleting…' : `Yes, Delete All`}
                        </Button>
                    </>
                }
            >
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                        🗑
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                        Soft delete <strong>{bulkTarget === 'published' ? publishedSelected.size : draftSelected.size} {bulkTarget}</strong> form{(bulkTarget === 'published' ? publishedSelected.size : draftSelected.size) !== 1 ? 's' : ''}?<br />
                        Items will be marked deleted only.
                    </p>
                </div>
            </Modal>
        </>
    );
}

