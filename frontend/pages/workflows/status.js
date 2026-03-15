import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getMyWorkflowStatus } from '../../services/api';
import { toastError } from '../../services/toast';
import PageContainer from '../../components/layout/PageContainer';
import SectionHeader from '../../components/layout/SectionHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

export default function WorkflowStatusPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('ALL');

    useEffect(() => {
        getMyWorkflowStatus()
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => toastError(err.message || 'Failed to load workflow status.'))
            .finally(() => setLoading(false));
    }, []);

    const filteredRows = useMemo(() => {
        if (category === 'ALL') return rows;
        return rows.filter((r) => String(r.status || '').toUpperCase() === category);
    }, [rows, category]);

    const stats = {
        ALL: rows.length,
        PENDING: rows.filter(r => String(r.status || '').toUpperCase() === 'PENDING').length,
        APPROVED: rows.filter(r => String(r.status || '').toUpperCase() === 'APPROVED').length,
        REJECTED: rows.filter(r => String(r.status || '').toUpperCase() === 'REJECTED').length,
    };

    return (
        <>
            <Head><title>My Workflow Status — FormCraft</title></Head>
            
            <PageContainer>
                <SectionHeader 
                    title="🧭 My Workflow Status"
                    subtitle="Track the approval progress of your submitted forms"
                    actions={
                        <Link href="/dashboard">
                            <Button variant="secondary" size="sm">Back to Dashboard</Button>
                        </Link>
                    }
                />

                <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                    {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((c) => (
                        <Button
                            key={c}
                            variant={category === c ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setCategory(c)}
                        >
                            {c} <span className="ml-1.5 opacity-60 text-xs">{stats[c]}</span>
                        </Button>
                    ))}
                </div>

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <Spinner size="lg" />
                        <p className="text-gray-500 animate-pulse">Loading workflow status...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-white/5 rounded-2xl">
                        <div className="text-5xl mb-4 opacity-20">🧭</div>
                        <h3 className="text-lg font-medium">No workflow records found</h3>
                        <p className="text-gray-500">Records in category &quot;{category}&quot; will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredRows.map((r) => (
                            <Card key={r.workflowId} className="group hover:scale-[1.02] transition-transform">
                                <div className="p-5 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors">
                                                {r.formName}
                                            </h3>
                                            <p className="text-xs text-gray-500">Workflow #{r.workflowId}</p>
                                        </div>
                                        <Badge variant={
                                            r.status === 'APPROVED' ? 'success' : 
                                            r.status === 'REJECTED' ? 'danger' : 
                                            'warning'
                                        }>
                                            {r.status || 'PENDING'}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-white/5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">Current Step</span>
                                            <span className="font-medium">{r.currentStep ?? '-'}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">Submitted</span>
                                            <span className="font-medium text-gray-500">
                                                {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">Last Update</span>
                                            <span className="font-medium text-gray-500">
                                                {r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}
                                            </span>
                                        </div>
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
