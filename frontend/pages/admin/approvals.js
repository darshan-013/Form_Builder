import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import WorkflowDiagram from '../../components/workflows/WorkflowDiagram';
import {
    approveWorkflowStep,
    getMyPendingWorkflowSteps,
    rejectWorkflowStep,
} from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';

export default function ApprovalsInboxPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    async function loadRows() {
        setLoading(true);
        try {
            const data = await getMyPendingWorkflowSteps();
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            toastError(err.message || 'Failed to load pending approvals.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadRows();
    }, []);

    function buildSteps(row) {
        const total = Number(row?.totalSteps || 0);
        const targetName = row?.targetBuilder?.name || row?.targetBuilder?.username || 'Target Builder';
        const active = Math.max(1, Number(row?.currentStepIndex || 1));

        const core = Array.from({ length: total }, (_, i) => {
            const oneBased = i + 1;
            let status = 'pending';
            if (oneBased < active) status = 'completed';
            else if (oneBased === active) status = 'active';

            return {
                id: `core-${oneBased}`,
                name: oneBased === total ? targetName : `Authority ${oneBased}`,
                icon: oneBased === total ? 'builder' : 'check',
                role: oneBased === total ? 'Builder' : `Approver ${oneBased}`,
                status,
            };
        });

        return [
            { id: 'start', name: 'Start', icon: 'file', role: 'System', status: 'completed' },
            ...core,
            { id: 'end', name: 'End', icon: 'done', role: 'System', status: 'pending' },
        ];
    }

    async function handleApprove(row) {
        setBusyId(row.stepId);
        try {
            await approveWorkflowStep(row.stepId, 'Approved from inbox');
            toastSuccess('Step approved.');
            await loadRows();
        } catch (err) {
            toastError(err.message || 'Failed to approve step.');
        } finally {
            setBusyId(null);
        }
    }

    async function handleRejectConfirm() {
        if (!rejectTarget) return;

        const comments = rejectReason.trim() || null;
        setBusyId(rejectTarget.stepId);
        try {
            await rejectWorkflowStep(rejectTarget.stepId, comments);
            toastSuccess('Step rejected.');
            await loadRows();
        } catch {
            toastError('Unable to reject this step right now. Please try again.');
        } finally {
            setBusyId(null);
            setRejectTarget(null);
            setRejectReason('');
        }
    }

    return (
        <>
            <Head><title>Approval Inbox — FormCraft</title></Head>
            <Navbar />
            <div className="container workflow-page-shell">
                <div className="workflow-page-head">
                    <h1>Approval Inbox</h1>
                    <p>
                    Steps assigned to you. Only the active step in each workflow can be decided.
                    </p>
                </div>

                {loading ? (
                    <div className="loading-center" style={{ minHeight: 280 }}>
                        <span className="spinner" style={{ width: 34, height: 34 }} />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📥</div>
                        <h3>No pending approvals</h3>
                        <p>You are all clear for now.</p>
                    </div>
                ) : (
                    <div className="workflow-inbox-grid">
                        {rows.map((row) => {
                            const busy = busyId === row.stepId;
                            return (
                                <div key={row.stepId} className="form-card workflow-inbox-card pending">
                                    <div className="workflow-card-head">
                                        <div>
                                            <div className="form-card-name">{row.formName}</div>
                                            <div className="form-card-desc">Workflow #{row.workflowId}</div>
                                        </div>
                                        <span className="status-badge status-badge-draft workflow-decision-badge pending">
                                            PENDING
                                        </span>
                                    </div>

                                    <div className="workflow-quick-meta">
                                        <span>Current Step <strong>{row.currentStepIndex}/{row.totalSteps}</strong></span>
                                        <span>Target <strong>{row.targetBuilder?.name || row.targetBuilder?.username || '—'}</strong></span>
                                    </div>

                                    <WorkflowDiagram steps={buildSteps(row)} />

                                    <div className="workflow-inbox-actions">
                                        <button className="btn btn-primary btn-sm" onClick={() => handleApprove(row)} disabled={busy}>
                                            {busy ? 'Working...' : 'Approve'}
                                        </button>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => {
                                                setRejectTarget(row);
                                                setRejectReason('');
                                            }}
                                            disabled={busy}
                                        >
                                            Reject
                                        </button>
                                        <Link href={`/preview/${row.formId}`} className="btn btn-secondary btn-sm">Preview</Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {rejectTarget && (
                    <div className="workflow-reject-modal-overlay" onClick={() => setRejectTarget(null)}>
                        <div className="workflow-reject-modal" onClick={(e) => e.stopPropagation()}>
                            <h3>Reject Step</h3>
                            <p>
                                Rejecting <strong>{rejectTarget.formName}</strong>. Add an optional reason.
                            </p>
                            <textarea
                                className="form-input workflow-reject-textarea"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Enter rejection reason (optional)"
                                rows={3}
                            />
                            <div className="workflow-reject-actions">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                        setRejectTarget(null);
                                        setRejectReason('');
                                    }}
                                    disabled={busyId === rejectTarget.stepId}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={handleRejectConfirm}
                                    disabled={busyId === rejectTarget.stepId}
                                >
                                    {busyId === rejectTarget.stepId ? 'Rejecting...' : 'Confirm Reject'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}


