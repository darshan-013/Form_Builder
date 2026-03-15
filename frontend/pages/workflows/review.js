import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { approveWorkflowById, getPendingWorkflowReviews, rejectWorkflowById } from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';

export default function WorkflowReviewPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        getPendingWorkflowReviews()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to load pending workflows.'))
            .finally(() => setLoading(false));
    }, []);

    async function handleApprove(workflowId) {
        const comments = window.prompt('Approval comments (optional):') || null;
        setBusyId(workflowId);
        try {
            await approveWorkflowById(workflowId, comments);
            setRows((prev) => prev.filter((r) => r.workflowId !== workflowId));
            toastSuccess('Workflow approved.');
        } catch (err) {
            toastError(err.message || 'Failed to approve workflow.');
        } finally {
            setBusyId(null);
        }
    }

    async function handleReject(workflowId) {
        const comments = window.prompt('Rejection comments:');
        if (comments == null) return;
        setBusyId(workflowId);
        try {
            await rejectWorkflowById(workflowId, comments);
            setRows((prev) => prev.filter((r) => r.workflowId !== workflowId));
            toastSuccess('Workflow rejected.');
        } catch (err) {
            toastError(err.message || 'Failed to reject workflow.');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <Head><title>Workflow Review - FormCraft</title></Head>
            <Navbar />
            <div className="container workflow-page-shell">
                <div className="workflow-page-head">
                    <h1>Pending Workflow Reviews</h1>
                </div>

                {loading ? (
                    <div className="loading-center" style={{ minHeight: 260 }}>
                        <span className="spinner" style={{ width: 34, height: 34 }} />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">✅</div>
                        <h3>No workflows pending your review</h3>
                    </div>
                ) : (
                    <div className="workflow-status-grid">
                        {rows.map((r) => (
                            <div key={r.workflowId} className="form-card workflow-status-card">
                                <div className="form-card-header workflow-card-head">
                                    <div>
                                        <div className="form-card-name" style={{ marginBottom: 2 }}>{r.formName}</div>
                                        <div className="form-card-desc">Workflow #{r.workflowId}</div>
                                    </div>
                                    <span className="status-badge status-badge-draft workflow-decision-badge">
                                        {r.status || 'PENDING'}
                                    </span>
                                </div>

                                <div className="workflow-quick-meta">
                                    <span>Creator <strong>{r.creatorName || '-'}</strong></span>
                                    <span>Step <strong>{r.currentStep ?? '-'}</strong></span>
                                </div>
                                <div className="workflow-quick-meta">
                                    <span>Submitted <strong>{r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '-'}</strong></span>
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        disabled={busyId === r.workflowId}
                                        onClick={() => handleApprove(r.workflowId)}
                                    >
                                        Approve
                                    </button>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        disabled={busyId === r.workflowId}
                                        onClick={() => handleReject(r.workflowId)}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: 14, marginBottom: 20 }}>
                    <Link href="/dashboard" className="btn btn-secondary btn-sm">Back to Dashboard</Link>
                </div>
            </div>
        </>
    );
}

