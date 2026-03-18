import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { approveWorkflowById, getOverallWorkflowReviews, rejectWorkflowById } from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';
import WorkflowDiagram from '../../components/workflows/WorkflowDiagram';

export default function WorkflowReviewPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [category, setCategory] = useState('ALL');

    useEffect(() => {
        getOverallWorkflowReviews()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to load workflow reviews.'))
            .finally(() => setLoading(false));
    }, []);

    const filteredRows = useMemo(() => {
        if (category === 'ALL') return rows;
        return rows.filter((r) => String(r.status || '').toUpperCase() === category);
    }, [rows, category]);

    function buildSteps(row) {
        const total = Number(row?.totalSteps || 0);
        const targetName = row?.targetBuilderName || 'Target Builder';
        const active = Number(row?.currentStep ?? 0);

        const core = Array.from({ length: total }, (_, i) => {
            const oneBased = i + 1;
            let status = 'pending';
            if (oneBased < active) status = 'completed';
            else if (oneBased === active) {
                status = (row.status === 'REJECTED') ? 'rejected' : 'active';
            } else if (oneBased > active && row.status === 'APPROVED') {
                status = 'completed';
            }

            return {
                id: `step-${oneBased}`,
                name: oneBased === total ? targetName : `Authority ${oneBased}`,
                icon: oneBased === total ? 'builder' : 'check',
                role: oneBased === total ? 'Builder' : `Approver ${oneBased}`,
                status,
            };
        });

        return [
            { id: 'start', name: 'Start', icon: 'file', role: 'System', status: 'completed' },
            ...core,
            { id: 'end', name: 'End', icon: 'done', role: 'System', status: (row.status === 'APPROVED' ? 'completed' : 'pending') },
        ];
    }

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
                <div className="workflow-filter-row" role="tablist" aria-label="Workflow category filter" style={{ marginBottom: 20 }}>
                    {['ALL', 'PENDING', 'ACTIVE', 'REJECTED', 'APPROVED'].map((c) => (
                        <button
                            key={c}
                            type="button"
                            className={`workflow-filter-chip${category === c ? ' active' : ''}`}
                            onClick={() => setCategory(c)}
                            role="tab"
                            aria-selected={category === c}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="loading-center" style={{ minHeight: 260 }}>
                        <span className="spinner" style={{ width: 34, height: 34 }} />
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">✅</div>
                        <h3>No workflows in this category</h3>
                    </div>
                ) : (
                    <div className="workflow-status-grid">
                        {filteredRows.map((r) => (
                            <div key={r.workflowId} className="form-card workflow-status-card">
                                <div className="form-card-header workflow-card-head">
                                    <div>
                                        <div className="form-card-name" style={{ marginBottom: 2 }}>{r.formName}</div>
                                        <div className="form-card-desc">Workflow #{r.workflowId} | {r.formId}</div>
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

                                <div className="workflow-visual-section" style={{ marginTop: 16 }}>
                                    <WorkflowDiagram steps={buildSteps(r)} activeStepIndex={r.currentStep} />
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                                    {r.canAction && (
                                        <>
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
                                        </>
                                    )}
                                    <Link 
                                        href={`/preview/${r.formId}`} 
                                        className="btn btn-outline btn-sm"
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        👁 Preview Form
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

                <div style={{ marginTop: 14, marginBottom: 20 }}>
                    <Link href="/dashboard" className="btn btn-secondary btn-sm">Back to Dashboard</Link>
                </div>
            </div>
        </>
    );
}

