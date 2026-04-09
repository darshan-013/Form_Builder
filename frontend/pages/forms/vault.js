import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import UserProfileChip from '../../components/UserProfileChip';
import { getForms, deleteForm, publishForm, isSchemaDriftError, saveSchemaDriftReport } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';
import { translateApiError } from '../../services/errorTranslator';

export default function FormVaultPage() {
    const router = useRouter();
    const { can, user, hasRole, loading: authLoading } = useAuth();

    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
    const [statusLoading, setStatusLoading] = useState({});

    const [activeTab, setActiveTab] = useState('all');
    const [tabSearch, setTabSearch] = useState('');
    const [tabSelected, setTabSelected] = useState(new Set());
    const [tabPage, setTabPage] = useState(1);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const pageSize = 9;

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace('/login');
            return;
        }

        getForms()
            .then((formsData) => setForms(Array.isArray(formsData) ? formsData : []))
            .catch(error => toastError(translateApiError(error)))
            .finally(() => setLoading(false));
    }, [authLoading, user, router]);

    useEffect(() => {
        setTabPage(1);
    }, [tabSearch, activeTab]);

    const visibleForms = forms.filter((f) => f.status !== 'ARCHIVED');
    const allPublished = visibleForms.filter((f) => f.status === 'PUBLISHED');
    const allDraft = visibleForms.filter((f) => f.status !== 'PUBLISHED');

    const getTabForms = () => {
        switch (activeTab) {
            case 'published':
                return allPublished;
            case 'draft':
                return allDraft;
            case 'all':
            default:
                return visibleForms;
        }
    };

    const match = (f, q) =>
        f.name?.toLowerCase().includes(q.toLowerCase()) ||
        (f.description || '').toLowerCase().includes(q.toLowerCase());

    const tabForms = getTabForms().filter((f) => match(f, tabSearch));

    const toggle = (setFn, id) =>
        setFn((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    const selectAll = () => setTabSelected(new Set(tabForms.map((f) => f.id)));
    const clearSelection = () => setTabSelected(new Set());

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteForm(deleteTarget.id);
            setForms((prev) => prev.map((f) => (f.id === deleteTarget.id ? { ...f, status: 'ARCHIVED' } : f)));
            setTabSelected((p) => {
                const n = new Set(p);
                n.delete(deleteTarget.id);
                return n;
            });
            toastSuccess(`"${deleteTarget.name}" archived successfully.`);
            setDeleteErrorMessage('');
        } catch (error) {
            const liveSubmissionBlock = error?.status === 409 && (
                error?.errorCode === 'CONFLICT' ||
                String(error?.message || '').toLowerCase().includes('live submissions')
            );

            if (liveSubmissionBlock) {
                setDeleteErrorMessage('This form has live submissions, so you cannot archive it.');
            } else {
                setDeleteErrorMessage('');
                toastError('Failed to archive form.');
            }
        } finally {
            setDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        setBulkDeleting(true);
        let archived = 0;
        for (const id of [...tabSelected]) {
            try {
                await deleteForm(id);
                archived++;
            } catch {
                // Continue with best effort
            }
        }
        setForms((prev) => prev.map((f) => (tabSelected.has(f.id) ? { ...f, status: 'ARCHIVED' } : f)));
        clearSelection();
        setBulkDeleting(false);
        toastSuccess(`${archived} form${archived !== 1 ? 's' : ''} archived.`);
    };

    const redirectToDriftPage = (error, formId, formName) => {
        saveSchemaDriftReport({
            source: 'vault',
            formId,
            formName: formName || null,
            action: 'publishForm',
            at: new Date().toISOString(),
            message: error?.message || 'Schema drift detected',
            errorCode: error?.errorCode,
            errors: Array.isArray(error?.errors) ? error.errors : [],
            details: error?.details || null,
        });
        toastError('Schema drift detected. Only this affected form is blocked from publish/submit.');
        router.push('/schema-drift');
    };

    const handlePublish = async (formId, formName) => {
        setStatusLoading((p) => ({ ...p, [formId]: true }));
        try {
            await publishForm(formId);
            setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, status: 'PUBLISHED' } : f)));
            toastSuccess(`"${formName}" is now PUBLISHED!`);
        } catch (error) {
            if (isSchemaDriftError(error)) {
                redirectToDriftPage(error, formId, formName);
                return;
            }
            toastError('Failed to publish form.');
        } finally {
            setStatusLoading((p) => ({ ...p, [formId]: false }));
        }
    };

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

    const renderCard = (form) => {
        const isPublished = form.status === 'PUBLISHED';
        const isPending = form.status === 'PENDING_APPROVAL';
        const isRejected = form.status === 'REJECTED';
        const isAssigned = form.status === 'ASSIGNED';
        const busy = !!statusLoading[form.id];
        const isSelected = tabSelected.has(form.id);
        const isOwner = form.isOwner;

        return (
            <div key={form.id} className={`form-card animate-in${isPublished ? ' form-card-published' : ''}${isSelected ? ' form-card-selected' : ''}`}>
                <div className="form-card-header">
                    <div className="form-card-icon">{isPublished ? '🌐' : '📋'}</div>
                    <div className="form-card-menu">
                        {form.canEdit && !hasRole('Viewer') && (
                            <Link href={`/builder/${form.id}`} className="btn btn-secondary btn-sm" title="Edit">✎</Link>
                        )}
                        <Link href={`/preview/${form.id}`} className="btn btn-secondary btn-sm" title="Preview">👁</Link>
                        {form.canDelete && (
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

                <div className="form-card-footer">
                    <div className="form-card-meta">
                        <span>🔲 {form.fields?.length || 0} fields</span>
                        <span>📅 {formatDate(form.createdAt)}</span>
                    </div>
                    <div className="form-card-actions">
                        {isPublished ? (
                            <>
                                {form.canViewSubmissions && (
                                    <Link href={`/submissions/${form.id}`} className="btn btn-primary btn-sm">📊 Submissions</Link>
                                )}
                                <Link href={`/submit/${form.id}`} className="btn btn-secondary btn-sm">↗ Share</Link>
                            </>
                        ) : (
                            <>
                                {form.canPublish && (
                                    <button className="btn btn-publish btn-sm" onClick={() => handlePublish(form.id, form.name)} disabled={busy || bulkDeleting}>
                                        {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '🚀 Publish'}
                                    </button>
                                )}
                                {form.canAssignBuilder && !isPending && (
                                    <Link href={`/workflows/create/${form.id}`} className="btn btn-secondary btn-sm">👤 Assign Builder</Link>
                                )}
                                {(form.canStartWorkflow ?? form.canRequestWorkflow) && !isPending && (
                                    <Link href={`/workflows/create/${form.id}`} className="btn btn-secondary btn-sm">🧭 Start Workflow</Link>
                                )}
                                {isPending && (
                                    <Link href="/workflows/status" className="btn btn-secondary btn-sm">📍 Track Status</Link>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {form.canDelete && (
                    <label className={`card-select-checkbox${isSelected ? ' card-select-checked' : ''}`} onClick={(e) => e.stopPropagation()} title={isSelected ? 'Deselect' : 'Select'}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggle(setTabSelected, form.id)} />
                        <span className="card-select-mark">{isSelected ? '✓' : ''}</span>
                    </label>
                )}
            </div>
        );
    };

    const allSel = tabForms.length > 0 && tabSelected.size === tabForms.length;

    return (
        <>
            <Head><title>Form Vault - FormCraft</title></Head>

            <div className="page">
                <Navbar />
                <UserProfileChip />
                <div className="container">
                    <div className="page-header">
                        <div>
                            <h1 className="page-title">Form Vault</h1>
                            <p className="page-subtitle">Manage all active forms (live and draft).</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <Link href="/dashboard" className="btn btn-secondary">← Dashboard</Link>
                            {(can('WRITE') || hasRole('Viewer')) && (
                                <Link href="/builder/new" className="btn btn-primary" id="new-form-btn">+ New Form</Link>
                            )}
                            <Link href="/forms/trash" className="btn btn-secondary" title="View archived forms">🗂 Archived</Link>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : visibleForms.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📋</div>
                            <h3>No forms yet</h3>
                            <p>Create your first form to get started</p>
                            <br />
                            <Link href="/builder/new" className="btn btn-primary">+ Create Form</Link>
                        </div>
                    ) : (
                        <>
                            <div className="dashboard-tabs">
                                <button className={`tab-btn ${activeTab === 'all' ? 'tab-active' : ''}`} onClick={() => { setActiveTab('all'); setTabSearch(''); setTabSelected(new Set()); }}>
                                    All <span className="tab-count">{visibleForms.length}</span>
                                </button>
                                <button className={`tab-btn ${activeTab === 'published' ? 'tab-active' : ''}`} onClick={() => { setActiveTab('published'); setTabSearch(''); setTabSelected(new Set()); }}>
                                    🌐 Live <span className="tab-count">{allPublished.length}</span>
                                </button>
                                <button className={`tab-btn ${activeTab === 'draft' ? 'tab-active' : ''}`} onClick={() => { setActiveTab('draft'); setTabSearch(''); setTabSelected(new Set()); }}>
                                    📝 Draft <span className="tab-count">{allDraft.length}</span>
                                </button>
                            </div>

                            <section className={`section-bar ${activeTab === 'published' ? 'section-bar-published' : 'section-bar-draft'}`}>
                                <div className="section-bar-top">
                                    <div className="section-bar-title">
                                        <h2 className="dashboard-section-title">{activeTab === 'published' ? 'Published Forms' : activeTab === 'draft' ? 'Draft Forms' : 'All Forms'}</h2>
                                        <span className="dashboard-section-count">{tabForms.length}</span>
                                    </div>
                                    {tabSelected.size > 0 && (
                                        <div className="section-sel-row">
                                            <span className="bulk-count">{tabSelected.size} selected</span>
                                            <button className="sb-btn sb-btn-ghost" onClick={clearSelection}>✕ Clear</button>
                                            {can('DELETE') && (
                                                <button className="sb-btn sb-btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>🗂 Archive {tabSelected.size}</button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="section-bar-bottom">
                                    <div className="section-search-wrapper">
                                        <span className="section-search-icon">🔍</span>
                                        <input className="section-search-input" type="text" placeholder="Search forms..." value={tabSearch} onChange={(e) => setTabSearch(e.target.value)} />
                                        {tabSearch && <button className="section-search-clear" onClick={() => setTabSearch('')}>✕</button>}
                                    </div>
                                    <button className={`sb-btn ${allSel ? 'sb-btn-active' : 'sb-btn-ghost'}`} onClick={allSel ? clearSelection : selectAll} disabled={tabForms.length === 0}>
                                        {allSel ? '☑ Deselect All' : '☐ Select All'}
                                    </button>
                                </div>
                            </section>

                            {tabForms.length === 0 ? (
                                <div className="section-empty">
                                    <span>🔍</span> No forms available
                                </div>
                            ) : (
                                <div className="dashboard-grid">
                                    {tabForms
                                        .slice((tabPage - 1) * pageSize, tabPage * pageSize)
                                        .map((f) => renderCard(f))}
                                </div>
                            )}

                            {tabForms.length > pageSize && (
                                <div className="datatable-pagination" style={{ marginTop: '24px' }}>
                                    <button className="btn btn-secondary btn-sm" disabled={tabPage === 1} onClick={() => setTabPage((p) => p - 1)}>‹ Prev</button>
                                    <div className="pagination-pages">
                                        {Array.from({ length: Math.ceil(tabForms.length / pageSize) }, (_, i) => i + 1).map((p) => (
                                            <button key={p} className={`btn btn-sm ${tabPage === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTabPage(p)}>{p}</button>
                                        ))}
                                    </div>
                                    <button className="btn btn-secondary btn-sm" disabled={tabPage === Math.ceil(tabForms.length / pageSize)} onClick={() => setTabPage((p) => p + 1)}>Next ›</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {deleteTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">{deleteErrorMessage ? '⛔' : '🗑'}</div>
                        <h3>{deleteErrorMessage ? 'Cannot Archive Form' : 'Archive Form'}</h3>
                        {deleteErrorMessage ? (
                            <p style={{ color: '#FCA5A5', textAlign: 'center', fontSize: 16, fontWeight: 600, margin: '16px 0' }}>
                                {deleteErrorMessage}
                            </p>
                        ) : (
                            <p>
                                Archive <strong>&quot;{deleteTarget.name}&quot;</strong>?<br />
                                Archived forms are hidden from active workflows and submissions.
                            </p>
                        )}
                         <div className="confirm-actions">
                            {deleteErrorMessage ? (
                                <button className="btn btn-secondary" onClick={() => { setDeleteTarget(null); setDeleteErrorMessage(''); }}>Go Back</button>
                            ) : (
                                <>
                                    <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
                                    <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                                        {deleting ? 'Archiving…' : 'Yes, Archive'}
                                    </button>
                                </>
                            )}
                         </div>
                    </div>
                </div>
            )}
        </>
    );
}

