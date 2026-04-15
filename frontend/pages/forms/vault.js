import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import UserProfileChip from '../../components/UserProfileChip';
import { 
    FileText, Calendar, Edit3, BarChart3, Copy, 
    ExternalLink, Eye, Trash2, 
    CheckCircle2, UserPlus
} from 'lucide-react';
import { getForms, deleteForm, publishForm, isSchemaDriftError, saveSchemaDriftReport } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';
import { translateApiError } from '../../services/errorTranslator';

export default function FormVaultPage() {
    const router = useRouter();
    const { can, user, hasRole, loading: authLoading } = useAuth();
    const isAdmin = hasRole('Admin') || user?.role === 'Admin';
    const isViewer = hasRole('Viewer') || user?.role === 'Viewer';
    const isBuilder = hasRole('Builder') || user?.role === 'Builder';

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
    const [bulkConfirmModal, setBulkConfirmModal] = useState(false);
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
            setDeleteTarget(null);
            setDeleteErrorMessage('');
            toastSuccess(`"${deleteTarget.name}" archived successfully.`);
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
        setBulkConfirmModal(false);
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

    const handleCopyLink = (formId) => {
        const url = `${window.location.origin}/submit/${formId}`;
        navigator.clipboard.writeText(url)
            .then(() => toastSuccess('Submission link copied to clipboard!'))
            .catch(() => toastError('Failed to copy link.'));
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
            <div key={form.id} className={`form-card-v2 animate-in ${isPublished ? 'card-published' : 'card-draft'}${isSelected ? ' card-selected' : ''}`}>
                <div className="card-top-indicator"></div>
                
                <div className="card-header-v2">
                    <div className="card-thumb">
                        <FileText size={20} color="#3B82F6" strokeWidth={2.5} />
                    </div>
                    <div className={`status-pill-v2 ${isPublished ? 'pill-published' : 'pill-draft'}`} style={
                         isPending ? { background: 'rgba(245,158,11,0.08)', color: '#F59E0B', borderColor: 'rgba(245,158,11,0.2)' } :
                         isRejected ? { background: 'rgba(239,68,68,0.08)', color: '#EF4444', borderColor: 'rgba(239,68,68,0.2)' } :
                         undefined
                    }>
                        <span className="pill-dot"></span>
                        {isPublished ? 'PUBLISHED' : isPending ? 'PENDING' : isRejected ? 'REJECTED' : 'DRAFT'}
                    </div>
                </div>

                <div className="card-body-v2">
                    <h3 className="card-title-v2">{form.name}</h3>
                    <div className="card-date-v2">
                        <Calendar size={13} />
                        {formatDate(form.createdAt)}
                    </div>
                </div>

                <div className="card-primary-actions">
                    {/* EDIT button - Admins and Builders only (not Viewers) */}
                    {(isAdmin || (!isViewer && form.status === 'DRAFT')) && (
                        <button
                            className="btn-edit-main"
                            onClick={() => router.push(`/builder/${form.id}`)}
                        >
                            <Edit3 size={16} />
                            EDIT
                        </button>
                    )}

                    {/* Published form - show DATA button */}
                    {isPublished ? (
                        <button 
                            className="btn-data-main"
                            onClick={() => router.push(`/submissions/${form.id}`)}
                        >
                            <BarChart3 size={16} />
                            DATA
                        </button>
                    ) :
                    /* Assigned to current builder - show INITIATE button */
                    (form.status === 'ASSIGNED' && user?.username === form.assignedBuilderUsername) ? (
                        <button
                            className="btn-data-main initiate-btn-vault"
                            onClick={() => router.push(`/workflows/create/${form.id}`)}
                            style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#86EFAC', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                        >
                            <CheckCircle2 size={16} />
                            INITIATE
                        </button>
                    ) :
                    /* Admin or Viewer in DRAFT/REJECTED - show ASSIGN button */
                    (isAdmin || isViewer) && (form.status === 'DRAFT' || isRejected) ? (
                        <button
                            className="btn-data-main assign-btn-vault"
                            onClick={() => router.push(`/workflows/create/${form.id}`)}
                            style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#C4B5FD', border: '1px solid rgba(139, 92, 246, 0.3)' }}
                        >
                            <UserPlus size={16} />
                            ASSIGN
                        </button>
                    ) :
                    /* Form in progress - show PROGRESS button */
                    form.workflow ? (
                        <button
                            className="btn-data-main progress-btn-vault"
                            onClick={() => router.push(`/workflows/status?workflowId=${form.workflow.id}`)}
                            style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                        >
                            <BarChart3 size={16} />
                            PROGRESS
                        </button>
                    ) : (
                        <button 
                            className="btn-data-main publish-btn"
                            disabled={busy || form.status === 'ASSIGNED' || isViewer}
                            onClick={() => handlePublish(form.id, form.name)}
                        >
                            {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <><BarChart3 size={16} /> PUBLISH</>}
                        </button>
                    )}
                </div>

                <div className="card-toolbar-v2">
                    <div className="toolbar-left">
                        {isPublished && !isViewer && (
                            <>
                                <button className="t-icon-btn" title="Copy Submission Link" onClick={() => handleCopyLink(form.id)}>
                                    <Copy size={18} />
                                </button>
                                <button className="t-icon-btn" title="Open Share Page" onClick={() => window.open(`/submit/${form.id}`, '_blank')}>
                                    <ExternalLink size={18} />
                                </button>
                            </>
                        )}
                        <button className="t-icon-btn" title="Preview Form" onClick={() => router.push(`/preview/${form.id}`)}>
                            <Eye size={18} />
                        </button>
                    </div>
                    <div className="toolbar-right">
                        {form.canDelete && (
                            <button
                                className="t-icon-btn t-delete-btn" 
                                title="Delete Form"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(form); }}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>

                <div className={`card-selection-v2 ${isSelected ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); toggle(setTabSelected, form.id); }}>
                    <div className="selection-dot">
                        {isSelected && <CheckCircle2 size={14} />}
                    </div>
                </div>
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
                                            {(can('DELETE') || isViewer) && (
                                                <button className="sb-btn sb-btn-danger" onClick={() => setBulkConfirmModal(true)} disabled={bulkDeleting}>🗂 Archive {tabSelected.size}</button>
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

            {bulkConfirmModal && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">🗑</div>
                        <h3>Archive {tabSelected.size} Form{tabSelected.size !== 1 ? 's' : ''}?</h3>
                        <p>
                            You are about to archive <strong>{tabSelected.size} form{tabSelected.size !== 1 ? 's' : ''}</strong>.<br />
                            Archived forms are hidden from active workflows and submissions.
                        </p>
                         <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setBulkConfirmModal(false)} disabled={bulkDeleting}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                                {bulkDeleting ? 'Archiving…' : `Yes, Archive ${tabSelected.size}`}
                            </button>
                         </div>
                    </div>
                </div>
            )}
        </>
    );
}

