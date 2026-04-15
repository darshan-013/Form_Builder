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
    const [selectedForms, setSelectedForms] = useState(new Set());
    const [bulkRestoreModal, setBulkRestoreModal] = useState(false);
    const [bulkPurgeModal, setBulkPurgeModal] = useState(false);
    const [bulkActioning, setBulkActioning] = useState(false);

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

    const handleBulkRestore = async () => {
        setBulkActioning(true);
        let restored = 0;
        for (const id of [...selectedForms]) {
            try {
                await restoreForm(id);
                restored++;
            } catch {
                // Continue with best effort
            }
        }
        setForms(prev => prev.filter(f => !selectedForms.has(f.id)));
        clearSelection();
        setBulkActioning(false);
        setBulkRestoreModal(false);
        toastSuccess(`${restored} form${restored !== 1 ? 's' : ''} restored.`);
    };

    const handleBulkPurge = async () => {
        setBulkActioning(true);
        let deleted = 0;
        for (const id of [...selectedForms]) {
            try {
                await permanentlyDeleteForm(id);
                deleted++;
            } catch {
                // Continue with best effort
            }
        }
        setForms(prev => prev.filter(f => !selectedForms.has(f.id)));
        clearSelection();
        setBulkActioning(false);
        setBulkPurgeModal(false);
        toastSuccess(`${deleted} form${deleted !== 1 ? 's' : ''} permanently deleted.`);
    };

    const toggleSelect = (id) => {
        setSelectedForms(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedForms(new Set(filteredForms.map(f => f.id)));
    const clearSelection = () => setSelectedForms(new Set());

    const filteredForms = forms.filter(f =>
        f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <>
            <Head><title>Archived Forms — FormCraft</title></Head>

            <div className="page">
                <Navbar />
                <UserProfileChip />
                
                <div className="container">
                    <div className="page-header">
                        <div>
                            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Trash2 className="text-danger" size={32} />
                                Archived Forms
                            </h1>
                            <p className="page-subtitle">
                                Manage archived forms. Restored forms will return to DRAFT.
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
                                <h2 className="dashboard-section-title">Archived Forms</h2>
                                <span className="dashboard-section-count">{filteredForms.length}</span>
                            </div>
                            {selectedForms.size > 0 && (
                                <div className="section-sel-row">
                                    <span className="bulk-count">{selectedForms.size} selected</span>
                                    <button className="sb-btn sb-btn-ghost" onClick={clearSelection}>✕ Clear</button>
                                    <button className="sb-btn sb-btn-success" onClick={() => setBulkRestoreModal(true)} disabled={bulkActioning}>↶ Restore {selectedForms.size}</button>
                                    <button className="sb-btn sb-btn-danger" onClick={() => setBulkPurgeModal(true)} disabled={bulkActioning}>🗑 Delete {selectedForms.size}</button>
                                </div>
                            )}
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
                            <h3>No archived forms</h3>
                            <p>Archived forms will appear here.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                    className={`sb-btn ${selectedForms.size === filteredForms.length ? 'sb-btn-active' : 'sb-btn-ghost'}`}
                                    onClick={selectedForms.size === filteredForms.length ? clearSelection : selectAll}
                                    disabled={filteredForms.length === 0}
                                >
                                    {selectedForms.size === filteredForms.length ? '☑ Deselect All' : '☐ Select All'}
                                </button>
                            </div>
                            <div className="dashboard-grid">
                                {filteredForms.slice((page - 1) * pageSize, page * pageSize).map(form => {
                                    const isSelected = selectedForms.has(form.id);
                                    return (
                                        <motion.div
                                            key={form.id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="form-card"
                                            onClick={() => toggleSelect(form.id)}
                                            style={{ cursor: 'pointer', opacity: isSelected ? 0.8 : 1, border: isSelected ? '2px solid #8B5CF6' : undefined }}
                                        >
                                            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(form.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ cursor: 'pointer', width: 18, height: 18 }}
                                                />
                                            </div>

                                            <div className="form-card-header">
                                                <div className="form-card-icon">📁</div>
                                                <div className="form-card-menu">
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        title="Restore"
                                                        onClick={(e) => { e.stopPropagation(); setRestoreTarget(form); }}
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        title="Permanent Delete"
                                                        onClick={(e) => { e.stopPropagation(); setPurgeTarget(form); }}
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
                                                    <span>Archived At:</span>
                                                    <span style={{ color: '#F87171' }}>{formatDate(form.archivedAt)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Created By:</span>
                                                    <span>{form.createdBy}</span>
                                                </div>
                                            </div>

                                            <div className="form-card-footer" style={{ marginTop: 12 }}>
                                                <div className="form-card-meta">
                                                    <span>Code: {form.code}</span>
                                                </div>
                                                <div className="form-card-actions">
                                                    <button
                                                        className="btn btn-publish btn-sm"
                                                        style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                                        onClick={(e) => { e.stopPropagation(); setRestoreTarget(form); }}
                                                    >
                                                        <RotateCcw size={14} style={{ marginRight: 6 }} />
                                                        Restore
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
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

            {/* Bulk Restore Dialog */}
            {bulkRestoreModal && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                            <RotateCcw size={28} />
                        </div>
                        <h3>Restore {selectedForms.size} Form{selectedForms.size !== 1 ? 's' : ''}?</h3>
                        <p>Restoring <strong>{selectedForms.size} form{selectedForms.size !== 1 ? 's' : ''}</strong> will make them active and available on the dashboard again.</p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setBulkRestoreModal(false)} disabled={bulkActioning}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleBulkRestore} disabled={bulkActioning} style={{ background: '#10B981', borderColor: '#10B981' }}>
                                {bulkActioning ? 'Restoring...' : `Yes, Restore ${selectedForms.size}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Purge Dialog */}
            {bulkPurgeModal && (
                <div className="confirm-dialog">
                    <div className="confirm-box">
                        <div className="confirm-icon">
                            <AlertTriangle size={28} color="#EF4444" />
                        </div>
                        <h3 className="text-danger">Permanent Delete {selectedForms.size} Form{selectedForms.size !== 1 ? 's' : ''}?</h3>
                        <p>Warning: This will <strong>PERMANENTLY</strong> delete <strong>{selectedForms.size} form{selectedForms.size !== 1 ? 's' : ''}</strong> and all their submissions. This action cannot be undone.</p>
                        <div className="confirm-actions">
                            <button className="btn btn-secondary" onClick={() => setBulkPurgeModal(false)} disabled={bulkActioning}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleBulkPurge} disabled={bulkActioning}>
                                {bulkActioning ? 'Deleting...' : `Permanently Delete ${selectedForms.size}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
