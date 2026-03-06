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

    useEffect(() => {
        getMe()
            .catch(() => router.replace('/login'))
            .then(() => getForms())
            .then((data) => setForms(Array.isArray(data) ? data : []))
            .catch(() => toastError('Failed to load forms.'))
            .finally(() => setLoading(false));
    }, [router]);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteForm(deleteTarget.id);
            setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
            toastSuccess(`"${deleteTarget.name}" deleted successfully.`);
        } catch {
            toastError('Failed to delete form.');
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    const handlePublish = async (formId, formName) => {
        setStatusLoading((p) => ({ ...p, [formId]: true }));
        try {
            await publishForm(formId);
            // Directly update status in state without waiting for API response shape
            setForms((prev) =>
                prev.map((f) => f.id === formId ? { ...f, status: 'PUBLISHED' } : f)
            );
            toastSuccess(`"${formName}" is now PUBLISHED! 🚀`);
        } catch {
            toastError('Failed to publish form.');
        } finally {
            setStatusLoading((p) => ({ ...p, [formId]: false }));
        }
    };

    const formatDate = (dt) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const draftForms     = forms.filter((f) => !f.status || f.status === 'DRAFT');
    const publishedForms = forms.filter((f) => f.status === 'PUBLISHED');

    // Render card inline (not as a sub-component) to avoid React remount issues
    const renderCard = (form) => {
        const isPublished = form.status === 'PUBLISHED';
        const busy = !!statusLoading[form.id];
        return (
            <div key={form.id} className={`form-card animate-in${isPublished ? ' form-card-published' : ''}`}>
                <div className="form-card-header">
                    <div className="form-card-icon">{isPublished ? '🌐' : '📋'}</div>
                    <div className="form-card-menu">
                        <Link href={`/builder/${form.id}`} className="btn btn-secondary btn-sm" title="Edit form">✎</Link>
                        <Link href={`/preview/${form.id}`} className="btn btn-secondary btn-sm" title="Preview form">👁</Link>
                        <button className="btn btn-danger btn-sm" title="Delete form" onClick={() => setDeleteTarget(form)}>✕</button>
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
                                <Link href={`/submissions/${form.id}`} className="btn btn-primary btn-sm" title="View submissions">
                                    📊 Submissions
                                </Link>
                                <Link href={`/submit/${form.id}`} className="btn btn-secondary btn-sm" title="Share link">
                                    ↗ Share
                                </Link>
                            </>
                        ) : (
                            <button
                                className="btn btn-publish btn-sm"
                                title="Publish this form to accept submissions"
                                onClick={() => handlePublish(form.id, form.name)}
                                disabled={busy}
                            >
                                {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '🚀 Publish'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Head>
                <title>Dashboard — FormCraft</title>
                <meta name="description" content="Manage your dynamic forms" />
            </Head>

            <div className="page">
                <Navbar />

                <div className="container">
                    <div className="page-header">
                        <div>
                            <h1 className="page-title">My Forms</h1>
                            <p className="page-subtitle">Build, manage & share dynamic forms</p>
                        </div>
                        <Link href="/builder/new" className="btn btn-primary" id="new-form-btn">
                            + New Form
                        </Link>
                    </div>

                    {/* Stats */}
                    <div className="dashboard-stats">
                        <div className="stat-card">
                            <div className="stat-value">{forms.length}</div>
                            <div className="stat-label">Total Forms</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{publishedForms.length}</div>
                            <div className="stat-label">Published</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{draftForms.length}</div>
                            <div className="stat-label">Drafts</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{forms.reduce((acc, f) => acc + (f.fields?.length || 0), 0)}</div>
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
                            {/* ── Published Forms ─────────────────────────── */}
                            {publishedForms.length > 0 && (
                                <section className="dashboard-section">
                                    <div className="dashboard-section-header">
                                        <span className="dashboard-section-icon">🌐</span>
                                        <h2 className="dashboard-section-title">Published Forms</h2>
                                        <span className="dashboard-section-count">{publishedForms.length}</span>
                                    </div>
                                    <div className="dashboard-grid">
                                        {publishedForms.map((form) => renderCard(form))}
                                    </div>
                                </section>
                            )}

                            {/* ── Draft Forms ──────────────────────────────── */}
                            {draftForms.length > 0 && (
                                <section className="dashboard-section">
                                    <div className="dashboard-section-header">
                                        <span className="dashboard-section-icon">📝</span>
                                        <h2 className="dashboard-section-title">Draft Forms</h2>
                                        <span className="dashboard-section-count">{draftForms.length}</span>
                                    </div>
                                    <p className="dashboard-section-hint">
                                        Draft forms are not visible to the public. Publish a form to start accepting submissions.
                                    </p>
                                    <div className="dashboard-grid">
                                        {draftForms.map((form) => renderCard(form))}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {deleteTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">🗑</div>
                        <h3>Delete Form</h3>
                        <p>
                            Are you sure you want to delete <strong>&quot;{deleteTarget.name}&quot;</strong>?<br />
                            This will permanently drop its database table and all submissions.
                        </p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                onClick={handleDelete}
                                disabled={deleting}
                                id="confirm-delete-btn"
                            >
                                {deleting ? 'Deleting…' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
