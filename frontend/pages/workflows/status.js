import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import WorkflowDiagram from '../../components/workflows/WorkflowDiagram';
import { useAuth } from '../../context/AuthContext';
import { getMyWorkflowStatus } from '../../services/api';
import { toastError } from '../../services/toast';

export default function WorkflowStatusPage() {
    const { hasRole } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('ALL');

    useEffect(() => {
        getMyWorkflowStatus()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to load workflow status.'))
            .finally(() => setLoading(false));
    }, []);

    function normalizeDecision(value) {
        const v = String(value || 'PENDING').toLowerCase();
        if (v === 'approved') return 'approved';
        if (v === 'rejected') return 'rejected';
        return 'pending';
    }

    const filteredRows = rows.filter((r) => {
        if (category === 'ALL') return true;
        const normalized = normalizeDecision(r.finalDecision || r.status).toUpperCase();
        return normalized === category;
    });

    function buildSteps(row) {
        const totalSteps = Number(row?.totalSteps || 0);
        const activeStep = Math.max(1, Number(row?.currentStepIndex || 1));
        const decision = normalizeDecision(row?.finalDecision || row?.status);

        const backendChain = Array.isArray(row?.flowChain) ? row.flowChain : [];
        const core = backendChain.length
            ? backendChain.map((name, i) => ({
                id: `core-${i + 1}`,
                name,
                icon: i === backendChain.length - 1 ? 'builder' : 'check',
                role: i === backendChain.length - 1 ? 'Builder' : `Authority ${i + 1}`,
            }))
            : Array.from({ length: totalSteps }, (_, i) => ({
                id: `core-${i + 1}`,
                name: i === totalSteps - 1 ? 'Target Builder' : `Step ${i + 1}`,
                icon: i === totalSteps - 1 ? 'builder' : 'check',
                role: i === totalSteps - 1 ? 'Builder' : `Authority ${i + 1}`,
            }));

        const out = [{ id: 'start', name: 'Start', icon: 'file', role: 'System', status: 'completed' }];

        core.forEach((step, idx) => {
            const oneBased = idx + 1;
            let status = 'pending';

            if (decision === 'approved') {
                status = 'completed';
            } else if (decision === 'rejected') {
                if (oneBased < activeStep) status = 'completed';
                else if (oneBased === activeStep) status = 'rejected';
                else status = 'pending';
            } else {
                if (oneBased < activeStep) status = 'completed';
                else if (oneBased === activeStep) status = 'active';
                else status = 'pending';
            }

            out.push({ ...step, status });
        });

        out.push({
            id: 'end',
            name: 'End',
            icon: 'done',
            role: 'System',
            status: decision === 'approved' ? 'completed' : decision === 'rejected' ? 'rejected' : 'pending',
        });

        if (hasRole('Viewer') && decision === 'rejected') {
            return out.map((step) => ({ ...step, status: 'rejected' }));
        }

        return out;
    }

    return (
        <>
            <Head><title>Workflow Status — FormCraft</title></Head>
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
                        <p>Try another category or start a workflow from a draft form.</p>
                    </div>
                ) : (
                    <div className="workflow-status-grid">
                        {filteredRows.map((r) => {
                            const decisionClass = normalizeDecision(r.finalDecision || r.status);
                            return (
                                <div key={r.workflowId} className={`form-card workflow-status-card ${decisionClass}`}>
                                    <div className="form-card-header workflow-card-head">
                                        <div>
                                            <div className="form-card-name" style={{ marginBottom: 2 }}>{r.formName}</div>
                                            <div className="form-card-desc">Workflow #{r.workflowId}</div>
                                        </div>
                                        <span className={`status-badge status-badge-draft workflow-decision-badge ${decisionClass}`}>
                                            {r.finalDecision || 'PENDING'}
                                        </span>
                                    </div>

                                    <div className="workflow-quick-meta">
                                        <span>Current Step <strong>{r.currentStepIndex}/{r.totalSteps}</strong></span>
                                        <span>Status <strong>{r.status || '—'}</strong></span>
                                    </div>

                                    <WorkflowDiagram steps={buildSteps(r)} />

                                    <div className="wf-chain-text">
                                        {r.currentFlowView || (r.flowChain || []).join(' -> ') || 'No flow chain available'}
                                    </div>

                                    {r.finalDecision === 'REJECTED' && (
                                        <div className="workflow-rejection-note">
                                            {r.finalComments || 'Rejected by approver. Please update the form and resubmit.'}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={{ marginTop: 14, marginBottom: 20 }}>
                    <Link href="/dashboard" className="btn btn-secondary btn-sm">Back to Dashboard</Link>
                </div>
            </div>
        </>
    );
}



