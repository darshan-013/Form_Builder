import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAdminWorkflowStatus } from '../../../services/api';
import { toastError } from '../../../services/toast';
import PageContainer from '../../../components/layout/PageContainer';
import SectionHeader from '../../../components/layout/SectionHeader';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Spinner from '../../../components/ui/Spinner';
import Input from '../../../components/ui/Input';

const INITIAL_FILTERS = {
    creator: '',
    status: '',
    step: '',
    fromDate: '',
    toDate: '',
};

export default function AdminWorkflowStatusPage() {
    const router = useRouter();
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
            <Head><title>Monitor Workflows — FormCraft Admin</title></Head>
            
            <PageContainer>
                <SectionHeader 
                    title="🧭 Global Workflow Monitoring"
                    subtitle="Audit and track all active and completed workflows across the entire platform"
                    actions={
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={resetFilters}>
                                Reset
                            </Button>
                            <Button variant="primary" size="sm" onClick={applyFilters}>
                                Apply Filters
                            </Button>
                        </div>
                    }
                />

                <Card className="mb-8 p-4 bg-white/5 border-white/10 mt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <Input
                            placeholder="Creator username"
                            value={filters.creator}
                            onChange={(e) => setFilters((p) => ({ ...p, creator: e.target.value }))}
                        />
                        <select
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all cursor-pointer"
                            value={filters.status}
                            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                        >
                            <option value="">All Statuses</option>
                            <option value="PENDING">PENDING</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="REJECTED">REJECTED</option>
                        </select>
                        <Input
                            type="number"
                            placeholder="Step Index"
                            value={filters.step}
                            onChange={(e) => setFilters((p) => ({ ...p, step: e.target.value }))}
                        />
                        <Input
                            type="date"
                            value={filters.fromDate}
                            onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
                        />
                        <Input
                            type="date"
                            value={filters.toDate}
                            onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
                        />
                    </div>
                </Card>

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <Spinner size="lg" />
                        <p className="text-gray-500 animate-pulse">Fetching global workflow data...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
                        <div className="text-5xl mb-4 opacity-20">🧭</div>
                        <h3 className="text-lg font-medium text-gray-400">No workflow records match your criteria</h3>
                        <Button variant="secondary" size="sm" className="mt-6" onClick={resetFilters}>
                            Clear all filters
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-4 px-1">
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                                {total} Records found
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {rows.map((r) => (
                                <Card key={r.workflowId} className="flex flex-col border-white/5 hover:border-primary/20 transition-all group">
                                    <div className="p-5 border-b border-white/5 bg-white/5 flex justify-between items-start">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-900 dark:text-white truncate">{r.formName}</h3>
                                            <span className="text-xs text-gray-500 font-mono">ID: #{r.workflowId}</span>
                                        </div>
                                        <Badge 
                                            variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}
                                        >
                                            {r.status || 'PENDING'}
                                        </Badge>
                                    </div>
                                    
                                    <div className="p-5 space-y-3 flex-1">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Creator</span>
                                            <span className="font-semibold text-gray-900 dark:text-white">@{r.creator || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Approver</span>
                                            <span className="font-semibold text-gray-900 dark:text-white">@{r.currentApprover || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">Current Step</span>
                                            <Badge variant="ghost" className="font-mono text-[10px]">{r.workflowStep ?? '-'}</Badge>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-black/10 text-[10px] space-y-1 text-gray-500">
                                        <div className="flex justify-between">
                                            <span>Created:</span>
                                            <span>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '-'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Last Update:</span>
                                            <span>{r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : '-'}</span>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </>
                )}

                <div className="mt-10 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard')}>
                        Return to Dashboard
                    </Button>
                </div>
            </PageContainer>
        </>
    );
}
