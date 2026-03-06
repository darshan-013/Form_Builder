import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { getForms, deleteForm, getMe, publishForm } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';

export default function DashboardPage() {
    const router = useRouter();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [statusLoading, setStatusLoading] = useState({});

    // ── Per-section search ─────────────────────────────────
    const [publishedSearch, setPublishedSearch] = useState('');
    const [draftSearch, setDraftSearch]         = useState('');

    // ── Per-section selection ──────────────────────────────
    const [publishedSelected, setPublishedSelected] = useState(new Set());
    const [draftSelected, setDraftSelected]         = useState(new Set());

    // ── Bulk delete state ──────────────────────────────────
    const [bulkTarget, setBulkTarget]   = useState(null); // 'published' | 'draft'
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        getMe()
            .catch(() => router.replace('/login'))
            .then(() => getForms())
            .then((data) => setForms(Array.isArray(data) ? data : []))
            .catch(() => toastError('Failed to load forms.'))
            .finally(() => setLoading(false));
    }, [router]);

    // ── Base sections ──────────────────────────────────────
    const allPublished = forms.filter((f) => f.status === 'PUBLISHED');
    const allDraft     = forms.filter((f) => !f.status || f.status === 'DRAFT');

    // ── Filtered by search ─────────────────────────────────
    const match = (f, q) =>
        f.name?.toLowerCase().includes(q.toLowerCase()) ||
        (f.description || '').toLowerCase().includes(q.toLowerCase());

    const publishedForms = allPublished.filter((f) => match(f, publishedSearch));
    const draftForms     = allDraft.filter((f) => match(f, draftSearch));

    // ── Selection helpers ──────────────────────────────────
    const toggle = (set, setFn, id) =>
        setFn((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const selectAllPublished = () => setPublishedSelected(new Set(publishedForms.map((f) => f.id)));
    const clearPublished     = () => setPublishedSelected(new Set());
    const selectAllDraft     = () => setDraftSelected(new Set(draftForms.map((f) => f.id)));
    const clearDraft         = () => setDraftSelected(new Set());

    // ── Single delete ──────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteForm(deleteTarget.id);
            setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
            setPublishedSelected((p) => { const n = new Set(p); n.delete(deleteTarget.id); return n; });
            setDraftSelected((p)     => { const n = new Set(p); n.delete(deleteTarget.id); return n; });
            toastSuccess(`"${deleteTarget.name}" deleted.`);
        } catch { toastError('Failed to delete form.'); }
        finally { setDeleting(false); setDeleteTarget(null); }
    };

    // ── Bulk delete ────────────────────────────────────────
    const handleBulkDelete = async () => {
        const selectedSet = bulkTarget === 'published' ? publishedSelected : draftSelected;
        const clearFn     = bulkTarget === 'published' ? clearPublished : clearDraft;
        setBulkDeleting(true);
        let deleted = 0;
        for (const id of [...selectedSet]) {
            try { await deleteForm(id); deleted++; } catch {}
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
        const busy        = !!statusLoading[form.id];
        const isSelected  = selectedSet.has(form.id);
        return (
            <div key={form.id}
                className={`form-card animate-in${isPublished ? ' form-card-published' : ''}${isSelected ? ' form-card-selected' : ''}`}>

                <div className="form-card-header">
                    <div className="form-card-icon">{isPublished ? '🌐' : '📋'}</div>
                    <div className="form-card-menu">
                        <Link href={`/builder/${form.id}`} className="btn btn-secondary btn-sm" title="Edit">✎</Link>
                        <Link href={`/preview/${form.id}`} className="btn btn-secondary btn-sm" title="Preview">👁</Link>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(form)}>✕</button>
                    </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                    <span className={`status-badge status-badge-${isPublished ? 'published' : 'draft'}`}>
                        {isPublished ? '🌐 Published' : '📝 Draft'}
                    </span>
                </div>

                <div className="form-card-name">{form.name}</div>
                <div className="form-card-desc">{form.description || 'No description'}</div>

                <div className="form-card-footer">
                    <div className="form-card-meta">
                        <span>🔲 {form.fields?.length || 0} fields</span>
                        <span>📅 {formatDate(form.createdAt)}</span>
                    </div>
                    <div className="form-card-actions">
                        {isPublished ? (
                            <>
                                <Link href={`/submissions/${form.id}`} className="btn btn-primary btn-sm">📊 Submissions</Link>
                                <Link href={`/submit/${form.id}`} className="btn btn-secondary btn-sm">↗ Share</Link>
                            </>
                        ) : (
                            <button className="btn btn-publish btn-sm"
                                onClick={() => handlePublish(form.id, form.name)} disabled={busy}>
                                {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '🚀 Publish'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Select checkbox — absolute bottom-right corner ── */}
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
                            <button className="sb-btn sb-btn-danger"
                                onClick={() => setBulkTarget(section)}>
                                🗑 Delete {selectedSet.size}
                            </button>
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
                <div className="container">

                    {/* Page header */}
                    <div className="page-header">
                        <div>
                            <h1 className="page-title">My Forms</h1>
                            <p className="page-subtitle">Build, manage &amp; share dynamic forms</p>
                        </div>
                        <Link href="/builder/new" className="btn btn-primary" id="new-form-btn">+ New Form</Link>
                    </div>

                    {/* Stats */}
                    <div className="dashboard-stats">
                        <div className="stat-card">
                            <div className="stat-value">{forms.length}</div>
                            <div className="stat-label">Total Forms</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{allPublished.length}</div>
                            <div className="stat-label">Published</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{allDraft.length}</div>
                            <div className="stat-label">Drafts</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{forms.reduce((a, f) => a + (f.fields?.length || 0), 0)}</div>
                            <div className="stat-label">Total Fields</div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : forms.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📋</div>
                            <h3>No forms yet</h3>
                            <p>Create your first form to get started</p>
                            <br />
                            <Link href="/builder/new" className="btn btn-primary">+ Create Form</Link>
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
                                            {publishedForms.map((f) => renderCard(f, publishedSelected, setPublishedSelected))}
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
                                            {draftForms.map((f) => renderCard(f, draftSelected, setDraftSelected))}
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
                            Delete <strong>&quot;{deleteTarget.name}&quot;</strong>?<br />
                            This permanently drops its table and all submissions.
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
                            Permanently delete <strong>{bulkTarget === 'published' ? publishedSelected.size : draftSelected.size} {bulkTarget}</strong> form{(bulkTarget === 'published' ? publishedSelected.size : draftSelected.size) !== 1 ? 's' : ''}?<br />
                            All database tables and submissions will be dropped. This cannot be undone.
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
