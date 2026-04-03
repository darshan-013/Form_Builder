import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import UserProfileChip from '../../components/UserProfileChip';
import { motion } from 'framer-motion';
import { Trash2, RotateCcw, AlertTriangle, Search, Info } from 'lucide-react';
import { getDeletedForms, restoreForm, permanentlyDeleteForm } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';
import { useAuth } from '../../context/AuthContext';

export default function FormsTrashPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 9;

    const [restoreTarget, setRestoreTarget] = useState(null);
    const [purgeTarget, setPurgeTarget] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace('/login');
            return;
        }

        fetchTrash();
    }, [authLoading, user, router]);

    const fetchTrash = async () => {
        setLoading(true);
        try {
            const data = await getDeletedForms();
            setForms(Array.isArray(data) ? data : []);
        } catch (err) {
            toastError('Failed to load trash bin.');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreTarget) return;
        setActionLoading(true);
        try {
            await restoreForm(restoreTarget.id);
            toastSuccess(`"${restoreTarget.name}" restored successfully.`);
            setForms(prev => prev.filter(f => f.id !== restoreTarget.id));
        } catch (err) {
            toastError('Failed to restore form.');
        } finally {
            setActionLoading(false);
            setRestoreTarget(null);
        }
    };

    const handlePurge = async () => {
        if (!purgeTarget) return;
        setActionLoading(true);
        try {
            await permanentlyDeleteForm(purgeTarget.id);
            toastSuccess(`"${purgeTarget.name}" permanently deleted.`);
            setForms(prev => prev.filter(f => f.id !== purgeTarget.id));
        } catch (err) {
            toastError('Failed to permanently delete form.');
        } finally {
            setActionLoading(false);
            setPurgeTarget(null);
        }
    };

    const filteredForms = forms.filter(f =>
        f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.formCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <>
            <Head><title>Trash Bin — FormCraft</title></Head>

            <div className="page">
                <Navbar />
                <UserProfileChip />
                
                <div className="container">
                    <div className="page-header">
                        <div>
                            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Trash2 className="text-danger" size={32} />
                                Trash Bin
                            </h1>
                            <p className="page-subtitle">
                                Manage deleted forms. Restored forms will reappear in your active dashboard.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <Link href="/dashboard" className="btn btn-secondary">
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>

                    <div className="section-bar section-bar-draft" style={{ marginBottom: 24 }}>
                        <div className="section-bar-top">
                            <div className="section-bar-title">
                                <span className="section-bar-icon">🗑</span>
                                <h2 className="dashboard-section-title">Deleted Forms</h2>
                                <span className="dashboard-section-count">{filteredForms.length}</span>
                            </div>
                        </div>
                        <div className="section-bar-bottom">
                            <div className="section-search-wrapper">
                                <Search size={18} className="section-search-icon" style={{ opacity: 0.5 }} />
                                <input
                                    className="section-search-input"
                                    type="text"
                                    placeholder="Search by name or code..."
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                />
                                {searchTerm && (
                                    <button className="section-search-clear" onClick={() => setSearchTerm('')}>✕</button>
                                )}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : filteredForms.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🗑️</div>
                            <h3>Trash bin is empty</h3>
                            <p>No deleted forms found.</p>
                        </div>
                    ) : (
                        <>
                            <div className="dashboard-grid">
                                {filteredForms.slice((page - 1) * pageSize, page * pageSize).map(form => (
                                    <motion.div 
                                        key={form.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="form-card"
                                    >
                                        <div className="form-card-header">
                                            <div className="form-card-icon">📁</div>
                                            <div className="form-card-menu">
                                                <button 
                                                    className="btn btn-secondary btn-sm" 
                                                    title="Restore"
                                                    onClick={() => setRestoreTarget(form)}
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                                <button 
                                                    className="btn btn-danger btn-sm" 
                                                    title="Permanent Delete"
                                                    onClick={() => setPurgeTarget(form)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>

                                        <div className="form-card-name" style={{ color: 'var(--text-primary)' }}>{form.name}</div>
                                        <div className="form-card-desc">{form.description || 'No description'}</div>

                                        <div style={{ 
                                            marginTop: 'auto',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            background: 'rgba(239, 68, 68, 0.05)',
                                            border: '1px solid rgba(239, 68, 68, 0.1)',
                                            fontSize: '11px',
                                            color: 'var(--text-muted)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span>Deleted At:</span>
                                                <span style={{ color: '#F87171' }}>{formatDate(form.deletedAt)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Created By:</span>
                                                <span>{form.createdBy}</span>
                                            </div>
                                        </div>

                                        <div className="form-card-footer" style={{ marginTop: 12 }}>
                                            <div className="form-card-meta">
                                                <span>Code: {form.formCode}</span>
                                            </div>
                                            <div className="form-card-actions">
                                                <button 
                                                    className="btn btn-publish btn-sm" 
                                                    style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                                    onClick={() => setRestoreTarget(form)}
                                                >
                                                    <RotateCcw size={14} style={{ marginRight: 6 }} />
                                                    Restore
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {filteredForms.length > pageSize && (
                                <div className="datatable-pagination" style={{ marginTop: 24 }}>
                                    <button className="btn btn-secondary btn-sm"
                                        disabled={page === 1}
                                        onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                                    <div className="pagination-pages">
                                        {Array.from({ length: Math.ceil(filteredForms.length / pageSize) }, (_, i) => i + 1).map(p => (
                                            <button key={p}
                                                className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => setPage(p)}>{p}</button>
                                        ))}
                                    </div>
                                    <button className="btn btn-secondary btn-sm"
                                        disabled={page === Math.ceil(filteredForms.length / pageSize)}
                                        onClick={() => setPage(p => p + 1)}>Next ›</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Restore Dialog */}
            {restoreTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                            <RotateCcw size={28} />
                        </div>
                        <h3>Restore Form?</h3>
                        <p>Restoring <strong>"{restoreTarget.name}"</strong> will make it active and available on the dashboard again.</p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setRestoreTarget(null)} disabled={actionLoading}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleRestore} disabled={actionLoading} style={{ background: '#10B981', borderColor: '#10B981' }}>
                                {actionLoading ? 'Restoring...' : 'Yes, Restore'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Purge Dialog */}
            {purgeTarget && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">
                            <AlertTriangle size={28} color="#EF4444" />
                        </div>
                        <h3 className="text-danger">Permanent Delete?</h3>
                        <p>Warning: This will <strong>PERMANENTLY</strong> delete <strong>"{purgeTarget.name}"</strong> and all its submissions. This action cannot be undone.</p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setPurgeTarget(null)} disabled={actionLoading}>Cancel</button>
                            <button className="btn btn-danger" onClick={handlePurge} disabled={actionLoading}>
                                {actionLoading ? 'Deleting...' : 'Permanently Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
