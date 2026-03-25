import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getForm, getFormVersions, deleteFormVersion, publishVersion } from '../../../services/api';
import Navbar from '../../../components/Navbar';
import { showSuccess, showError, showWarning } from '../../../services/toast';

export default function VersionHistory() {
    const router = useRouter();
    const { id } = router.query;
    const [form, setForm] = useState(null);
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actioning, setActioning] = useState(null);
    const [confirmModal, setConfirmModal] = useState(null); // { type: 'delete'|'publish', versionId, versionNumber }

    useEffect(() => {
        if (id) fetchData();
    }, [id]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [formRes, versionsRes] = await Promise.all([
                getForm(id),
                getFormVersions(id)
            ]);
            setForm(formRes);
            setVersions(versionsRes);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch version history');
        } finally {
            setLoading(false);
        }
    };

    const handleActionConfirm = async () => {
        if (!confirmModal) return;
        const { type, versionId, versionNumber } = confirmModal;
        setConfirmModal(null);
        
        try {
            setActioning(versionId);
            if (type === 'delete') {
                await deleteFormVersion(id, versionId);
                showSuccess(`Version v${versionNumber} deleted.`);
                fetchData(); // reload list
            } else if (type === 'publish') {
                await publishVersion(id, versionId);
                showSuccess(`Version v${versionNumber} activated! It is now Live.`);
                fetchData(); // reload list
            }
        } catch (err) {
            showError(`Action failed: ` + (err.response?.data?.message || err.message));
        } finally {
            setActioning(null);
        }
    };

    const statusLabel = (status) => {
        if (status === 'PUBLISHED') return '✦ Live';
        return '✎ Draft';
    };

    if (loading) return (
        <div className="vh-page">
            <Navbar />
            <div className="loading-state">
                <div className="spinner" />
                <span>Loading version history…</span>
            </div>
        </div>
    );

    if (error) return (
        <div className="vh-page">
            <Navbar />
            <div className="empty-state"><span>⚠️</span> {error}</div>
        </div>
    );

    return (
        <div className="vh-page">
            <Head>
                <title>Versions — {form?.name || 'Form'}</title>
            </Head>
            <Navbar />

            {/* ── Confirm Modal ─────────────────────────────────────────── */}
            {confirmModal && (
                <div className="modal-backdrop" onClick={() => setConfirmModal(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon">
                            {confirmModal.type === 'delete' ? '🗑️' : '🚀'}
                        </div>
                        <h3>
                            {confirmModal.type === 'delete' && `Delete v${confirmModal.versionNumber}?`}
                            {confirmModal.type === 'publish' && `Activate v${confirmModal.versionNumber}?`}
                        </h3>
                        <p>
                            {confirmModal.type === 'delete' && "This will permanently delete this version. It cannot be recovered."}
                            {confirmModal.type === 'publish' && "Activating a new version will permanently delete all in-progress draft submissions for this form. This action is irreversible. It will also make this Draft the Live version, moving any previously Published version to Drafts."}
                        </p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}>Cancel</button>
                            <button 
                                className={`btn ${confirmModal.type === 'delete' ? 'btn-danger' : 'btn-primary'}`} 
                                onClick={handleActionConfirm}
                            >
                                {confirmModal.type === 'delete' ? 'Yes, Delete' : 'Yes, Activate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="vh-container">
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="vh-header">
                    <Link href="/dashboard" className="back-link">← Back</Link>
                    <h1>{form?.name}</h1>
                    {form?.description && <p className="vh-desc">{form.description}</p>}
                    <div className="vh-meta-bar">
                        <span className="meta-chip">{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                {/* ── Timeline ───────────────────────────────────────────── */}
                <div className="timeline">
                    {versions.map((v, index) => {
                        const st = v.status.toLowerCase(); // 'published' | 'draft'
                        const isLast = index === versions.length - 1;
                        return (
                            <div key={v.id} className={`tl-item ${st}`}>
                                {/* Left — connector */}
                                <div className="tl-connector">
                                    <div className="tl-dot" />
                                    {!isLast && <div className="tl-line" />}
                                </div>

                                {/* Right — card */}
                                <div className={`tl-card ${st === 'published' ? 'card-active' : ''}`}>
                                    {st === 'published' && (
                                        <div className="live-ribbon">LIVE</div>
                                    )}
                                    <div className="card-top">
                                        <div className="card-title-row">
                                            <span className="v-num">v{v.versionNumber}</span>
                                            <span className={`badge badge-${st}`}>{statusLabel(v.status)}</span>
                                        </div>
                                        <div className="card-actions">
                                            {st === 'draft' && (
                                                <button
                                                    className="btn btn-sm btn-primary action-btn-publish"
                                                    onClick={() => setConfirmModal({ type: 'publish', versionId: v.id, versionNumber: v.versionNumber })}
                                                    disabled={!!actioning}
                                                    style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                                                >
                                                    {actioning === v.id ? '⌛' : '🚀 Activate'}
                                                </button>
                                            )}
                                            {st !== 'published' && (
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={() => setConfirmModal({ type: 'delete', versionId: v.id, versionNumber: v.versionNumber })}
                                                    disabled={!!actioning}
                                                    style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                                                >
                                                    {actioning === v.id ? '⌛' : '🗑️ Delete'}
                                                </button>
                                            )}
                                            <Link href={`/builder/${id}?versionId=${v.id}`} className="btn btn-sm btn-ghost">
                                                👁 View
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="card-meta">
                                        <span>Created {new Date(v.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        {v.publishedAt && <span>Published {new Date(v.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                                        {v.createdBy && <span>by {v.createdBy}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style jsx>{`
                /* ── Base ─────────────────────────────────────────────────── */
                .vh-page {
                    min-height: 100vh;
                    background: var(--bg-base);
                    color: var(--text-primary);
                }
                .loading-state, .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    padding: 120px 24px;
                    color: var(--text-muted);
                    font-size: 1.1rem;
                }
                .spinner {
                    width: 36px; height: 36px;
                    border: 3px solid var(--border);
                    border-top-color: var(--primary, #6366f1);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* ── Layout ───────────────────────────────────────────────── */
                .vh-container {
                    max-width: 780px;
                    margin: 0 auto;
                    padding: 48px 24px 80px;
                }

                /* ── Header ───────────────────────────────────────────────── */
                .back-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.9rem;
                    color: var(--text-muted);
                    text-decoration: none;
                    margin-bottom: 20px;
                    transition: color 0.15s;
                }
                .back-link:hover { color: var(--text-primary); }
                h1 {
                    font-size: 2.2rem;
                    font-weight: 800;
                    letter-spacing: -0.03em;
                    margin: 0 0 8px;
                }
                .vh-desc {
                    color: var(--text-secondary);
                    font-size: 1rem;
                    margin: 0 0 16px;
                }
                .vh-meta-bar { display: flex; gap: 8px; margin-bottom: 48px; }
                .meta-chip {
                    font-size: 0.8rem;
                    font-weight: 600;
                    padding: 4px 12px;
                    border-radius: 999px;
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    color: var(--text-muted);
                }

                /* ── Timeline ─────────────────────────────────────────────── */
                .timeline { position: relative; }

                .tl-item {
                    display: flex;
                    gap: 24px;
                    align-items: flex-start;
                }

                /* Left connector column */
                .tl-connector {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    flex-shrink: 0;
                    width: 20px;
                    padding-top: 20px;
                }
                .tl-dot {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    border: 3px solid var(--text-muted);
                    background: var(--bg-base);
                    flex-shrink: 0;
                    z-index: 2;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .tl-line {
                    width: 2px;
                    flex: 1;
                    min-height: 32px;
                    background: var(--border);
                    margin: 6px 0;
                    opacity: 0.45;
                }

                /* Dot colors by status */
                .tl-item.published .tl-dot {
                    border-color: var(--success);
                    background: var(--success);
                    box-shadow: 0 0 0 4px rgba(16,185,129,0.15), 0 0 18px rgba(16,185,129,0.35);
                }
                .tl-item.draft .tl-dot {
                    border-color: var(--warning);
                    box-shadow: 0 0 12px rgba(245,158,11,0.3);
                }

                /* ── Cards ────────────────────────────────────────────────── */
                .tl-card {
                    flex: 1;
                    position: relative;
                    padding: 20px 22px;
                    margin-bottom: 20px;
                    border: 1px solid var(--border);
                    border-radius: 14px;
                    background: var(--bg-card);
                    transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
                    overflow: hidden;
                }
                .tl-card:hover {
                    transform: translateY(-2px);
                    border-color: var(--border-hover, rgba(255,255,255,0.15));
                    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
                }

                /* Active (PUBLISHED) card — elevated */
                .card-active {
                    border-color: rgba(16,185,129,0.4);
                    background: linear-gradient(135deg, rgba(16,185,129,0.07) 0%, var(--bg-card) 60%);
                    box-shadow: 0 0 0 1px rgba(16,185,129,0.2), 0 4px 24px rgba(16,185,129,0.12);
                    transform: scale(1.012);
                }
                .card-active:hover {
                    transform: scale(1.012) translateY(-2px);
                    box-shadow: 0 0 0 1px rgba(16,185,129,0.35), 0 12px 40px rgba(16,185,129,0.18);
                }

                /* Live ribbon */
                .live-ribbon {
                    position: absolute;
                    top: 0; right: 24px;
                    background: var(--success);
                    color: #fff;
                    font-size: 9px;
                    font-weight: 800;
                    letter-spacing: 0.12em;
                    padding: 3px 10px 4px;
                    border-radius: 0 0 8px 8px;
                }

                /* Card rows */
                .card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .card-title-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .v-num {
                    font-size: 1.5rem;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                }
                .card-meta {
                    margin-top: 10px;
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    font-size: 0.82rem;
                    color: var(--text-muted);
                }
                .card-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-shrink: 0;
                }

                /* ── Badges ───────────────────────────────────────────────── */
                .badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 3px 11px;
                    border-radius: 999px;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.07em;
                    white-space: nowrap;
                }
                .badge-published { background: rgba(16,185,129,0.15); color: var(--success); border: 1px solid rgba(16,185,129,0.25); }
                .badge-draft     { background: rgba(245,158,11,0.15);  color: var(--warning); border: 1px solid rgba(245,158,11,0.25); }

                /* ── Buttons ──────────────────────────────────────────────── */
                .btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    padding: 8px 18px;
                    transition: all 0.15s;
                    text-decoration: none;
                }
                .btn-sm { padding: 6px 14px; font-size: 0.82rem; }
                .btn-ghost {
                    background: transparent;
                    color: var(--text-secondary);
                    border: 1px solid var(--border);
                }
                .btn-ghost:hover { background: var(--bg-card-hover); color: var(--text-primary); }
                .btn-outline {
                    background: transparent;
                    color: var(--text-secondary);
                    border: 1px solid var(--border);
                }
                .btn-outline:hover { border-color: var(--success); color: var(--success); }
                .btn-primary {
                    background: var(--accent-2, #6366f1);
                    color: #fff;
                }
                .btn-primary:hover { background: var(--accent, #4f46e5); }
                .btn:disabled { opacity: 0.5; cursor: not-allowed; }

                /* ── Modal ────────────────────────────────────────────────── */
                .modal-backdrop {
                    position: fixed; inset: 0; z-index: 9999;
                    background: rgba(0,0,0,0.5);
                    display: flex; align-items: center; justify-content: center;
                    padding: 24px;
                    backdrop-filter: blur(4px);
                    animation: fadeIn 0.15s ease;
                }
                .modal-box {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 18px;
                    padding: 36px 32px 28px;
                    max-width: 440px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 24px 80px rgba(0,0,0,0.4);
                    animation: slideUp 0.2s ease;
                }
                .modal-icon { font-size: 2.5rem; margin-bottom: 12px; }
                .modal-box h3 { font-size: 1.3rem; font-weight: 700; margin: 0 0 10px; }
                .modal-box p { color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; margin: 0 0 24px; }
                .modal-actions { display: flex; gap: 10px; justify-content: center; }

                @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

                /* ── Light theme overrides ────────────────────────────────── */
                [data-theme="light"] .card-active {
                    background: linear-gradient(135deg, rgba(16,185,129,0.06) 0%, #fff 60%);
                }
            `}</style>
        </div>
    );
}
