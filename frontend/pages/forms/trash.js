import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getTrashForms, restoreForm, permanentDeleteForm, getMe } from '../../services/api';
import { toastSuccess, toastError } from '../../services/toast';

export default function FormsTrashPage() {
    const router = useRouter();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmModal, setConfirmModal] = useState(null); // { type: 'restore'|'permanent'|'bulk-restore'|'bulk-permanent', form? }
    const [processing, setProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());

    useEffect(() => {
        getMe()
            .catch(() => router.replace('/login'))
            .then(() => getTrashForms())
            .then((data) => setForms(Array.isArray(data) ? data : []))
            .catch(() => toastError('Failed to load trash.'))
            .finally(() => setLoading(false));
    }, [router]);

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const filteredForms = forms.filter(f =>
        f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleSelection = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const selectAll = () => setSelectedIds(new Set(filteredForms.map(f => f.id)));
    const clearSelection = () => setSelectedIds(new Set());

    const handleRestore = async (formId) => {
        const targetId = typeof formId === 'string' ? formId : confirmModal?.form?.id;
        if (!targetId) return;
        setProcessing(true);
        try {
            await restoreForm(targetId);
            setForms((prev) => prev.filter((f) => f.id !== targetId));
            setSelectedIds(p => { const n = new Set(p); n.delete(targetId); return n; });
            if (typeof formId === 'string') toastSuccess(`Form restored successfully! 🎉`);
            else toastSuccess(`"${confirmModal.form.name}" restored successfully! 🎉`);
        } catch { toastError('Failed to restore form.'); }
        finally { setProcessing(false); setConfirmModal(null); }
    };

    const handlePermanentDelete = async (formId) => {
        const targetId = typeof formId === 'string' ? formId : confirmModal?.form?.id;
        if (!targetId) return;
        setProcessing(true);
        try {
            await permanentDeleteForm(targetId);
            setForms((prev) => prev.filter((f) => f.id !== targetId));
            setSelectedIds(p => { const n = new Set(p); n.delete(targetId); return n; });
            if (typeof formId === 'string') toastSuccess(`Form permanently deleted.`);
            else toastSuccess(`"${confirmModal.form.name}" permanently deleted.`);
        } catch { toastError('Failed to delete form.'); }
        finally { setProcessing(false); setConfirmModal(null); }
    };

    const handleBulkAction = async () => {
        const type = confirmModal.type;
        setProcessing(true);
        let success = 0;
        const ids = [...selectedIds];
        for (const id of ids) {
            try {
                if (type === 'bulk-restore') await restoreForm(id);
                else await permanentDeleteForm(id);
                success++;
            } catch (e) { console.error(e); }
        }
        setForms(prev => prev.filter(f => !selectedIds.has(f.id)));
        toastSuccess(`${success} item(s) ${type === 'bulk-restore' ? 'restored' : 'deleted'}.`);
        clearSelection();
        setProcessing(false);
        setConfirmModal(null);
    };

    return (
        <>
            <Head>
                <title>Forms Trash — FormCraft</title>
            </Head>
            <div className="page">
                <Navbar />
                <div className="container">
                    {/* Page header */}
                    <div className="page-header">
                        <div>
                            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 32 }}>🗑️</span> Forms Trash
                            </h1>
                            <p className="page-subtitle">Manage your deleted forms. Restore them to dashboard or remove forever.</p>
                        </div>
                        <Link href="/dashboard" className="btn btn-secondary">← Back to Dashboard</Link>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : forms.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🗑️</div>
                            <h3>Trash is Empty</h3>
                            <p>Forms you delete will appear here. No deleted forms found.</p>
                            <br />
                            <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
                        </div>
                    ) : (
                        <>
                            <div className="trash-alert fadeIn">
                                <span className="alert-icon">💡</span>
                                <div className="alert-content">
                                    <strong>Advanced Management:</strong> Use search to find specific forms or selections to process multiple items at once.
                                </div>
                            </div>

                            {/* Section Bar for Search & Selection */}
                            <div className="section-bar section-bar-draft animate-in">
                                <div className="section-bar-top">
                                    <div className="section-bar-title">
                                        <span className="section-bar-icon">🔍</span>
                                        <span className="section-bar-title-text" style={{ fontSize: 13, fontWeight: 700 }}>Search Trash</span>
                                    </div>
                                    <div className="section-sel-row">
                                        {selectedIds.size > 0 ? (
                                            <>
                                                <div className="selection-count">{selectedIds.size} selected</div>
                                                <button className="sb-btn sb-btn-active" onClick={() => setConfirmModal({ type: 'bulk-restore' })}>♻️ Restore</button>
                                                <button className="sb-btn sb-btn-danger" onClick={() => setConfirmModal({ type: 'bulk-permanent' })}>❌ Delete</button>
                                                <button className="sb-btn sb-btn-ghost" onClick={clearSelection}>Clear</button>
                                            </>
                                        ) : (
                                            <button className="sb-btn sb-btn-ghost" onClick={selectAll}>Select All</button>
                                        )}
                                    </div>
                                </div>
                                <div className="section-bar-bottom">
                                    <div className="section-search-wrapper">
                                        <span className="section-search-icon">🔍</span>
                                        <input
                                            type="text"
                                            className="section-search-input"
                                            placeholder="Filter deleted forms by name or description..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button className="section-search-clear" onClick={() => setSearchTerm('')}>✕</button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {filteredForms.length === 0 ? (
                                <div className="section-empty animate-in">
                                    <span>🔍 No forms match your search in trash.</span>
                                </div>
                            ) : (
                                <div className="dashboard-grid">
                                    {filteredForms.map((form) => {
                                        const isSelected = selectedIds.has(form.id);
                                        return (
                                            <div key={form.id} className={`form-card trash-item animate-in ${isSelected ? 'form-card-selected' : ''}`} style={{ position: 'relative' }}>
                                                {/* Selection Checkmark - Absolute Top-Right */}
                                                <div className="card-select-checkbox"
                                                    style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 5 }}
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(form.id); }}>
                                                    <div className={`card-select-mark ${isSelected ? 'card-select-checked' : ''}`}>
                                                        {isSelected && (
                                                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="20 6 9 17 4 12"></polyline>
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="form-card-header">
                                                    <div className="form-card-icon trash-icon">
                                                        🗑️
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: '40px' }}>
                                                        <div className={`form-status-badge ${form.isPublished ? 'status-published' : 'status-draft'}`}>
                                                            {form.isPublished ? 'PUBLISHED' : 'DRAFT'}
                                                        </div>
                                                        <div className="trash-badge">TRASHED</div>
                                                    </div>
                                                </div>

                                                <div className="form-card-name" style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                                                    {form.name}
                                                </div>

                                                <p className="form-card-desc">
                                                    {form.description || 'No description provided.'}
                                                </p>

                                                <div className="form-card-footer">
                                                    <div className="form-card-meta">
                                                        <span>📋 {form.fields?.length || 0} fields</span>
                                                        <span>📅 {formatDate(form.deletedAt)}</span>
                                                    </div>

                                                    <div className="form-card-actions">
                                                        <button
                                                            className="sb-btn sb-btn-active"
                                                            style={{ flex: 1, justifyContent: 'center' }}
                                                            onClick={() => setConfirmModal({ type: 'restore', form })}
                                                        >
                                                            ♻️ Restore
                                                        </button>
                                                        <button
                                                            className="sb-btn sb-btn-danger"
                                                            style={{ flex: 1, justifyContent: 'center' }}
                                                            onClick={() => setConfirmModal({ type: 'permanent', form })}
                                                        >
                                                            ❌ Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="confirm-dialog">
                    <div className="confirm-box glass-modal highlight-danger">
                        <div className="confirm-icon">
                            {confirmModal.type.includes('restore') ? '♻️' : '⚠️'}
                        </div>
                        <h3>
                            {confirmModal.type === 'bulk-restore' ? `Restore ${selectedIds.size} Forms` :
                                confirmModal.type === 'bulk-permanent' ? `Delete ${selectedIds.size} Forms` :
                                    confirmModal.type === 'restore' ? 'Restore Form' : 'Delete Permanently'}
                        </h3>
                        <p>
                            {confirmModal.type === 'restore' ? (
                                <>Restore <strong>&quot;{confirmModal.form.name}&quot;</strong> back to your dashboard?</>
                            ) : confirmModal.type === 'bulk-restore' ? (
                                <>Are you sure you want to restore all <strong>{selectedIds.size} selected forms</strong>?</>
                            ) : confirmModal.type === 'bulk-permanent' ? (
                                <>Permanently delete <strong>{selectedIds.size} selected forms</strong>?<br />
                                    <span style={{ color: 'var(--error)', fontSize: 13, display: 'block', marginTop: 8 }}>
                                        ⚠️ This is irreversible. All data from these forms will be LOST.
                                    </span>
                                </>
                            ) : (
                                <>Permanently delete <strong>&quot;{confirmModal.form.name}&quot;</strong>?<br />
                                    <span style={{ color: 'var(--error)', fontSize: 13, display: 'block', marginTop: 8 }}>
                                        ⚠️ This is irreversible. All data will be LOST.
                                    </span>
                                </>
                            )}
                        </p>
                        <div className="confirm-actions">
                            <button className="sb-btn sb-btn-ghost" onClick={() => setConfirmModal(null)} disabled={processing}>Cancel</button>
                            {confirmModal.type.includes('restore') ? (
                                <button className="btn btn-publish" onClick={confirmModal.type === 'bulk-restore' ? handleBulkAction : handleRestore} disabled={processing}
                                    style={{ padding: '8px 24px', borderRadius: 10 }}>
                                    {processing ? 'Processing…' : 'Restore Now'}
                                </button>
                            ) : (
                                <button className="btn btn-danger" onClick={confirmModal.type === 'bulk-permanent' ? handleBulkAction : handlePermanentDelete} disabled={processing}
                                    style={{ padding: '8px 24px', borderRadius: 10 }}>
                                    {processing ? 'Deleting…' : 'Delete Permanently'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .trash-alert {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 16px 20px;
                    background: rgba(239, 68, 68, 0.08);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    border-radius: var(--radius);
                    margin-bottom: 24px;
                    color: #fca5a5;
                    font-size: 14px;
                }
                .alert-icon { font-size: 20px; }
                .trash-item {
                    border-color: rgba(239, 68, 68, 0.15) !important;
                }
                .trash-item:hover {
                    border-color: rgba(239, 68, 68, 0.4) !important;
                    box-shadow: 0 16px 48px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.12);
                }
                .trash-item::before {
                    background: linear-gradient(90deg, var(--error), #f97316) !important;
                }
                .trash-icon {
                    background: rgba(239, 68, 68, 0.15) !important;
                    border-color: rgba(239, 68, 68, 0.25) !important;
                    color: var(--error);
                }
                .trash-badge {
                    font-size: 10px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    color: var(--error);
                    background: rgba(239, 68, 68, 0.12);
                    padding: 4px 10px;
                    border-radius: 20px;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .card-select-checkbox {
                    cursor: pointer;
                }
                .card-select-mark {
                    width: 22px;
                    height: 22px;
                    border: 2.5px solid rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(15, 15, 35, 0.6);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(4px);
                }
                .card-select-checked {
                    background: #6366f1;
                    border-color: #6366f1;
                    box-shadow: 0 0 20px rgba(99, 102, 241, 0.6);
                }
                .form-card-selected {
                    border-color: rgba(99, 102, 241, 0.8) !important;
                    background: rgba(99, 102, 241, 0.08) !important;
                    box-shadow: 0 12px 40px rgba(99, 102, 241, 0.25) !important;
                }
                .form-status-badge {
                    font-size: 10px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    padding: 4px 10px;
                    border-radius: 20px;
                }
                .status-published {
                    color: #10b981;
                    background: rgba(16, 185, 129, 0.12);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }
                .status-draft {
                    color: #f59e0b;
                    background: rgba(245, 158, 11, 0.12);
                    border: 1px solid rgba(245, 158, 11, 0.2);
                }
                .glass-modal {
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    background: rgba(11, 11, 29, 0.95) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
                .highlight-danger::before {
                    content: '';
                    position: absolute; top: 0; left: 0; right: 0; height: 3px;
                    background: linear-gradient(90deg, var(--error), #f97316);
                }
            `}</style>
        </>
    );
}
