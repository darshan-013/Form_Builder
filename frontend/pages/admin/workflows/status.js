import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import { getAdminWorkflowStatus } from '../../../services/api';
import { toastError } from '../../../services/toast';

const INITIAL_FILTERS = {
    creator: '',
    status: '',
    step: '',
    fromDate: '',
    toDate: '',
};

export default function AdminWorkflowStatusPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState(INITIAL_FILTERS);

    useEffect(() => {
        getAdminWorkflowStatus()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to load admin workflow status.'))
            .finally(() => setLoading(false));
    }, []);

    async function applyFilters() {
        setLoading(true);
        try {
            const payload = {
                ...filters,
                fromDate: filters.fromDate ? `${filters.fromDate}T00:00:00` : '',
                toDate: filters.toDate ? `${filters.toDate}T23:59:59` : '',
            };
            const data = await getAdminWorkflowStatus(payload);
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            toastError(err.message || 'Failed to apply filters.');
        } finally {
            setLoading(false);
        }
    }

    function resetFilters() {
        setFilters(INITIAL_FILTERS);
        setLoading(true);
        getAdminWorkflowStatus()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to reload workflow status.'))
            .finally(() => setLoading(false));
    }

    const total = useMemo(() => rows.length, [rows]);

    return (
        <>
            <Head><title>Admin Workflow Monitoring - FormCraft</title></Head>
            <Navbar />
            <div className="container workflow-page-shell">
                <div className="workflow-page-head">
                    <h1>Admin Workflow Monitoring</h1>
                </div>

                <div className="section-bar section-bar-draft" style={{ marginBottom: 12 }}>
                    <div className="section-bar-bottom" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <input
                            className="form-input"
                            style={{ width: 200 }}
                            placeholder="Creator"
                            value={filters.creator}
                            onChange={(e) => setFilters((p) => ({ ...p, creator: e.target.value }))}
                        />
                        <select
                            className="form-input"
                            style={{ width: 170 }}
                            value={filters.status}
                            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                        >
                            <option value="">All Statuses</option>
                            <option value="PENDING">PENDING</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="REJECTED">REJECTED</option>
                        </select>
                        <input
                            type="number"
                            className="form-input"
                            style={{ width: 140 }}
                            placeholder="Step"
                            value={filters.step}
                            onChange={(e) => setFilters((p) => ({ ...p, step: e.target.value }))}
                        />
                        <input
                            type="date"
                            className="form-input"
                            value={filters.fromDate}
                            onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
                        />
                        <input
                            type="date"
                            className="form-input"
                            value={filters.toDate}
                            onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
                        />
                        <button className="btn btn-primary btn-sm" onClick={applyFilters}>Apply</button>
                        <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Reset</button>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>Total: {total}</span>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-center" style={{ minHeight: 260 }}>
                        <span className="spinner" style={{ width: 34, height: 34 }} />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🧭</div>
                        <h3>No workflow records found</h3>
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
                                    <span>Creator <strong>{r.creator || '-'}</strong></span>
                                    <span>Approver <strong>{r.currentApprover || '-'}</strong></span>
                                </div>
                                <div className="workflow-quick-meta">
                                    <span>Step <strong>{r.workflowStep ?? '-'}</strong></span>
                                    <span>Created <strong>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '-'}</strong></span>
                                </div>
                                <div className="workflow-quick-meta">
                                    <span>Updated <strong>{r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : '-'}</strong></span>
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

