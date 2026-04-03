import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import UserProfileChip from '../components/UserProfileChip';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle, Edit3, MessageSquare, Clock, Plus } from 'lucide-react';
import { getForms, deleteForm, publishForm, getDashboardStats } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
    const router = useRouter();
    const { can, user, hasRole, loading: authLoading } = useAuth();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [statusLoading, setStatusLoading] = useState({});
    const [stats, setStats] = useState(null);

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
        
        Promise.all([
            getForms(),
            getDashboardStats()
        ])
        .then(([formsData, statsData]) => {
            setForms(Array.isArray(formsData) ? formsData : []);
            setStats(statsData);
        })
        .catch(() => toastError('Failed to load dashboard data.'))
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
                            <Link href={`/builder/${form.id}`} className="btn btn-secondary btn-sm" title="Edit">✎</Link>
                        )}
                        <Link href={`/preview/${form.id}`} className="btn btn-secondary btn-sm" title="Preview">👁</Link>
                        {formCanDelete && (
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(form)}>✕</button>
                        )}
                    </div>
                </div>

                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <span className={`status-badge status-badge-${isPublished ? 'published' : 'draft'}`} style={
                        isPending ? { background: 'rgba(245,158,11,0.18)', color: '#FCD34D', borderColor: 'rgba(245,158,11,0.35)' } :
                            isRejected ? { background: 'rgba(239,68,68,0.18)', color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.35)' } :
                                undefined
                    }>
                        {isPublished ? '🌐 Published' : isPending ? '⏳ Pending Approval' : isRejected ? '⛔ Rejected' : isAssigned ? '🧭 Assigned' : '📝 Draft'}
                    </span>
                    {!isOwner && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                            by {form.createdBy}
                        </span>
                    )}
                </div>

                <div className="form-card-name">{form.name}</div>
                <div className="form-card-desc">{form.description || 'No description'}</div>

                <div style={{
                    marginBottom: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(99,102,241,0.22)',
                    background: 'rgba(99,102,241,0.08)'
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#C7D2FE' }}>
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
                                    <Link href={`/submissions/${form.id}`} className="btn btn-primary btn-sm">📊 Submissions</Link>
                                )}
                                <Link href={`/submit/${form.id}`} className="btn btn-secondary btn-sm">↗ Share</Link>
                            </>
                        ) : (
                            <>
                                {formCanPublish && (
                                    <button className="btn btn-publish btn-sm"
                                        onClick={() => handlePublish(form.id, form.name)} disabled={busy}>
                                        {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '🚀 Publish'}
                                    </button>
                                )}
                                {formCanAssignBuilder && !isPending && (
                                    <Link href={`/workflows/create/${form.id}`} className="btn btn-secondary btn-sm">
                                        👤 Assign Builder
                                    </Link>
                                )}
                                {formCanStartWorkflow && !isPending && (
                                    <Link href={`/workflows/create/${form.id}`} className="btn btn-secondary btn-sm">
                                        🧭 Start Workflow
                                    </Link>
                                )}
                                {isPending && (
                                    <Link href="/workflows/status" className="btn btn-secondary btn-sm">
                                        📍 Track Status
                                    </Link>
                                )}
                            </>
                        )}
                        {/* Version History now accessed from within the Builder */}
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
            <div className={`section-bar ${accentClass}`}>
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
                            <button className="sb-btn sb-btn-ghost" onClick={clearSel}>✕ Clear</button>
                            {can('DELETE') && (
                                <button className="sb-btn sb-btn-danger"
                                    onClick={() => setBulkTarget(section)}>
                                    🗑 Delete {selectedSet.size}
                                </button>
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
                            <button className="section-search-clear" onClick={() => setSearch('')}>✕</button>
                        )}
                    </div>
                    <button
                        className={`sb-btn ${allSel ? 'sb-btn-active' : 'sb-btn-ghost'}`}
                        onClick={allSel ? clearSel : selectAll}
                        disabled={filteredCount === 0}
                    >
                        {allSel ? '☑ Deselect All' : '☐ Select All'}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            <Head><title>Dashboard — FormCraft</title></Head>

            <div className="page">
                <Navbar />
                <UserProfileChip />
                <div className="container">

                    {/* Page header */}
                    <div className="page-header">
                        <div>
                            <h1 className="page-title">
                                {hasRole('Admin') ? 'All Forms' :
                                    hasRole('Builder') ? 'My Forms & Published' :
                                        'Forms'}
                            </h1>
                            <p className="page-subtitle">
                                {hasRole('Admin') ? 'Admin view — all forms across the system' :
                                    hasRole('Builder') ? 'Your forms and published forms you can access' :
                                        'Published forms available to you'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {(can('WRITE') || hasRole('Viewer')) && (
                                <Link href="/builder/new" className="btn btn-primary" id="new-form-btn">+ New Form</Link>
                            )}
                            <Link href="/forms/trash" className="btn btn-secondary" title="View deleted forms">
                                🗑 Trash
                            </Link>
                        </div>
                    </div>

                    {/* Stats Section with Framer Motion */}
                    <div className="dashboard-stats">
                        <motion.div 
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                                <FileText size={20} color="#8B5CF6" />
                            </div>
                            <div className="stat-label">Total Forms</div>
                            <div className="stat-value">{stats?.totalForms ?? 0}</div>
                        </motion.div>

                        <motion.div 
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                                <CheckCircle size={20} color="#10B981" />
                            </div>
                            <div className="stat-label">Published Forms</div>
                            <div className="stat-value">{stats?.publishedCount ?? 0}</div>
                        </motion.div>

                        <motion.div 
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                                <Edit3 size={20} color="#F59E0B" />
                            </div>
                            <div className="stat-label">Draft Forms</div>
                            <div className="stat-value">{stats?.draftCount ?? 0}</div>
                        </motion.div>

                        <motion.div 
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(6, 182, 212, 0.1)' }}>
                                <MessageSquare size={20} color="#06B6D4" />
                            </div>
                            <div className="stat-label">Total Submissions</div>
                            <div className="stat-value">{stats?.totalSubmissions ?? 0}</div>
                        </motion.div>

                        <motion.div 
                            className="stat-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                        >
                            <div className="stat-icon-bg" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                                <Clock size={20} color="#6366F1" />
                            </div>
                            <div className="stat-label">Last Modified</div>
                            <div className="stat-value" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {stats?.recentForms?.[0]?.name || 'N/A'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                {stats?.recentForms?.[0] ? formatDate(stats.recentForms[0].updatedAt) : 'No recent activity'}
                            </div>
                        </motion.div>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
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
                                            <button className="btn btn-secondary btn-sm"
                                                disabled={publishedPage === 1}
                                                onClick={() => setPublishedPage(p => p - 1)}>‹ Prev</button>
                                            <div className="pagination-pages">
                                                {Array.from({ length: Math.ceil(publishedForms.length / pageSize) }, (_, i) => i + 1).map(p => (
                                                    <button key={p}
                                                        className={`btn btn-sm ${publishedPage === p ? 'btn-primary' : 'btn-secondary'}`}
                                                        onClick={() => setPublishedPage(p)}>{p}</button>
                                                ))}
                                            </div>
                                            <button className="btn btn-secondary btn-sm"
                                                disabled={publishedPage === Math.ceil(publishedForms.length / pageSize)}
                                                onClick={() => setPublishedPage(p => p + 1)}>Next ›</button>
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
                                            <button className="btn btn-secondary btn-sm"
                                                disabled={draftPage === 1}
                                                onClick={() => setDraftPage(p => p - 1)}>‹ Prev</button>
                                            <div className="pagination-pages">
                                                {Array.from({ length: Math.ceil(draftForms.length / pageSize) }, (_, i) => i + 1).map(p => (
                                                    <button key={p}
                                                        className={`btn btn-sm ${draftPage === p ? 'btn-primary' : 'btn-secondary'}`}
                                                        onClick={() => setDraftPage(p)}>{p}</button>
                                                ))}
                                            </div>
                                            <button className="btn btn-secondary btn-sm"
                                                disabled={draftPage === Math.ceil(draftForms.length / pageSize)}
                                                onClick={() => setDraftPage(p => p + 1)}>Next ›</button>
                                        </div>
                                    )}
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Single delete confirm ── */}
            {deleteTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">🗑</div>
                        <h3>Delete Form</h3>
                        <p>
                            Move <strong>&quot;{deleteTarget.name}&quot;</strong> to deleted state?<br />
                            This is a soft delete and the form remains in storage.
                        </p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Deleting…' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk delete confirm ── */}
            {bulkTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">🗑</div>
                        <h3>Delete {bulkTarget === 'published' ? publishedSelected.size : draftSelected.size} Form{(bulkTarget === 'published' ? publishedSelected.size : draftSelected.size) !== 1 ? 's' : ''}</h3>
                        <p>
                            Soft delete <strong>{bulkTarget === 'published' ? publishedSelected.size : draftSelected.size} {bulkTarget}</strong> form{(bulkTarget === 'published' ? publishedSelected.size : draftSelected.size) !== 1 ? 's' : ''}?<br />
                            Items will be marked deleted only.
                        </p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setBulkTarget(null)} disabled={bulkDeleting}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                                {bulkDeleting ? 'Deleting…' : `Yes, Delete All`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

