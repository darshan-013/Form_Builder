import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import UserProfileChip from '../../../components/UserProfileChip';
import { motion } from 'framer-motion';
import { Trash2, RotateCcw, AlertTriangle, Search } from 'lucide-react';
import { getDeletedSubmissions, restoreSubmission, getDeletedForms } from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';
import { useAuth } from '../../../context/AuthContext';

const BASE = '/api/v1';

export default function SubmissionsTrashPage() {
    const router = useRouter();
    const { id } = router.query;
    const { user, loading: authLoading } = useAuth();
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const [restoreTarget, setRestoreTarget] = useState(null);
    const [purgeAll, setPurgeAll] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [formName, setFormName] = useState('');

    useEffect(() => {
        if (authLoading || !id) return;
        if (!user) { router.replace('/login'); return; }
        fetchTrash();
    }, [authLoading, user, id, router]);

    const fetchTrash = async () => {
        setLoading(true);
        try {
            const data = await getDeletedSubmissions(id);
            setSubmissions(Array.isArray(data) ? data : []);
        } catch {
            toastError('Failed to load deleted submissions.');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreTarget) return;
        setActionLoading(true);
        try {
            await restoreSubmission(id, restoreTarget.id);
            toastSuccess('Submission restored successfully.');
            setSubmissions(prev => prev.filter(s => s.id !== restoreTarget.id));
        } catch {
            toastError('Failed to restore submission.');
        } finally {
            setActionLoading(false);
            setRestoreTarget(null);
        }
    };

    const handlePurgeAll = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${BASE}/runtime/${id}/submissions/trash`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error();
            toastSuccess('All deleted submissions permanently purged.');
            setSubmissions([]);
        } catch {
            toastError('Failed to purge submissions.');
        } finally {
            setActionLoading(false);
            setPurgeAll(false);
        }
    };

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const filtered = submissions.filter(s => {
        const vals = Object.values(s).join(' ').toLowerCase();
        return vals.includes(searchTerm.toLowerCase());
    });

    const columns = submissions.length > 0
        ? Object.keys(submissions[0]).filter(k => !['is_soft_deleted', 'form_version_id', 'submitted_by'].includes(k)).slice(0, 6)
        : [];

    return (
        <>
            <Head><title>Submission Trash — FormCraft</title></Head>
            <div className="page">
                <Navbar />
                <UserProfileChip />
                <div className="container">
                    <div className="page-header">
                        <div>
                            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Trash2 size={28} />
                                Deleted Submissions
                            </h1>
                            <p className="page-subtitle">Restore or permanently purge deleted submissions for this form.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {submissions.length > 0 && (
                                <button className="btn btn-danger" onClick={() => setPurgeAll(true)}>
                                    🗑 Purge All ({submissions.length})
                                </button>
                            )}
                            <Link href={`/submissions/${id}`} className="btn btn-secondary">
                                ← Active Submissions
                            </Link>
                        </div>
                    </div>

                    <div className="section-bar section-bar-draft" style={{ marginBottom: 24 }}>
                        <div className="section-bar-bottom">
                            <div className="section-search-wrapper">
                                <Search size={16} style={{ opacity: 0.5, marginLeft: 10 }} />
                                <input
                                    className="section-search-input"
                                    type="text"
                                    placeholder="Search deleted submissions..."
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                                />
                                {searchTerm && <button className="section-search-clear" onClick={() => setSearchTerm('')}>✕</button>}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🗑️</div>
                            <h3>No deleted submissions</h3>
                            <p>All previously deleted submissions will appear here.</p>
                        </div>
                    ) : (
                        <>
                            <div className="datatable-wrapper">
                                <table className="datatable">
                                    <thead>
                                        <tr>
                                            {columns.map(c => <th key={c}>{c.replace(/_/g, ' ')}</th>)}
                                            <th>Deleted At</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.slice((page - 1) * pageSize, page * pageSize).map((s, i) => (
                                            <motion.tr key={s.id || i}
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                style={{ opacity: 0.8 }}>
                                                {columns.map(c => (
                                                    <td key={c}>{String(s[c] ?? '—').slice(0, 60)}</td>
                                                ))}
                                                <td style={{ color: '#F87171', whiteSpace: 'nowrap' }}>{formatDate(s.deleted_at)}</td>
                                                <td>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setRestoreTarget(s)}
                                                        title="Restore"
                                                    >
                                                        <RotateCcw size={14} />
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {filtered.length > pageSize && (
                                <div className="datatable-pagination" style={{ marginTop: 16 }}>
                                    <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                                    <span style={{ padding: '0 12px', fontSize: 13 }}>Page {page} of {Math.ceil(filtered.length / pageSize)}</span>
                                    <button className="btn btn-secondary btn-sm" disabled={page === Math.ceil(filtered.length / pageSize)} onClick={() => setPage(p => p + 1)}>Next ›</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {restoreTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
                            <RotateCcw size={28} />
                        </div>
                        <h3>Restore Submission?</h3>
                        <p>This submission will be moved back to the active submissions list.</p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setRestoreTarget(null)} disabled={actionLoading}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleRestore} disabled={actionLoading}
                                style={{ background: '#10B981', borderColor: '#10B981' }}>
                                {actionLoading ? 'Restoring...' : 'Yes, Restore'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {purgeAll && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon"><AlertTriangle size={28} color="#EF4444" /></div>
                        <h3 className="text-danger">Purge All Deleted?</h3>
                        <p>This will <strong>permanently delete</strong> all {submissions.length} trashed submissions. This cannot be undone.</p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setPurgeAll(false)} disabled={actionLoading}>Cancel</button>
                            <button className="btn btn-danger" onClick={handlePurgeAll} disabled={actionLoading}>
                                {actionLoading ? 'Purging...' : 'Purge All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
