import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { approveWorkflowById, getPendingWorkflowReviews, rejectWorkflowById } from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';
import PageContainer from '../../components/layout/PageContainer';
import SectionHeader from '../../components/layout/SectionHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

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
            <Head><title>Workflow Review — FormCraft</title></Head>
            
            <PageContainer>
                <SectionHeader 
                    title="✅ Pending Reviews"
                    subtitle="Approve or reject forms awaiting your decision"
                    actions={
                        <Link href="/dashboard">
                            <Button variant="secondary" size="sm">Back to Dashboard</Button>
                        </Link>
                    }
                />

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <Spinner size="lg" />
                        <p className="text-gray-500 animate-pulse">Loading pending reviews...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-white/5 rounded-2xl">
                        <div className="text-5xl mb-4 opacity-20">✅</div>
                        <h3 className="text-lg font-medium">Clear!</h3>
                        <p className="text-gray-500">No workflows are currently pending your review.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rows.map((r) => (
                            <Card key={r.workflowId} className="group hover:border-primary/30 transition-colors">
                                <div className="p-5 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">
                                                {r.formName}
                                            </h3>
                                            <p className="text-xs text-gray-500">Workflow #{r.workflowId}</p>
                                        </div>
                                        <Badge variant="warning">
                                            {r.status || 'PENDING'}
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-100 dark:border-white/5 text-xs">
                                        <div>
                                            <p className="text-gray-400 mb-0.5">Creator</p>
                                            <p className="font-medium text-gray-900 dark:text-white">{r.creatorName || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 mb-0.5">Step</p>
                                            <p className="font-medium text-gray-900 dark:text-white">{r.currentStep ?? '-'}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-gray-400 mb-0.5">Submitted On</p>
                                            <p className="font-medium text-gray-500">
                                                {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            className="flex-1"
                                            disabled={busyId === r.workflowId}
                                            onClick={() => handleApprove(r.workflowId)}
                                        >
                                            {busyId === r.workflowId ? <Spinner size="sm" /> : 'Approve'}
                                        </Button>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            className="flex-1"
                                            disabled={busyId === r.workflowId}
                                            onClick={() => handleReject(r.workflowId)}
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </PageContainer>
        </>
    );
}
