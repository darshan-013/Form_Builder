import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import WorkflowDiagram from '../../components/workflows/WorkflowDiagram';
import {
    approveWorkflowStep,
    getMyPendingWorkflowSteps,
    rejectWorkflowStep,
} from '../../services/api';
import { toastError, toastSuccess } from '../../services/toast';
import PageContainer from '../../components/layout/PageContainer';
import SectionHeader from '../../components/layout/SectionHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';

export default function ApprovalsInboxPage() {
    const router = useRouter();
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
            
            <PageContainer>
                <SectionHeader 
                    title="📥 Approval Inbox"
                    subtitle="Decide on workflow steps assigned specifically to your role"
                    actions={
                        <Button variant="secondary" size="sm" onClick={loadRows}>
                            Refresh
                        </Button>
                    }
                />

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <Spinner size="lg" />
                        <p className="text-gray-500 animate-pulse">Checking for pending approvals...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-white/5 rounded-3xl">
                        <div className="text-5xl mb-4 opacity-20">📥</div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">You're all caught up!</h3>
                        <p className="text-gray-500">No pending workflow steps require your attention right now.</p>
                        <Button variant="secondary" size="sm" className="mt-6" onClick={() => router.push('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        {rows.map((row) => {
                            const busy = busyId === row.stepId;
                            return (
                                <Card key={row.stepId} className="flex flex-col border-white/5 overflow-hidden">
                                    <div className="p-5 flex justify-between items-start border-b border-white/5">
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{row.formName}</h3>
                                            <span className="text-xs text-gray-500 font-mono">Workflow #{row.workflowId}</span>
                                        </div>
                                        <Badge variant="warning" pulse>PENDING DECISION</Badge>
                                    </div>

                                    <div className="p-5 flex gap-4 text-xs bg-white/5">
                                        <div className="flex-1">
                                            <span className="text-gray-500 block">Current Step</span>
                                            <span className="font-semibold text-gray-900 dark:text-white">{row.currentStepIndex} of {row.totalSteps}</span>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-gray-500 block">Target Builder</span>
                                            <span className="font-semibold text-gray-900 dark:text-white">{row.targetBuilder?.name || row.targetBuilder?.username || '—'}</span>
                                        </div>
                                    </div>

                                    <div className="p-5 flex-1 min-h-[160px]">
                                        <WorkflowDiagram steps={buildSteps(row)} />
                                    </div>

                                    <div className="p-4 bg-white/5 flex gap-2 border-t border-white/5">
                                        <Button 
                                            variant="primary" 
                                            size="sm" 
                                            className="flex-1" 
                                            onClick={() => handleApprove(row)} 
                                            disabled={busy}
                                        >
                                            {busy ? <Spinner size="sm" /> : 'Approve'}
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="flex-1 border-red-500/20 text-red-500 hover:bg-red-500/10"
                                            onClick={() => {
                                                setRejectTarget(row);
                                                setRejectReason('');
                                            }}
                                            disabled={busy}
                                        >
                                            Reject
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            size="sm"
                                            onClick={() => router.push(`/preview/${row.formId}`)}
                                        >
                                            Preview
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </PageContainer>

            {/* Reject Modal */}
            <Modal
                isOpen={!!rejectTarget}
                onClose={() => setRejectTarget(null)}
                title="Reject Workflow Step"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="secondary" onClick={() => setRejectTarget(null)} disabled={busyId === rejectTarget?.stepId}>
                            Cancel
                        </Button>
                        <Button 
                            variant="primary" 
                            className="bg-red-600 hover:bg-red-700 text-white" 
                            onClick={handleRejectConfirm} 
                            disabled={busyId === rejectTarget?.stepId}
                        >
                            {busyId === rejectTarget?.stepId ? <Spinner size="sm" /> : 'Confirm Reject'}
                        </Button>
                    </div>
                }
            >
                <div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Please provide a reason for rejecting the workflow for <strong className="text-gray-900 dark:text-white">{rejectTarget?.formName}</strong>. This help the requester understand what to fix.
                    </p>
                    <textarea
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all dark:text-white"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Explain why this step is being rejected..."
                        rows={4}
                    />
                </div>
            </Modal>
        </>
    );
}
