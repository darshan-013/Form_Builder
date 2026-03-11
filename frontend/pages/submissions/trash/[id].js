import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import { getTrashSubmissions, restoreSubmission, permanentDeleteSubmission, getForm, getMe } from '../../../services/api';
import { toastSuccess, toastError } from '../../../services/toast';

export default function SubmissionsTrashPage() {
    const router = useRouter();
    const { id: formId } = router.query;

    const [submissions, setSubmissions] = useState([]);
    const [form, setForm] = useState(null);
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmModal, setConfirmModal] = useState(null); // { type: 'restore'|'permanent'|'bulk-restore'|'bulk-permanent', submission? }
    const [processing, setProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [page, setPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        if (!formId) return;
        getMe()
            .catch(() => router.replace('/login'))
            .then(() => Promise.all([
                getForm(formId),
                getTrashSubmissions(formId),
            ]))
            .then(([formData, trashData]) => {
                setForm(formData);
                setFields(Array.isArray(formData?.fields) ? formData.fields.filter(f => f.fieldType !== 'field_group') : []);
                setSubmissions(Array.isArray(trashData) ? trashData : []);
            })
            .catch(() => toastError('Failed to load trash.'))
            .finally(() => setLoading(false));
    }, [formId, router]);

    const formatDate = (dt) =>
        dt ? new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const formatId = (id) => id ? String(id).substring(0, 8).toUpperCase() : '—';

    const filteredSubmissions = submissions.filter(sub => {
        if (!searchTerm) return true;
        const lowSearch = searchTerm.toLowerCase();
        // Search in ID
        if (sub.id?.toLowerCase().includes(lowSearch)) return true;
        // Search in all field values
        return Object.values(sub).some(val =>
            val !== null && val !== undefined && String(val).toLowerCase().includes(lowSearch)
        );
    });

    const toggleSelection = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const selectAll = () => setSelectedIds(new Set(filteredSubmissions.map(s => s.id)));
    const clearSelection = () => setSelectedIds(new Set());

    const formatCellValue = (value) => {
        if (value === null || value === undefined || value === '') return <span style={{ color: '#94a3b8' }}>—</span>;
        const str = String(value);
        if (str.startsWith('[') || str.startsWith('{')) {
            try {
                const parsed = JSON.parse(str);
                if (Array.isArray(parsed)) return parsed.join(', ');
                return JSON.stringify(parsed);
            } catch { /* ignore */ }
        }
        if (str.startsWith('"') && str.endsWith('"')) {
            try { return JSON.parse(str); } catch { /* ignore */ }
        }
        return str.length > 60 ? str.slice(0, 60) + '…' : str;
    };

    const handleRestore = async () => {
        if (!confirmModal?.submission) return;
        setProcessing(true);
        try {
            await restoreSubmission(formId, confirmModal.submission.id);
            setSubmissions((prev) => prev.filter((s) => s.id !== confirmModal.submission.id));
            toastSuccess('Submission restored successfully! 🎉');
        } catch { toastError('Failed to restore submission.'); }
        finally { setProcessing(false); setConfirmModal(null); }
    };

    const handlePermanentDelete = async (subId) => {
        const targetId = typeof subId === 'string' ? subId : confirmModal?.submission?.id;
        if (!targetId) return;
        setProcessing(true);
        try {
            await permanentDeleteSubmission(formId, targetId);
            setSubmissions((prev) => prev.filter((s) => s.id !== targetId));
            setSelectedIds(p => { const n = new Set(p); n.delete(targetId); return n; });
            toastSuccess('Submission permanently deleted.');
        } catch { toastError('Failed to permanently delete submission.'); }
        finally { setProcessing(false); setConfirmModal(null); }
    };

    const handleBulkAction = async () => {
        const type = confirmModal.type;
        setProcessing(true);
        let success = 0;
        const ids = [...selectedIds];
        for (const id of ids) {
            try {
                if (type === 'bulk-restore') await restoreSubmission(formId, id);
                else await permanentDeleteSubmission(formId, id);
                success++;
            } catch (e) { console.error(e); }
        }
        setSubmissions(prev => prev.filter(s => !selectedIds.has(s.id)));
        toastSuccess(`${success} item(s) ${type === 'bulk-restore' ? 'restored' : 'deleted'}.`);
        clearSelection();
        setProcessing(false);
        setConfirmModal(null);
    };

    const totalPages = Math.ceil(filteredSubmissions.length / pageSize);
    const pagedSubmissions = filteredSubmissions.slice((page - 1) * pageSize, page * pageSize);

    // Show first 4 fields columns to keep table manageable
    const displayFields = fields.slice(0, 4);

    return (
        <>
            <Head>
                <title>{form ? `${form.name} — Submissions Trash` : 'Submissions Trash'} — FormCraft</title>
            </Head>
            <div className="page">
                <Navbar />
                <div className="container">
                    {/* Header */}
                    <div className="page-header">
                        <div>
                            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 32 }}>🗑️</span>
                                {form ? `"${form.name}" — Deleted Submissions` : 'Submission Trash'}
                            </h1>
                            <p className="page-subtitle">Deleted submissions. Restore or permanently remove them.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {formId && <Link href={`/submissions/${formId}`} className="btn btn-secondary">← Active Submissions</Link>}
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-center"><span className="spinner" style={{ width: 36, height: 36 }} /></div>
                    ) : submissions.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🗑️</div>
                            <h3>Submission Trash is Empty</h3>
                            <p>No deleted submissions found for this form.</p>
                            <br />
                            {formId && <Link href={`/submissions/${formId}`} className="btn btn-primary">View Active Submissions</Link>}
                        </div>
                    ) : (
                        <>
                            <div className="trash-alert fadeIn">
                                <span className="alert-icon">💡</span>
                                <div className="alert-content">
                                    <strong>Advanced Management:</strong> Use search to find specific values or use selections to restore or delete multiple submissions at once.
                                </div>
                            </div>

                            {/* Section Bar for Search & Selection */}
                            <div className="section-bar section-bar-draft animate-in">
                                <div className="section-bar-top">
                                    <div className="section-bar-title">
                                        <span className="section-bar-icon">🔍</span>
                                        <span className="section-bar-title-text" style={{ fontSize: 13, fontWeight: 700 }}>Search Submissions</span>
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
                                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Select items to enable actions</div>
                                        )}
                                    </div>
                                </div>
                                <div className="section-bar-bottom">
                                    <div className="section-search-wrapper">
                                        <span className="section-search-icon">🔍</span>
                                        <input
                                            type="text"
                                            className="section-search-input"
                                            placeholder="Search in IDs or any submission data..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button className="section-search-clear" onClick={() => setSearchTerm('')}>✕</button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="datatable-wrapper glass-container highlight-table">
                                <table className="datatable">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40, textAlign: 'center' }}>
                                                <div className="th-select" onClick={selectedIds.size === filteredSubmissions.length ? clearSelection : selectAll}>
                                                    <div className={`card-select-mark ${selectedIds.size > 0 && selectedIds.size === filteredSubmissions.length ? 'card-select-checked' : ''}`}
                                                        style={{ margin: 0 }}>
                                                        {selectedIds.size > 0 && selectedIds.size === filteredSubmissions.length && '✓'}
                                                    </div>
                                                </div>
                                            </th>
                                            <th style={{ width: 110 }}>ID</th>
                                            <th style={{ width: 160 }}>Submitted</th>
                                            <th style={{ width: 160 }}>Deleted</th>
                                            {displayFields.map((f) => <th key={f.fieldKey}>{f.label}</th>)}
                                            <th style={{ width: 200, textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedSubmissions.length === 0 ? (
                                            <tr>
                                                <td colSpan={displayFields.length + 5} style={{ textAlign: 'center', padding: '40px 0', opacity: 0.6 }}>
                                                    🔍 No deleted submissions match your search.
                                                </td>
                                            </tr>
                                        ) : (
                                            pagedSubmissions.map((sub) => (
                                                <tr key={sub.id} className={`trash-row ${selectedIds.has(sub.id) ? 'row-selected' : ''}`}>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div className="td-select" onClick={() => toggleSelection(sub.id)}>
                                                            <div className={`card-select-mark ${selectedIds.has(sub.id) ? 'card-select-checked' : ''}`}
                                                                style={{ margin: 0 }}>
                                                                {selectedIds.has(sub.id) && '✓'}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="id-badge">
                                                            {formatId(sub.id)}
                                                        </span>
                                                    </td>
                                                    <td className="date-cell">{formatDate(sub.created_at)}</td>
                                                    <td className="date-cell error-text">{formatDate(sub.deleted_at)}</td>
                                                    {displayFields.map((f) => (
                                                        <td key={f.fieldKey} className="data-cell">
                                                            {formatCellValue(sub[f.fieldKey])}
                                                        </td>
                                                    ))}
                                                    <td>
                                                        <div className="row-actions">
                                                            <button
                                                                className="sb-btn sb-btn-active"
                                                                onClick={() => setConfirmModal({ type: 'restore', submission: sub })}
                                                            >♻️ Restore</button>
                                                            <button
                                                                className="sb-btn sb-btn-danger"
                                                                onClick={() => setConfirmModal({ type: 'permanent', submission: sub })}
                                                            >❌ Delete</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="datatable-pagination animate-in" style={{ marginTop: 24 }}>
                                    <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Previous</button>
                                    <div className="pagination-pages">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                            <button key={p} className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => setPage(p)}>{p}</button>
                                        ))}
                                    </div>
                                    <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
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
                            {confirmModal.type === 'bulk-restore' ? `Restore ${selectedIds.size} Submissions` :
                                confirmModal.type === 'bulk-permanent' ? `Delete ${selectedIds.size} Submissions` :
                                    confirmModal.type === 'restore' ? 'Restore Submission' : 'Delete Permanently'}
                        </h3>
                        <p>
                            {confirmModal.type === 'restore' ? (
                                <>Restore submission <strong>{formatId(confirmModal.submission?.id)}</strong> back to active?</>
                            ) : confirmModal.type === 'bulk-restore' ? (
                                <>Are you sure you want to restore all <strong>{selectedIds.size} selected submissions</strong>?</>
                            ) : confirmModal.type === 'bulk-permanent' ? (
                                <>Permanently delete <strong>{selectedIds.size} selected submissions</strong>?<br />
                                    <span style={{ color: 'var(--error)', fontSize: 13, display: 'block', marginTop: 8 }}>
                                        ⚠️ This is irreversible. All data from these submissions will be LOST.
                                    </span>
                                </>
                            ) : (
                                <>Permanently delete submission <strong>{formatId(confirmModal.submission?.id)}</strong>?<br />
                                    <span style={{ color: 'var(--error)', fontSize: 13, display: 'block', marginTop: 8 }}>
                                        ⚠️ This is irreversible.
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
                .glass-container {
                    background: var(--bg-card);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid var(--border);
                    border-radius: var(--radius);
                    overflow: hidden;
                    box-shadow: var(--shadow);
                }
                .highlight-table {
                    border-color: rgba(239, 68, 68, 0.15);
                }
                .datatable {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }
                .datatable thead th {
                    background: rgba(255, 255, 255, 0.03);
                    padding: 14px 20px;
                    text-align: left;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: var(--text-muted);
                    border-bottom: 1px solid var(--border);
                }
                .trash-row {
                    transition: var(--transition-fast);
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                }
                .trash-row:hover {
                    background: rgba(239, 68, 68, 0.04);
                }
                .row-selected {
                    background: rgba(239, 68, 68, 0.08) !important;
                }
                .datatable tbody td {
                    padding: 14px 20px;
                    color: var(--text-secondary);
                }
                .th-select, .td-select {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    cursor: pointer;
                    height: 100%;
                }
                .card-select-mark {
                    width: 18px;
                    height: 18px;
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: white;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .card-select-checked {
                    background: var(--error);
                    border-color: var(--error);
                    box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
                }
                .id-badge {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 11px;
                    background: rgba(239, 68, 68, 0.12);
                    color: var(--error);
                    padding: 4px 8px;
                    border-radius: 6px;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .date-cell { font-size: 13px; font-weight: 500; }
                .error-text { color: var(--error); }
                .data-cell {
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-size: 13px;
                }
                .row-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                }
                .glass-modal {
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
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
