import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getMyWorkflowStatus } from '../../services/api';
import { toastError } from '../../services/toast';
import WorkflowDiagram from '../../components/workflows/WorkflowDiagram';

export default function WorkflowStatusPage() {
    const router = useRouter();
    const { workflowId: queryWorkflowId } = router.query;
    
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('ALL');
    const [focusedId, setFocusedId] = useState(null);

    useEffect(() => {
        const stored = sessionStorage.getItem('focusedWorkflowId');
        if (stored) {
            setFocusedId(stored);
            sessionStorage.removeItem('focusedWorkflowId');
        } else if (queryWorkflowId) {
            setFocusedId(queryWorkflowId);
        }
    }, [queryWorkflowId]);

    useEffect(() => {
        getMyWorkflowStatus()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to load workflow status.'))
            .finally(() => setLoading(false));
    }, []);

    const filteredRows = useMemo(() => {
        let list = rows;
        if (focusedId) {
            list = list.filter(r => String(r.workflowId) === String(focusedId));
        }
        if (category === 'ALL') return list;
        return list.filter((r) => String(r.status || '').toUpperCase() === category);
    }, [rows, category, focusedId]);

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

    return (
        <>
            <Head><title>My Workflow Status - FormCraft</title></Head>
            <Navbar />
            <div className="container workflow-page-shell">
                <div className="workflow-page-head">
                    <h1>My Workflow Status</h1>
                </div>

                <div className="workflow-filter-row" role="tablist" aria-label="Workflow category filter">
                    {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((c) => (
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
                    <div className="loading-center" style={{ minHeight: 280 }}>
                        <span className="spinner" style={{ width: 34, height: 34 }} />
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🧭</div>
                        <h3>No workflow records in this category</h3>
                    </div>
                ) : (
                    <div className="workflow-status-grid">
                        {filteredRows.map((r, i) => (
                            <div key={r.workflowId} 
                                className="form-card workflow-status-card animate-slide-up stagger-item hover-premium"
                                style={{ animationDelay: `${i * 0.08}s` }}
                            >
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
                                    <span>Current Step <strong>{r.currentStep ?? '-'} </strong></span>
                                    <span>Submitted <strong>{r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '-'}</strong></span>
                                </div>
                                <div className="workflow-quick-meta">
                                    <span>Last Updated <strong>{r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString('en-IN') : '-'}</strong></span>
                                </div>

                                <div className="workflow-visual-section" style={{ marginTop: 16 }}>
                                    <WorkflowDiagram steps={buildSteps(r)} activeStepIndex={r.currentStep} />
                                </div>

                                <div style={{ marginTop: 14, textAlign: 'right' }}>
                                    <Link 
                                        href={`/preview/${r.formId}`} 
                                        className="btn btn-outline btn-sm"
                                    >
                                        👁 Preview Form
                                    </Link>
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
