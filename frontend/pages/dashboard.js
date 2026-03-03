import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { getForms, deleteForm, getMe } from '../services/api';
import { toastSuccess, toastError } from '../services/toast';

export default function DashboardPage() {
    const router = useRouter();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null); // form to confirm-delete
    const [deleting, setDeleting] = useState(false);

    // Auth guard + load forms
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

    const formatDate = (dt) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
                    {/* Stats */}
                    <div className="page-header">
                        <div>
                            <h1 className="page-title">My Forms</h1>
                            <p className="page-subtitle">Build, manage & share dynamic forms</p>
                        </div>
                        <Link href="/builder/new" className="btn btn-primary" id="new-form-btn">
                            + New Form
                        </Link>
                    </div>

                    <div className="dashboard-stats">
                        <div className="stat-card">
                            <div className="stat-value">{forms.length}</div>
                            <div className="stat-label">Total Forms</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{forms.reduce((acc, f) => acc + (f.fields?.length || 0), 0)}</div>
                            <div className="stat-label">Total Fields</div>
                        </div>
                    </div>

                    {/* Form Grid */}
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
                        <div className="dashboard-grid">
                            {forms.map((form) => (
                                <div key={form.id} className="form-card animate-in">
                                    <div className="form-card-header">
                                        <div className="form-card-icon">📋</div>
                                        <div className="form-card-menu">
                                            <Link href={`/builder/${form.id}`} className="btn btn-secondary btn-sm" title="Edit form">✎</Link>
                                            <Link href={`/preview/${form.id}`} className="btn btn-secondary btn-sm" title="Preview form">👁</Link>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                title="Delete form"
                                                onClick={() => setDeleteTarget(form)}
                                            >✕</button>
                                        </div>
                                    </div>

                                    <div className="form-card-name">{form.name}</div>
                                    <div className="form-card-desc">{form.description || 'No description'}</div>

                                    <div className="form-card-footer">
                                        <div className="form-card-meta">
                                            <span>🔲 {form.fields?.length || 0} fields</span>
                                            <span>📅 {formatDate(form.createdAt)}</span>
                                        </div>
                                        <div className="form-card-actions">
                                            <Link
                                              href={`/submissions/${form.id}`}
                                                className="btn btn-primary btn-sm"
                                                title="View submissions">
                                                📊 Submissions
                                            </Link>
                                            <Link
                                                href={`/submit/${form.id}`}
                                                className="btn btn-secondary btn-sm"
                                                title="Share this form link"
                                            >
                                                ↗ Share
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
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
